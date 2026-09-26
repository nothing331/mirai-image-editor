import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";

export const ORIGINAL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const EDITOR_BASE_MAX_BYTES = 30 * 1024 * 1024;
const STAGING_BUCKET = "mirai-asset-staging";
const ASSET_BUCKET = "mirai-assets";

type AssetState = "reserved" | "uploading" | "uploaded" | "finalizing" | "ready" | "cleaning" | "cancelled" | "expired";
interface UploadRecord {
  id: string;
  owner_id: string;
  request_key: string;
  state: AssetState;
  declared_bytes: number;
  original_name: string;
  original_mime: "image/png" | "image/jpeg";
  staging_key: string;
  source_key: string;
  base_key: string;
  source_sha256: string | null;
  base_sha256: string | null;
  width: number | null;
  height: number | null;
  updated_at: string;
  expires_at: string;
  staging_deleted_at: string | null;
}

export class AssetError extends Error {
  constructor(readonly code: "invalid" | "too-large" | "quota" | "not-found" | "conflict" | "unavailable", message: string) {
    super(message);
    this.name = "AssetError";
  }
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function admin() { return createAdminSupabaseClient(); }

function record(value: unknown): UploadRecord {
  if (!value || typeof value !== "object" || !("id" in value)) {
    throw new AssetError("unavailable", "The upload service is unavailable.");
  }
  return value as UploadRecord;
}

export async function reserveOriginalUpload(ownerId: string, input: {
  requestKey: string; originalName: string; mediaType: "image/png" | "image/jpeg"; bytes: number;
}): Promise<UploadRecord> {
  if (!Number.isInteger(input.bytes) || input.bytes < 1 || input.bytes > ORIGINAL_UPLOAD_MAX_BYTES) {
    throw new AssetError("too-large", "Choose an image smaller than 10 MiB.");
  }
  const client = admin();
  const { data, error } = await client.rpc("mirai_reserve_original_upload", {
    target_owner: ownerId,
    target_id: randomUUID(),
    target_request_key: input.requestKey,
    target_name: input.originalName,
    target_mime: input.mediaType,
    target_bytes: input.bytes,
  });
  if (error) {
    if (error.message.includes("allowance")) throw new AssetError("quota", "Storage allowance reached.");
    if (error.message.includes("request key reused")) throw new AssetError("conflict", "This upload request was already used for another file.");
    throw new AssetError("unavailable", "The upload could not be reserved.");
  }
  return record(data);
}

export async function findOwnedUpload(ownerId: string, id: string): Promise<UploadRecord> {
  const { data, error } = await admin().from("asset_uploads").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new AssetError("unavailable", "The upload could not be read.");
  if (!data) throw new AssetError("not-found", "Upload not found.");
  return record(data);
}

async function transition(ownerId: string, id: string, from: AssetState, to: AssetState): Promise<boolean> {
  const { data, error } = await admin().from("asset_uploads")
    .update({ state: to, updated_at: new Date().toISOString() })
    .eq("owner_id", ownerId).eq("id", id).eq("state", from).select("id").maybeSingle();
  if (error) throw new AssetError("unavailable", "The upload state could not be changed.");
  return Boolean(data);
}

export async function readBoundedBody(request: Request, expectedBytes: number): Promise<Uint8Array> {
  const length = Number(request.headers.get("content-length"));
  if (!Number.isInteger(length) || length !== expectedBytes || length > ORIGINAL_UPLOAD_MAX_BYTES) {
    throw new AssetError("too-large", "Upload size does not match the reservation.");
  }
  if (!request.body) throw new AssetError("invalid", "The uploaded file is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedBytes || total > ORIGINAL_UPLOAD_MAX_BYTES) {
        await reader.cancel();
        throw new AssetError("too-large", "Upload size exceeds the reservation.");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (total !== expectedBytes) throw new AssetError("invalid", "The uploaded file is incomplete.");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function matchesSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "image/png") return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
  return bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217;
}

export async function normalizeOriginal(source: Uint8Array, mime: "image/png" | "image/jpeg") {
  if (!matchesSignature(source, mime)) throw new AssetError("invalid", "The file does not match its image type.");
  try {
    const image = sharp(source, { failOn: "error", limitInputPixels: 4_194_304 });
    const meta = await image.metadata();
    if (meta.format !== (mime === "image/png" ? "png" : "jpeg") || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height) {
      throw new AssetError("invalid", "Use a single-frame PNG or JPEG.");
    }
    const orientationSwapsAxes = [5, 6, 7, 8].includes(meta.orientation ?? 1);
    const width = orientationSwapsAxes ? meta.height : meta.width;
    const height = orientationSwapsAxes ? meta.width : meta.height;
    if (width > 2_048 || height > 2_048 || width * height > 4_194_304) {
      throw new AssetError("too-large", "Image dimensions exceed the 2,048 pixel edge limit.");
    }
    const base = await image.rotate().toColourspace("srgb").png({ compressionLevel: 9 }).toBuffer();
    if (base.byteLength > EDITOR_BASE_MAX_BYTES) throw new AssetError("too-large", "The editor copy exceeds the supported size.");
    return { base, width, height, sourceSha256: hash(source), baseSha256: hash(base) };
  } catch (error) {
    if (error instanceof AssetError) throw error;
    throw new AssetError("invalid", "The image could not be decoded safely.");
  }
}

async function downloadExact(bucket: string, key: string, expectedHash?: string) {
  const { data, error } = await admin().storage.from(bucket).download(key);
  if (error || !data) throw new AssetError("unavailable", "The stored upload could not be read.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (expectedHash && hash(bytes) !== expectedHash) throw new AssetError("conflict", "Stored image bytes differ from this upload.");
  return bytes;
}

async function uploadImmutable(bucket: string, key: string, bytes: Uint8Array, mime: string) {
  const { error } = await admin().storage.from(bucket).upload(key, Buffer.from(bytes), {
    contentType: mime, upsert: false, cacheControl: "private, no-store",
  });
  if (!error) return;
  // A lost acknowledgement is safe to retry only if the immutable object has the expected bytes.
  await downloadExact(bucket, key, hash(bytes));
}

export async function uploadOriginalBytes(ownerId: string, id: string, request: Request) {
  let upload = await findOwnedUpload(ownerId, id);
  if (upload.state === "uploading" && Date.now() - new Date(upload.updated_at).getTime() > 5 * 60_000) {
    await transition(ownerId, id, "uploading", "reserved");
    upload = await findOwnedUpload(ownerId, id);
  }
  if (upload.state !== "reserved" && upload.state !== "uploaded") throw new AssetError("conflict", "Upload is not ready for transfer.");
  if (new Date(upload.expires_at).getTime() <= Date.now()) throw new AssetError("conflict", "Upload reservation expired.");
  const bytes = await readBoundedBody(request, upload.declared_bytes);
  if (!matchesSignature(bytes, upload.original_mime)) throw new AssetError("invalid", "The file does not match its image type.");
  if (upload.state === "uploaded") {
    await downloadExact(STAGING_BUCKET, upload.staging_key, hash(bytes));
    return;
  }
  if (!await transition(ownerId, id, "reserved", "uploading")) throw new AssetError("conflict", "Another transfer is in progress.");
  try {
    await uploadImmutable(STAGING_BUCKET, upload.staging_key, bytes, upload.original_mime);
    if (!await transition(ownerId, id, "uploading", "uploaded")) throw new AssetError("conflict", "Upload state changed during transfer.");
  } catch (error) {
    await transition(ownerId, id, "uploading", "reserved").catch(() => {});
    throw error;
  }
}

export async function finalizeOriginalUpload(ownerId: string, id: string) {
  let upload = await findOwnedUpload(ownerId, id);
  if (upload.state === "ready") {
    await clearReadyStaging(upload);
    return receipt(upload);
  }
  if (upload.state !== "uploaded" && upload.state !== "finalizing") throw new AssetError("conflict", "Upload has not completed.");
  if (new Date(upload.expires_at).getTime() <= Date.now()) throw new AssetError("conflict", "Upload reservation expired.");
  if (upload.state === "uploaded" && !await transition(ownerId, id, "uploaded", "finalizing")) {
    throw new AssetError("conflict", "Another finalization is in progress.");
  }
  upload = await findOwnedUpload(ownerId, id);
  const source = await downloadExact(STAGING_BUCKET, upload.staging_key);
  if (source.byteLength !== upload.declared_bytes) {
    await transition(ownerId, id, "finalizing", "uploaded");
    throw new AssetError("invalid", "Stored file size differs from the reservation.");
  }
  let normalized: Awaited<ReturnType<typeof normalizeOriginal>>;
  try { normalized = await normalizeOriginal(source, upload.original_mime); }
  catch (error) {
    if (error instanceof AssetError && (error.code === "invalid" || error.code === "too-large")) {
      await transition(ownerId, id, "finalizing", "uploaded");
    }
    throw error;
  }
  await uploadImmutable(ASSET_BUCKET, upload.source_key, source, upload.original_mime);
  await uploadImmutable(ASSET_BUCKET, upload.base_key, normalized.base, "image/png");
  const { data, error } = await admin().rpc("mirai_finish_original_upload", {
    target_id: id, target_owner: ownerId,
    target_source_sha: normalized.sourceSha256,
    target_base_sha: normalized.baseSha256,
    target_source_bytes: source.byteLength,
    target_base_bytes: normalized.base.byteLength,
    target_width: normalized.width,
    target_height: normalized.height,
  });
  if (error) throw new AssetError("unavailable", "The upload could not be finalized. Retry finalization.");
  const ready = record(data);
  await clearReadyStaging(ready);
  return receipt(ready);
}

async function clearReadyStaging(upload: UploadRecord) {
  if (upload.staging_deleted_at) return;
  const client = admin();
  const { error } = await client.storage.from(STAGING_BUCKET).remove([upload.staging_key]);
  if (error) throw new AssetError("unavailable", "The original is saved, but staging cleanup needs a retry.");
  const updated = await client.from("asset_uploads")
    .update({ staging_deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", upload.id).eq("owner_id", upload.owner_id).eq("state", "ready")
    .is("staging_deleted_at", null);
  if (updated.error) throw new AssetError("unavailable", "The original is saved, but staging cleanup needs a retry.");
}

function receipt(upload: UploadRecord) {
  return { id: upload.id, width: upload.width, height: upload.height,
    originalName: upload.original_name, originalMediaType: upload.original_mime,
    sourceSha256: upload.source_sha256, baseSha256: upload.base_sha256 };
}

export async function signedOriginalRead(ownerId: string, id: string, role: "source" | "base") {
  const upload = await findOwnedUpload(ownerId, id);
  if (upload.state !== "ready") throw new AssetError("not-found", "Image not found.");
  const key = role === "source" ? upload.source_key : upload.base_key;
  const { data, error } = await admin().storage.from(ASSET_BUCKET).createSignedUrl(key, 60);
  if (error || !data) throw new AssetError("unavailable", "The private image could not be opened.");
  return { url: data.signedUrl, expiresIn: 60 };
}

export async function cancelOriginalUpload(ownerId: string, id: string) {
  const upload = await findOwnedUpload(ownerId, id);
  if (upload.state === "cancelled" || upload.state === "expired") return;
  if (upload.state === "cleaning") {
    await cleanUploadObjects(upload);
    await transition(ownerId, id, "cleaning", "cancelled");
    return;
  }
  if (upload.state === "ready") throw new AssetError("conflict", "A finalized original cannot be cancelled here.");
  if ((upload.state === "uploading" || upload.state === "finalizing") &&
      Date.now() - new Date(upload.updated_at).getTime() <= 5 * 60_000) {
    throw new AssetError("conflict", "Wait for the current transfer to finish, then retry.");
  }
  if (!await transition(ownerId, id, upload.state, "cleaning")) throw new AssetError("conflict", "Upload state changed. Retry cancellation.");
  await cleanUploadObjects(upload);
  await transition(ownerId, id, "cleaning", "cancelled");
}

async function cleanUploadObjects(upload: UploadRecord) {
  const client = admin();
  const staging = await client.storage.from(STAGING_BUCKET).remove([upload.staging_key]);
  if (staging.error) throw new AssetError("unavailable", "Staged upload cleanup failed.");
  const committed = await client.storage.from(ASSET_BUCKET).remove([upload.source_key, upload.base_key]);
  if (committed.error) throw new AssetError("unavailable", "Derived upload cleanup failed.");
}

/** Safe to rerun after a worker interruption; cleaning rows continue to count against quota. */
export async function reconcileExpiredOriginalUploads(limit = 50): Promise<number> {
  const client = admin();
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data, error } = await client.from("asset_uploads").select("*")
    .in("state", ["reserved", "uploading", "uploaded", "finalizing"])
    .lt("expires_at", stale).order("expires_at", { ascending: true }).limit(limit);
  if (error) throw new AssetError("unavailable", "Expired uploads could not be listed.");
  const unfinished = await client.from("asset_uploads").select("*").eq("state", "cleaning").limit(limit);
  if (unfinished.error) throw new AssetError("unavailable", "Incomplete cleanup could not be listed.");
  let cleaned = 0;
  for (const row of [...(unfinished.data ?? []), ...(data ?? [])]) {
    const upload = record(row);
    if (upload.state !== "cleaning" && !await transition(upload.owner_id, upload.id, upload.state, "cleaning")) continue;
    await cleanUploadObjects(upload);
    if (await transition(upload.owner_id, upload.id, "cleaning", "expired")) cleaned++;
  }
  const pendingStaging = await client.from("asset_uploads").select("*")
    .eq("state", "ready").is("staging_deleted_at", null).limit(limit);
  if (pendingStaging.error) throw new AssetError("unavailable", "Committed upload cleanup could not be listed.");
  for (const row of pendingStaging.data ?? []) await clearReadyStaging(record(row));
  return cleaned;
}
