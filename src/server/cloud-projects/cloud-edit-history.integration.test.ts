// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { expect, it } from "vitest";
import { finalizeOriginalUpload, reserveOriginalUpload, uploadOriginalBytes } from "@/server/assets/original-assets";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { createCloudProject } from "./cloud-projects";
import { commitCloudEdit, listCloudHistory, readCloudVersionBytes, selectCloudVersion } from "./cloud-edit-history";

it.runIf(process.env.MIRAI_EDIT_INTEGRATION === "1")("commits exact local pixels once and keeps one durable linear history", async () => {
  const status = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.116.0", "status", "-o", "json"], { encoding: "utf8" })) as Record<string, string>;
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY = status.SECRET_KEY;
  const admin = createAdminSupabaseClient();
  const ownerId = randomUUID();
  const foreignId = randomUUID();
  for (const id of [ownerId, foreignId]) {
    expect((await admin.auth.admin.createUser({ id, email: `${id}@example.test`, email_confirm: true })).error).toBeNull();
  }
  expect((await admin.from("profiles").update({ status: "active" }).in("id", [ownerId, foreignId])).error).toBeNull();
  const source = await sharp({ create: { width: 10, height: 8, channels: 4, background: "#dc6a48" } }).png().toBuffer();
  const reserved = await reserveOriginalUpload(ownerId, {
    requestKey: randomUUID(), originalName: "source.png", mediaType: "image/png", bytes: source.length,
  });
  await uploadOriginalBytes(ownerId, reserved.id, new Request("https://example.test", {
    method: "PUT", headers: { "content-length": String(source.length) }, body: source,
  }));
  await finalizeOriginalUpload(ownerId, reserved.id);
  const project = await createCloudProject(ownerId, reserved.id, "Edit history");
  const originalBytes = await readCloudVersionBytes(ownerId, project.id, project.currentVersionId);
  const original = await sharp(originalBytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const firstPixels = Buffer.from(original.data);
  firstPixels[0] = 12;
  const firstPng = await sharp(firstPixels, { raw: { width: 10, height: 8, channels: 4 } }).png().toBuffer();
  const firstMask = Buffer.alloc(80);
  firstMask[0] = 255;
  const firstInput = {
    requestKey: randomUUID(), assetId: randomUUID(), inputVersionId: project.currentVersionId,
    outputVersionId: randomUUID(), replaceFuture: false,
    outputDataUrl: `data:image/png;base64,${firstPng.toString("base64")}`,
    maskAlphaBase64: firstMask.toString("base64"), maskWidth: 10, maskHeight: 8,
    operation: {
      id: randomUUID(), inputVersionId: project.currentVersionId, outputVersionId: "",
      maskId: randomUUID(), type: "recolor", method: "local", status: "accepted",
      parameters: { color: "#0c6a48" },
    },
  };
  firstInput.operation.outputVersionId = firstInput.outputVersionId;
  const first = await commitCloudEdit(ownerId, project.id, firstInput);
  expect(first.output_version_id).toBe(firstInput.outputVersionId);
  expect(await commitCloudEdit(ownerId, project.id, firstInput)).toEqual(first);
  expect((await admin.from("cloud_project_versions").select("id", { count: "exact" }).eq("project_id", project.id)).count).toBe(2);
  expect((await admin.from("cloud_edit_operations").select("id", { count: "exact" }).eq("project_id", project.id)).count).toBe(1);
  const acceptedBytes = await readCloudVersionBytes(ownerId, project.id, firstInput.outputVersionId);
  expect(Buffer.from(acceptedBytes)).toEqual(firstPng);
  await expect(readCloudVersionBytes(foreignId, project.id, firstInput.outputVersionId)).rejects.toMatchObject({ code: "not-found" });
  const invalidPixels = Buffer.from(firstPixels);
  invalidPixels[4] = 33;
  const invalidPng = await sharp(invalidPixels, { raw: { width: 10, height: 8, channels: 4 } }).png().toBuffer();
  const invalidOutputId = randomUUID();
  await expect(commitCloudEdit(ownerId, project.id, {
    ...firstInput, requestKey: randomUUID(), assetId: randomUUID(), inputVersionId: firstInput.outputVersionId,
    outputVersionId: invalidOutputId, outputDataUrl: `data:image/png;base64,${invalidPng.toString("base64")}`,
    operation: { ...firstInput.operation, id: randomUUID(), inputVersionId: firstInput.outputVersionId,
      outputVersionId: invalidOutputId },
  })).rejects.toMatchObject({ code: "invalid" });
  expect((await admin.from("cloud_project_versions").select("id", { count: "exact" }).eq("project_id", project.id)).count).toBe(2);
  const undone = await selectCloudVersion(ownerId, project.id, project.currentVersionId);
  expect(undone.currentVersionId).toBe(project.currentVersionId);
  expect(undone.headVersionId).toBe(firstInput.outputVersionId);
  const redone = await selectCloudVersion(ownerId, project.id, firstInput.outputVersionId);
  expect(redone.currentVersionId).toBe(firstInput.outputVersionId);
  await selectCloudVersion(ownerId, project.id, project.currentVersionId);
  const cropPixels = Buffer.alloc(7 * 8 * 4);
  for (let y = 0; y < 8; y += 1) original.data.copy(cropPixels, y * 7 * 4, y * 10 * 4, y * 10 * 4 + 7 * 4);
  const cropPng = await sharp(cropPixels, { raw: { width: 7, height: 8, channels: 4 } }).png().toBuffer();
  const cropOutputId = randomUUID();
  const cropInput = {
    requestKey: randomUUID(), assetId: randomUUID(), inputVersionId: project.currentVersionId,
    outputVersionId: cropOutputId, replaceFuture: true,
    outputDataUrl: `data:image/png;base64,${cropPng.toString("base64")}`,
    maskAlphaBase64: Buffer.alloc(80, 255).toString("base64"), maskWidth: 10, maskHeight: 8,
    operation: { id: randomUUID(), inputVersionId: project.currentVersionId, outputVersionId: cropOutputId,
      maskId: randomUUID(), type: "crop", method: "local", status: "accepted",
      parameters: { sourceRect: { x: 0, y: 0, width: 7, height: 8 }, ratio: "free" } },
  };
  await commitCloudEdit(ownerId, project.id, cropInput);
  const history = await listCloudHistory(ownerId, project.id);
  expect(history.versions.map((version) => version.id)).toEqual([cropOutputId, project.currentVersionId]);
  expect(history.versions[0]).toMatchObject({ width: 7, height: 8, operationType: "crop" });
  await expect(selectCloudVersion(ownerId, project.id, firstInput.outputVersionId)).rejects.toMatchObject({ code: "not-found" });
  const originalAgain = await selectCloudVersion(ownerId, project.id, project.currentVersionId);
  expect(originalAgain.currentVersionId).toBe(project.currentVersionId);
  expect((await readCloudVersionBytes(ownerId, project.id, originalAgain.currentVersionId))).toEqual(originalBytes);
  const cropAgain = await selectCloudVersion(ownerId, project.id, cropOutputId);
  expect(cropAgain.currentVersionId).toBe(cropOutputId);
  const reopenedCrop = await sharp(await readCloudVersionBytes(ownerId, project.id, cropAgain.currentVersionId)).metadata();
  expect([reopenedCrop.width, reopenedCrop.height]).toEqual([7, 8]);
  let parent = cropOutputId;
  for (let sequence = 3; sequence < 28; sequence += 1) {
    const assetId = randomUUID();
    const versionId = randomUUID();
    expect((await admin.from("cloud_edit_assets").insert({ id: assetId, owner_id: ownerId, project_id: project.id,
      request_key: randomUUID(), digest: "a".repeat(64), storage_key: `${ownerId}/${project.id}/edits/${assetId}.png`,
      sha256: "b".repeat(64), bytes: 100, width: 7, height: 8, state: "committed" })).error).toBeNull();
    expect((await admin.from("cloud_project_versions").insert({ id: versionId, project_id: project.id,
      owner_id: ownerId, edit_asset_id: assetId, parent_version_id: parent, kind: "edit",
      width: 7, height: 8, sequence })).error).toBeNull();
    parent = versionId;
  }
  const newestPage = await listCloudHistory(ownerId, project.id);
  expect(newestPage.versions).toHaveLength(20);
  expect(newestPage.nextCursor).not.toBeNull();
  const olderPage = await listCloudHistory(ownerId, project.id, newestPage.nextCursor!);
  expect(olderPage.versions).toHaveLength(7);
  expect(olderPage.nextCursor).toBeNull();
});
