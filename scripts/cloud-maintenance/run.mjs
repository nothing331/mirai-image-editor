import { createClient } from "@supabase/supabase-js";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Maintenance requires SUPABASE_URL and SUPABASE_SECRET_KEY.");
const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const bucket = "mirai-assets";

async function rows(table, columns, column, value) {
  const { data, error } = await client.from(table).select(columns).eq(column, value);
  if (error) throw new Error(`Could not read ${table}.`);
  return data ?? [];
}

async function removeObjects(keys) {
  for (let offset = 0; offset < keys.length; offset += 50) {
    const { error } = await client.storage.from(bucket).remove(keys.slice(offset, offset + 50));
    if (error) throw new Error("Private object deletion failed.");
  }
}

async function reconcileAiResults() {
  const expired = await client.rpc("mirai_expire_ai_leases");
  if (expired.error) throw new Error("AI lease reconciliation failed.");
  const scan = await client.from("ai_attempts").select("id").gt("storage_bytes", 0)
    .not("status", "in", "(running,unknown)")
    .or(`status.in.(failed,discarded,cleaning),expires_at.lte.${new Date().toISOString()}`).order("expires_at").limit(50);
  if (scan.error) throw new Error("AI temporary result scan failed.");
  for (const attempt of scan.data ?? []) {
    const claimed = await client.rpc("mirai_claim_ai_cleanup", { target_id: attempt.id });
    if (claimed.error) throw new Error("AI cleanup claim failed.");
    if (!claimed.data) continue;
    const deleted = await client.storage.from("mirai-ai-results").remove([claimed.data]);
    if (deleted.error) throw new Error("AI temporary result deletion failed.");
    const finished = await client.rpc("mirai_finish_ai_cleanup", { target_id: attempt.id });
    if (finished.error) throw new Error("AI cleanup confirmation failed.");
  }
}

async function reconcileOriginalUploads() {
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const expired = await client.from("asset_uploads").select("id,owner_id,state,staging_key,source_key,base_key")
    .in("state", ["reserved", "uploading", "uploaded", "finalizing"])
    .lt("expires_at", stale).limit(30);
  const cleaning = await client.from("asset_uploads").select("id,owner_id,state,staging_key,source_key,base_key")
    .eq("state", "cleaning").limit(30);
  if (expired.error || cleaning.error) throw new Error("Expired upload scan failed.");
  for (const upload of [...(cleaning.data ?? []), ...(expired.data ?? [])]) {
    if (upload.state !== "cleaning") {
      const changed = await client.from("asset_uploads").update({ state: "cleaning", updated_at: new Date().toISOString() })
        .eq("id", upload.id).eq("owner_id", upload.owner_id).eq("state", upload.state).select("id").maybeSingle();
      if (changed.error || !changed.data) continue;
    }
    const staging = await client.storage.from("mirai-asset-staging").remove([upload.staging_key]);
    if (staging.error) throw new Error("Expired staged upload deletion failed.");
    await removeObjects([upload.source_key, upload.base_key]);
    const finished = await client.from("asset_uploads").update({ state: "expired", updated_at: new Date().toISOString() })
      .eq("id", upload.id).eq("state", "cleaning");
    if (finished.error) throw new Error("Expired upload state update failed.");
  }
  const readyStaging = await client.from("asset_uploads").select("id,staging_key")
    .eq("state", "ready").is("staging_deleted_at", null).limit(30);
  if (readyStaging.error) throw new Error("Ready upload staging scan failed.");
  for (const upload of readyStaging.data ?? []) {
    const removed = await client.storage.from("mirai-asset-staging").remove([upload.staging_key]);
    if (removed.error) throw new Error("Ready staging cleanup failed.");
    const updated = await client.from("asset_uploads")
      .update({ staging_deleted_at: new Date().toISOString() }).eq("id", upload.id).eq("state", "ready");
    if (updated.error) throw new Error("Ready staging state update failed.");
  }
}

async function reconcileOrphanEdits() {
  const stale = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const old = await client.from("cloud_edit_assets").select("id,state")
    .in("state", ["reserved", "ready", "cleaning"]).lt("updated_at", stale).limit(30);
  if (old.error) throw new Error("Orphan edit scan failed.");
  for (const item of old.data ?? []) {
    const claimed = await client.rpc("mirai_claim_orphan_edit_cleanup", { target_id: item.id });
    if (claimed.error) throw new Error("Orphan edit claim failed.");
    if (!claimed.data) continue;
    await removeObjects([claimed.data.storage_key]);
    const finished = await client.rpc("mirai_finish_orphan_edit_cleanup", { target_id: item.id });
    if (finished.error || !finished.data) throw new Error("Orphan edit cleanup failed.");
  }
}

async function purgeProject(task) {
  const projects = await rows("cloud_projects", "id,owner_id,status,original_upload_id", "id", task.project_id);
  const project = projects.find((row) => row.owner_id === task.owner_id && row.status === "purging");
  if (!project) throw new Error("Purging project record is missing.");
  const uploads = await rows("asset_uploads", "id,source_key,base_key,staging_key", "id", project.original_upload_id);
  const edits = await allRows("cloud_edit_assets", "storage_key,created_at", "project_id", project.id);
  const upload = uploads[0];
  if (!upload) throw new Error("Original asset record is missing.");
  await removeObjects([upload.source_key, upload.base_key, ...edits.map((row) => row.storage_key)]);
  const { error: stagingError } = await client.storage.from("mirai-asset-staging").remove([upload.staging_key]);
  if (stagingError) throw new Error("Staging object deletion failed.");
  const { error } = await client.rpc("mirai_finish_project_purge", { target_id: task.id });
  if (error) throw new Error("Project purge transaction failed.");
}

async function purgeAccount(task) {
  const pendingAi = await client.from("ai_attempts").select("id").eq("owner_id", task.owner_id).in("status", ["running", "unknown"]).limit(1);
  if (pendingAi.error || pendingAi.data?.length) throw new Error("Account AI outcomes require reconciliation before purge.");
  const aiResults = await allRows("ai_attempts", "id,result_key,created_at", "owner_id", task.owner_id);
  for (const result of aiResults) {
    const removed = await client.storage.from("mirai-ai-results").remove([result.result_key]);
    if (removed.error) throw new Error("Account AI result cleanup failed.");
  }
  const projects = await rows("cloud_projects", "id", "owner_id", task.owner_id);
  if (projects.length) throw new Error("Project purge is still pending.");
  for (;;) {
    const uploads = await client.from("asset_uploads").select("id,source_key,base_key,staging_key")
      .eq("owner_id", task.owner_id).limit(50);
    if (uploads.error) throw new Error("Orphan upload scan failed.");
    if (!uploads.data?.length) break;
    for (const upload of uploads.data) {
      await removeObjects([upload.source_key, upload.base_key]);
      const staging = await client.storage.from("mirai-asset-staging").remove([upload.staging_key]);
      if (staging.error) throw new Error("Orphan staging deletion failed.");
      const removed = await client.from("asset_uploads").delete().eq("id", upload.id).eq("owner_id", task.owner_id);
      if (removed.error) throw new Error("Orphan upload record deletion failed.");
    }
  }
  const invitations = await client.from("invitations").delete().eq("invited_by", task.owner_id);
  if (invitations.error) throw new Error("Invitation cleanup failed.");
  const exports = await allRows("mirai_maintenance_tasks", "id,result_key,created_at", "owner_id", task.owner_id);
  const exportKeys = exports.filter((item) => item.id !== task.id)
    .map((item) => item.result_key ?? `${task.owner_id}/${item.id}.tar.gz`);
  for (let offset = 0; offset < exportKeys.length; offset += 50) {
    const removed = await client.storage.from("mirai-exports").remove(exportKeys.slice(offset, offset + 50));
    if (removed.error) throw new Error("Export cleanup failed.");
  }
  const deleted = await client.auth.admin.deleteUser(task.owner_id);
  if (deleted.error && !deleted.error.message.toLowerCase().includes("not found"))
    throw new Error("Auth identity deletion failed.");
  const finished = await client.rpc("mirai_finish_account_purge", { target_id: task.id });
  if (finished.error) throw new Error("Account purge completion failed.");
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
  header.fill(32, 148, 156);
  header.write("0", 156, 1, "ascii");
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  const checksum = header.reduce((total, byte) => total + byte, 0);
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return header;
}

async function* archiveEntries(entries) {
  for (const entry of entries) {
    const bytes = await entry.bytes();
    yield tarHeader(entry.name, bytes.length);
    yield bytes;
    const padding = (512 - bytes.length % 512) % 512;
    if (padding) yield Buffer.alloc(padding);
  }
  yield Buffer.alloc(1024);
}

async function assetBytes(key) {
  const { data, error } = await client.storage.from(bucket).download(key);
  if (error || !data) throw new Error("An account asset could not be read.");
  return Buffer.from(await data.arrayBuffer());
}

async function allRows(table, columns, column, value) {
  const result = [];
  for (let offset = 0; offset < 100_000; offset += 100) {
    const { data, error } = await client.from(table).select(columns)
      .eq(column, value).order("created_at", { ascending: true })
      .order("id", { ascending: true }).range(offset, offset + 99);
    if (error) throw new Error(`Could not read ${table} for export.`);
    result.push(...(data ?? []));
    if ((data ?? []).length < 100) break;
    if (offset === 99_900) throw new Error(`Too many ${table} rows for a bounded export.`);
  }
  return result;
}

async function exportAccount(task) {
  const profiles = await rows("profiles", "id,email,display_name,created_at,status", "id", task.owner_id);
  if (profiles[0]?.status !== "active") throw new Error("Account is not eligible for export.");
  const projects = await allRows("cloud_projects", "id,name,status,created_at,updated_at,deleted_at,current_version_id,head_version_id,original_upload_id", "owner_id", task.owner_id);
  const manifest = { format: "mirai-account-export-v1", exportedAt: new Date().toISOString(),
    account: { email: profiles[0].email, displayName: profiles[0].display_name, createdAt: profiles[0].created_at },
    projects: [] };
  const entries = [];
  for (const project of projects) {
    const uploads = await rows("asset_uploads", "source_key,base_key,original_name,original_mime,width,height,created_at", "id", project.original_upload_id);
    const upload = uploads[0];
    if (!upload) throw new Error("Project original is missing.");
    const versions = await allRows("cloud_project_versions", "id,parent_version_id,kind,width,height,sequence,active,created_at,edit_asset_id", "project_id", project.id);
    const operations = await allRows("cloud_edit_operations", "id,input_version_id,output_version_id,kind,method,parameters,mask_width,mask_height,mask_deflate,created_at", "project_id", project.id);
    const assets = await allRows("cloud_edit_assets", "id,storage_key,created_at", "project_id", project.id);
    const byAsset = new Map(assets.map((asset) => [asset.id, asset.storage_key]));
    const prefix = `projects/${project.id}`;
    const sourceName = `${prefix}/original.${upload.original_mime === "image/jpeg" ? "jpg" : "png"}`;
    entries.push({ name: sourceName, bytes: () => assetBytes(upload.source_key) });
    entries.push({ name: `${prefix}/normalized.png`, bytes: () => assetBytes(upload.base_key) });
    for (const version of versions) {
      if (version.kind !== "edit") continue;
      const key = byAsset.get(version.edit_asset_id);
      if (!key) throw new Error("Accepted edit asset is missing.");
      entries.push({ name: `${prefix}/versions/${version.id}.png`, bytes: () => assetBytes(key) });
    }
    manifest.projects.push({ id: project.id, name: project.name, status: project.status,
      createdAt: project.created_at, updatedAt: project.updated_at, deletedAt: project.deleted_at,
      currentVersionId: project.current_version_id, headVersionId: project.head_version_id,
      original: { name: upload.original_name, mediaType: upload.original_mime,
        width: upload.width, height: upload.height, path: sourceName }, versions, operations });
  }
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  if (manifestBytes.length > 20 * 1024 * 1024) throw new Error("Account export metadata exceeds the bound.");
  entries.unshift({ name: "manifest.json", bytes: async () => manifestBytes });
  const directory = await mkdtemp(join(tmpdir(), "mirai-export-"));
  const path = join(directory, "account.tar.gz");
  try {
    await pipeline(Readable.from(archiveEntries(entries)), createGzip({ level: 6 }), createWriteStream(path));
    const archive = await readFile(path);
    if (archive.length > 150 * 1024 * 1024) throw new Error("Account export exceeds the archive bound.");
    const key = `${task.owner_id}/${task.id}.tar.gz`;
    const uploaded = await client.storage.from("mirai-exports").upload(key, archive, {
      contentType: "application/gzip", upsert: false,
    });
    if (uploaded.error && !uploaded.error.message.toLowerCase().includes("already exists"))
      throw new Error("Account export upload failed.");
    const finished = await client.rpc("mirai_finish_account_export", { target_id: task.id, target_key: key });
    if (finished.error) throw new Error("Account export completion failed.");
  } finally { await rm(directory, { recursive: true, force: true }); }
}

await reconcileAiResults();
await reconcileOriginalUploads();
await reconcileOrphanEdits();

const due = await client.from("cloud_projects").select("id,owner_id")
  .eq("status", "trash").lte("purge_after", new Date().toISOString()).limit(30);
if (due.error) throw new Error("Could not scan due trash.");
for (const project of due.data ?? []) {
  const { error } = await client.rpc("mirai_request_project_purge", {
    target_owner: project.owner_id, target_project: project.id,
  });
  if (error) throw new Error("Could not queue a due project purge.");
}

const expired = await client.from("mirai_maintenance_tasks").select("id,result_key")
  .eq("kind", "account-export").eq("status", "complete")
  .lte("result_expires_at", new Date().toISOString()).not("result_key", "is", null).limit(30);
if (expired.error) throw new Error("Could not scan expired exports.");
for (const item of expired.data ?? []) {
  const removed = await client.storage.from("mirai-exports").remove([item.result_key]);
  if (removed.error) throw new Error("Expired export deletion failed.");
  const updated = await client.from("mirai_maintenance_tasks")
    .update({ result_key: null, updated_at: new Date().toISOString() }).eq("id", item.id);
  if (updated.error) throw new Error("Expired export record update failed.");
}

for (let index = 0; index < 30; index += 1) {
  const { data: task, error } = await client.rpc("mirai_claim_maintenance_task");
  if (error) throw new Error("Could not claim maintenance work.");
  if (!task?.id) break;
  try {
    if (task.kind === "project-purge") await purgeProject(task);
    else if (task.kind === "account-purge") await purgeAccount(task);
    else if (task.kind === "account-export") await exportAccount(task);
    else throw new Error("Maintenance task type is not available in this runner.");
    console.log(`Maintenance task ${task.id} completed.`);
  } catch (cause) {
    const failure = await client.rpc("mirai_fail_maintenance_task", { target_id: task.id });
    if (failure.error) console.error(`Maintenance task ${task.id} could not record its retry state.`);
    console.error(`Maintenance task ${task.id} failed: ${cause instanceof Error ? cause.message : "Unknown error"}`);
    process.exitCode = 1;
  }
}
