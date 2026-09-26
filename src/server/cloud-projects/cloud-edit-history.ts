import "server-only";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { CloudProjectError } from "./cloud-projects";

const ASSET_BUCKET = "mirai-assets";
const MAX_EDIT_BYTES = 30 * 1024 * 1024;
const MAX_PIXELS = 4_194_304;
const operationSchema = z.object({
  id: z.uuid(), inputVersionId: z.uuid(), outputVersionId: z.uuid(), maskId: z.uuid(),
  type: z.enum(["recolor", "paint", "crop", "resize", "rotate", "flip", "text", "watermark", "transform"]),
  method: z.literal("local"), status: z.literal("accepted"),
  parameters: z.record(z.string(), z.unknown()),
}).strict();
export const editCommitSchema = z.object({
  requestKey: z.uuid(), assetId: z.uuid(), inputVersionId: z.uuid(),
  outputVersionId: z.uuid(), replaceFuture: z.boolean(),
  outputDataUrl: z.string().startsWith("data:image/png;base64,"),
  maskAlphaBase64: z.string(), maskWidth: z.number().int().positive(),
  maskHeight: z.number().int().positive(), operation: operationSchema,
}).strict();

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(code: "invalid" | "not-found" | "conflict" | "quota" | "unavailable", message: string): never {
  throw new CloudProjectError(code, message);
}

function decodeBase64(value: string, maxBytes: number): Buffer {
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0
    || value.length > Math.ceil(maxBytes / 3) * 4 + 4) fail("invalid", "Edit data is malformed or too large.");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maxBytes || bytes.toString("base64") !== value) fail("invalid", "Edit data is malformed or too large.");
  return bytes;
}

async function decodedPixels(bytes: Uint8Array) {
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS, animated: false });
    const metadata = await image.metadata();
    if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1 || !metadata.width || !metadata.height
      || metadata.width > 2048 || metadata.height > 2048 || metadata.width * metadata.height > MAX_PIXELS) {
      fail("invalid", "Use a single-frame PNG within 2,048 pixels per edge.");
    }
    const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { pixels: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof CloudProjectError) throw error;
    return fail("invalid", "The edited PNG could not be decoded.");
  }
}

async function currentVersion(ownerId: string, projectId: string, versionId: string) {
  const client = createAdminSupabaseClient();
  const { data, error } = await client.from("cloud_project_versions")
    .select("id,project_id,owner_id,upload_id,edit_asset_id,parent_version_id,width,height,kind,sequence,active,created_at")
    .eq("id", versionId).eq("project_id", projectId).eq("owner_id", ownerId).maybeSingle();
  if (error) fail("unavailable", "The image version could not be read.");
  if (!data) fail("not-found", "Image version not found.");
  return data;
}

async function versionBytes(ownerId: string, projectId: string, versionId: string): Promise<Uint8Array> {
  const client = createAdminSupabaseClient();
  const version = await currentVersion(ownerId, projectId, versionId);
  let key: string;
  if (version.kind === "original") {
    const { data, error } = await client.from("asset_uploads").select("base_key")
      .eq("id", version.upload_id).eq("owner_id", ownerId).eq("state", "ready").single();
    if (error || !data) fail("unavailable", "The original image is unavailable.");
    key = data.base_key;
  } else {
    const { data, error } = await client.from("cloud_edit_assets").select("storage_key")
      .eq("id", version.edit_asset_id).eq("owner_id", ownerId).eq("project_id", projectId)
      .eq("state", "committed").single();
    if (error || !data) fail("unavailable", "The accepted image is unavailable.");
    key = data.storage_key;
  }
  const { data, error } = await client.storage.from(ASSET_BUCKET).download(key);
  if (error || !data) fail("unavailable", "The accepted image could not be loaded.");
  return new Uint8Array(await data.arrayBuffer());
}

export async function readCloudVersionBytes(ownerId: string, projectId: string, versionId: string) {
  const version = await currentVersion(ownerId, projectId, versionId);
  if (!version.active) fail("not-found", "Version not found.");
  return versionBytes(ownerId, projectId, versionId);
}

export async function cloudOriginalVersionId(ownerId: string, projectId: string): Promise<string> {
  const { data, error } = await createAdminSupabaseClient().from("cloud_project_versions")
    .select("id").eq("project_id", projectId).eq("owner_id", ownerId)
    .eq("kind", "original").single();
  if (error || !data) fail("unavailable", "The original version could not be found.");
  return data.id;
}

function expectedDimensions(type: string, parameters: Record<string, unknown>, inputWidth: number, inputHeight: number) {
  if (type === "transform" && (parameters.presetId !== "monochrome"
    || parameters.userPrompt !== "" || parameters.presetVersion !== 1)) {
    fail("invalid", "Only local monochrome is available for cloud edits.");
  }
  if (type === "flip" && parameters.axis !== "horizontal" && parameters.axis !== "vertical") {
    fail("invalid", "Check the flip direction.");
  }
  if (type === "crop") {
    const rect = z.object({ x: z.number().int().nonnegative(), y: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive() }).parse(parameters.sourceRect);
    if (rect.x + rect.width > inputWidth || rect.y + rect.height > inputHeight) fail("invalid", "Crop extends outside the input image.");
    return { width: rect.width, height: rect.height };
  }
  if (type === "resize") {
    const dimensions = z.object({ width: z.number().int().positive().max(2048), height: z.number().int().positive().max(2048), preventUpscale: z.boolean() }).parse(parameters);
    const scale = dimensions.preventUpscale ? Math.min(1, inputWidth / dimensions.width, inputHeight / dimensions.height) : 1;
    return { width: Math.max(1, Math.round(dimensions.width * scale)), height: Math.max(1, Math.round(dimensions.height * scale)) };
  }
  if (type === "rotate") {
    const quarterTurns = z.union([z.literal(1), z.literal(2), z.literal(3)]).parse(parameters.quarterTurns);
    return quarterTurns % 2 === 0 ? { width: inputWidth, height: inputHeight } : { width: inputHeight, height: inputWidth };
  }
  return { width: inputWidth, height: inputHeight };
}

function validateOutsideMask(input: Uint8Array, output: Uint8Array, mask: Uint8Array, width: number, height: number) {
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    if (mask[pixel] !== 0) continue;
    const channel = pixel * 4;
    for (let offset = 0; offset < 4; offset += 1) {
      if (input[channel + offset] !== output[channel + offset]) {
        fail("invalid", "The edit changes pixels outside its source-image mask.");
      }
    }
  }
}

export async function commitCloudEdit(ownerId: string, projectId: string, raw: unknown) {
  const input = editCommitSchema.parse(raw);
  if (input.operation.inputVersionId !== input.inputVersionId
    || input.operation.outputVersionId !== input.outputVersionId) fail("invalid", "Edit IDs do not match.");
  if (JSON.stringify(input.operation.parameters).length > 16_384) fail("invalid", "Edit parameters are too large.");
  const output = decodeBase64(input.outputDataUrl.slice("data:image/png;base64,".length), MAX_EDIT_BYTES);
  const mask = decodeBase64(input.maskAlphaBase64, MAX_PIXELS);
  const sourceVersion = await currentVersion(ownerId, projectId, input.inputVersionId);
  if (input.maskWidth !== sourceVersion.width || input.maskHeight !== sourceVersion.height
    || mask.length !== input.maskWidth * input.maskHeight) fail("invalid", "Edit mask must match the source image.");
  const outputImage = await decodedPixels(output);
  const expected = expectedDimensions(input.operation.type, input.operation.parameters, sourceVersion.width, sourceVersion.height);
  if (outputImage.width !== expected.width || outputImage.height !== expected.height) fail("invalid", "Edited image dimensions do not match the operation.");
  if (["crop", "resize", "rotate", "flip", "transform"].includes(input.operation.type) && mask.some((alpha) => alpha !== 255)) {
    fail("invalid", "Geometry edits require a full source-image mask.");
  }
  if (outputImage.width === sourceVersion.width && outputImage.height === sourceVersion.height) {
    const source = await decodedPixels(await versionBytes(ownerId, projectId, input.inputVersionId));
    validateOutsideMask(source.pixels, outputImage.pixels, mask, source.width, source.height);
  }
  const digest = sha256(JSON.stringify({ projectId, inputVersionId: input.inputVersionId,
    outputVersionId: input.outputVersionId, operation: input.operation, maskSha: sha256(mask),
    outputSha: sha256(output), replaceFuture: input.replaceFuture }));
  const client = createAdminSupabaseClient();
  const reserved = await client.rpc("mirai_reserve_cloud_edit_asset", {
    target_owner: ownerId, target_project: projectId, target_id: input.assetId,
    target_request_key: input.requestKey, target_digest: digest, target_sha: sha256(output),
    target_bytes: output.length, target_width: outputImage.width, target_height: outputImage.height,
  });
  if (reserved.error || !reserved.data) {
    if (reserved.error?.message.includes("allowance")) fail("quota", "Storage allowance reached.");
    if (reserved.error?.message.includes("reused")) fail("conflict", "This save request belongs to another edit.");
    if (reserved.error?.message.includes("not found")) fail("not-found", "Project not found.");
    fail("unavailable", "The edit could not be reserved. Retry the save.");
  }
  const asset = reserved.data as { id: string; storage_key: string; state: string };
  if (asset.state !== "committed") {
    const uploaded = await client.storage.from(ASSET_BUCKET).upload(asset.storage_key, output, {
      contentType: "image/png", upsert: false, cacheControl: "private, no-store",
    });
    if (uploaded.error) {
      const existing = await client.storage.from(ASSET_BUCKET).download(asset.storage_key);
      if (existing.error || !existing.data || sha256(new Uint8Array(await existing.data.arrayBuffer())) !== sha256(output)) {
        fail("unavailable", "The edited image could not be stored. Retry the save.");
      }
    }
    if (asset.state === "reserved") {
      const ready = await client.from("cloud_edit_assets").update({ state: "ready", updated_at: new Date().toISOString() })
        .eq("id", asset.id).eq("owner_id", ownerId).eq("project_id", projectId).eq("state", "reserved");
      if (ready.error) fail("unavailable", "The edit is stored but could not be finalized. Retry the save.");
    }
  }
  const compressedMask = deflateSync(mask);
  const committed = await client.rpc("mirai_accept_cloud_edit", {
    target_owner: ownerId, target_project: projectId, target_input: input.inputVersionId,
    target_output: input.outputVersionId, target_operation: input.operation.id,
    target_asset: asset.id, target_request_key: input.requestKey, target_digest: digest,
    target_kind: input.operation.type, target_parameters: input.operation.parameters,
    target_mask_width: input.maskWidth, target_mask_height: input.maskHeight,
    target_mask_base64: compressedMask.toString("base64"), target_replace_future: input.replaceFuture,
  });
  if (committed.error || !committed.data) {
    if (committed.error?.message.includes("not current") || committed.error?.message.includes("redo replacement")) {
      fail("conflict", "The project changed. Keep this edit and reload the latest saved version before retrying.");
    }
    if (committed.error?.message.includes("reused")) fail("conflict", "This save request belongs to another edit.");
    fail("unavailable", "The edited image is stored, but its history could not be saved. Retry the save.");
  }
  return committed.data;
}

export async function readCloudVersion(ownerId: string, projectId: string, versionId: string) {
  const version = await currentVersion(ownerId, projectId, versionId);
  if (!version.active) fail("not-found", "Version not found.");
  const client = createAdminSupabaseClient();
  const next = await client.from("cloud_project_versions").select("id")
    .eq("project_id", projectId).eq("owner_id", ownerId).eq("active", true)
    .gt("sequence", version.sequence).order("sequence", { ascending: true }).limit(1).maybeSingle();
  if (next.error) fail("unavailable", "Version navigation could not be loaded.");
  let key: string;
  if (version.kind === "original") {
    const upload = await client.from("asset_uploads").select("base_key").eq("id", version.upload_id)
      .eq("owner_id", ownerId).eq("state", "ready").single();
    if (upload.error || !upload.data) fail("unavailable", "The original image is unavailable.");
    key = upload.data.base_key;
  } else {
    const asset = await client.from("cloud_edit_assets").select("storage_key").eq("id", version.edit_asset_id)
      .eq("project_id", projectId).eq("owner_id", ownerId).eq("state", "committed").single();
    if (asset.error || !asset.data) fail("unavailable", "The accepted image is unavailable.");
    key = asset.data.storage_key;
  }
  const signed = await client.storage.from(ASSET_BUCKET).createSignedUrl(key, 60);
  if (signed.error || !signed.data) fail("unavailable", "The private image could not be opened.");
  return { id: version.id, parentVersionId: version.parent_version_id, kind: version.kind,
    width: version.width, height: version.height, sequence: version.sequence,
    createdAt: version.created_at, nextVersionId: next.data?.id ?? null,
    imageUrl: signed.data.signedUrl, expiresIn: 60 };
}

export async function listCloudHistory(ownerId: string, projectId: string, beforeSequence?: number) {
  const client = createAdminSupabaseClient();
  const project = await client.from("cloud_projects").select("id").eq("id", projectId)
    .eq("owner_id", ownerId).eq("status", "active").maybeSingle();
  if (project.error) fail("unavailable", "History could not be loaded.");
  if (!project.data) fail("not-found", "Project not found.");
  let query = client.from("cloud_project_versions").select("id,parent_version_id,kind,width,height,sequence,created_at")
    .eq("owner_id", ownerId).eq("project_id", projectId).eq("active", true)
    .order("sequence", { ascending: false }).limit(20);
  if (beforeSequence !== undefined) query = query.lt("sequence", beforeSequence);
  const { data, error } = await query;
  if (error || !data) fail("unavailable", "History could not be loaded.");
  const versionIds = data.map((version) => version.id);
  const operations = versionIds.length ? await client.from("cloud_edit_operations")
    .select("output_version_id,kind,created_at").eq("owner_id", ownerId).eq("project_id", projectId)
    .in("output_version_id", versionIds) : { data: [], error: null };
  if (operations.error || !operations.data) fail("unavailable", "History operations could not be loaded.");
  const byVersion = new Map(operations.data.map((operation) => [operation.output_version_id, operation]));
  return { versions: data.map((version) => ({ id: version.id, parentVersionId: version.parent_version_id,
    kind: version.kind, width: version.width, height: version.height, sequence: version.sequence,
    createdAt: version.created_at, operationType: byVersion.get(version.id)?.kind ?? null })),
    nextCursor: data.length === 20 ? data[19].sequence : null };
}

export async function selectCloudVersion(ownerId: string, projectId: string, versionId: string) {
  const result = await createAdminSupabaseClient().rpc("mirai_select_cloud_version", {
    target_owner: ownerId, target_project: projectId, target_version: versionId,
  });
  if (result.error || !result.data) {
    if (result.error?.message.includes("not found")) fail("not-found", "Version not found.");
    fail("unavailable", "The selected version could not be saved.");
  }
  return { currentVersionId: result.data.current_version_id, headVersionId: result.data.head_version_id,
    revision: result.data.revision };
}
