import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const bucket = "mirai-cloud-spike";
const requiredVariables = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY"];

for (const name of requiredVariables) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}
if (process.env.CLOUD_SPIKE_CONFIRM !== "synthetic-only") {
  throw new Error("Set CLOUD_SPIKE_CONFIRM=synthetic-only to acknowledge that this probe creates and removes synthetic fixtures.");
}

const url = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const runId = randomUUID();
const admin = client(secretKey);
const createdUserIds = [];
let ownerClient;
let ownerPath;
let probeId;

try {
  const owner = await syntheticUser("owner");
  const foreign = await syntheticUser("foreign");
  createdUserIds.push(owner.user.id, foreign.user.id);
  ownerClient = owner.client;
  ownerPath = `${owner.user.id}/${runId}.png`;
  probeId = randomUUID();

  const { error: insertError } = await owner.client.from("cloud_spike_ownership_probes").insert({
    id: probeId,
    owner_id: owner.user.id,
    label: `wave-a-${runId}`,
  });
  assertNoError(insertError, "owner metadata insert");

  const { data: ownerRows, error: ownerReadError } = await owner.client
    .from("cloud_spike_ownership_probes")
    .select("id, owner_id")
    .eq("id", probeId);
  assertNoError(ownerReadError, "owner metadata read");
  if (ownerRows?.length !== 1 || ownerRows[0].owner_id !== owner.user.id) {
    throw new Error("Owner could not read the expected metadata probe.");
  }

  const { data: foreignRows, error: foreignReadError } = await foreign.client
    .from("cloud_spike_ownership_probes")
    .select("id")
    .eq("id", probeId);
  assertNoError(foreignReadError, "foreign metadata read");
  if (foreignRows?.length !== 0) throw new Error("RLS exposed owner metadata to the foreign user.");

  const { error: forgedInsertError } = await foreign.client.from("cloud_spike_ownership_probes").insert({
    id: randomUUID(),
    owner_id: owner.user.id,
    label: "forged-owner",
  });
  if (!forgedInsertError) throw new Error("RLS allowed the foreign user to forge owner metadata.");

  const png = await sharp({
    create: { width: 64, height: 64, channels: 4, background: { r: 216, g: 244, b: 65, alpha: 1 } },
  }).png().toBuffer();
  const { data: uploadGrant, error: uploadGrantError } = await owner.client.storage.from(bucket).createSignedUploadUrl(ownerPath);
  assertNoError(uploadGrantError, "owner signed upload grant");
  const { error: uploadError } = await owner.client.storage
    .from(bucket)
    .uploadToSignedUrl(ownerPath, uploadGrant.token, png, { contentType: "image/png" });
  assertNoError(uploadError, "owner signed upload");

  const { data: downloaded, error: downloadError } = await owner.client.storage.from(bucket).download(ownerPath);
  assertNoError(downloadError, "owner object download");
  if (downloaded.size !== png.byteLength) throw new Error("Downloaded object size does not match the uploaded fixture.");

  const { error: foreignDownloadError } = await foreign.client.storage.from(bucket).download(ownerPath);
  if (!foreignDownloadError) throw new Error("Storage policy exposed the owner's object to the foreign user.");

  const publicUrl = owner.client.storage.from(bucket).getPublicUrl(ownerPath).data.publicUrl;
  const anonymousResponse = await fetch(publicUrl, { redirect: "manual" });
  if (anonymousResponse.ok) throw new Error("Private bucket object was anonymously readable.");

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    synthetic: true,
    runId,
    checks: {
      ownerMetadataRead: "passed",
      foreignMetadataReadDenied: "passed",
      forgedOwnerInsertDenied: "passed",
      signedUploadAndOwnerDownload: "passed",
      foreignObjectReadDenied: "passed",
      anonymousObjectReadDenied: "passed",
    },
    fixtureBytes: png.byteLength,
  }, null, 2)}\n`);
} finally {
  if (ownerClient && ownerPath) await ownerClient.storage.from(bucket).remove([ownerPath]);
  if (ownerClient && probeId) await ownerClient.from("cloud_spike_ownership_probes").delete().eq("id", probeId);
  for (const userId of createdUserIds.reverse()) await admin.auth.admin.deleteUser(userId);
}

async function syntheticUser(role) {
  const email = `mirai-cloud-spike-${role}-${runId}@example.com`;
  const password = `${randomBytes(24).toString("base64url")}Aa1!`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { fixture: "mirai-cloud-spike" },
  });
  assertNoError(createError, `${role} user creation`);
  const scopedClient = client(publishableKey);
  const { data: session, error: signInError } = await scopedClient.auth.signInWithPassword({ email, password });
  assertNoError(signInError, `${role} user sign-in`);
  if (!session.user) throw new Error(`${role} user sign-in returned no user.`);
  return { user: created.user, client: scopedClient };
}

function client(key) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function assertNoError(error, label) {
  if (error) throw new Error(`${label} failed: ${error.message}`);
}
