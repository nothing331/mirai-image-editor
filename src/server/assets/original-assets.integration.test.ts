// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, it } from "vitest";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { cancelOriginalUpload, finalizeOriginalUpload, reconcileExpiredOriginalUploads, reserveOriginalUpload, signedOriginalRead, uploadOriginalBytes } from "./original-assets";

it.runIf(process.env.MIRAI_ASSET_INTEGRATION === "1")("stores a private immutable source and editor base in local Supabase", async () => {
  const status = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.116.0", "status", "-o", "json"], { encoding: "utf8" })) as Record<string, string>;
  process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
  process.env.SUPABASE_SECRET_KEY = status.SECRET_KEY;
  const admin = createAdminSupabaseClient();
  const ownerId = randomUUID();
  const otherId = randomUUID();
  const source = await sharp({ create: { width: 8, height: 6, channels: 3, background: "#dc6a48" } }).jpeg().toBuffer();
  const uploadIds: string[] = [];

  try {
    for (const id of [ownerId, otherId]) {
      const created = await admin.auth.admin.createUser({ id, email: `${id}@example.test`, email_confirm: true });
      expect(created.error).toBeNull();
    }
    expect((await admin.from("profiles").update({ status: "active" }).in("id", [ownerId, otherId])).error).toBeNull();
    const requestKey = randomUUID();
    const reserved = await reserveOriginalUpload(ownerId, {
      requestKey, originalName: "sample.jpg", mediaType: "image/jpeg", bytes: source.byteLength,
    });
    const uploadId = reserved.id;
    uploadIds.push(uploadId);
    expect((await reserveOriginalUpload(ownerId, {
      requestKey, originalName: "sample.jpg", mediaType: "image/jpeg", bytes: source.byteLength,
    })).id).toBe(uploadId);
    const transfer = new Request("https://example.test", {
      method: "PUT", headers: { "content-length": String(source.byteLength) }, body: source,
    });
    await uploadOriginalBytes(ownerId, uploadId, transfer);
    const receipt = await finalizeOriginalUpload(ownerId, uploadId);
    expect(receipt).toMatchObject({ id: uploadId, width: 8, height: 6 });
    expect(await finalizeOriginalUpload(ownerId, uploadId)).toEqual(receipt);
    await expect(signedOriginalRead(otherId, uploadId, "source")).rejects.toMatchObject({ code: "not-found" });

    const row = await admin.from("asset_uploads").select("*").eq("id", uploadId).single();
    expect(row.error).toBeNull();
    expect(row.data?.staging_deleted_at).toMatch(/^\d{4}-\d\d-\d\d/);
    const stored = await admin.storage.from("mirai-assets").download(row.data!.source_key);
    expect(stored.error).toBeNull();
    expect(Buffer.from(await stored.data!.arrayBuffer())).toEqual(source);
    const anonymous = createClient(status.API_URL, status.PUBLISHABLE_KEY);
    expect((await anonymous.storage.from("mirai-assets").download(row.data!.source_key)).error).not.toBeNull();

    const abandoned = await reserveOriginalUpload(ownerId, {
      requestKey: randomUUID(), originalName: "abandoned.jpg", mediaType: "image/jpeg", bytes: source.byteLength,
    });
    uploadIds.push(abandoned.id);
    await uploadOriginalBytes(ownerId, abandoned.id, new Request("https://example.test", {
      method: "PUT", headers: { "content-length": String(source.byteLength) }, body: source,
    }));
    expect((await admin.from("asset_uploads").update({ expires_at: new Date(Date.now() - 3600_000).toISOString() })
      .eq("id", abandoned.id)).error).toBeNull();
    expect(await reconcileExpiredOriginalUploads()).toBe(1);
    const expired = await admin.from("asset_uploads").select("state").eq("id", abandoned.id).single();
    expect(expired.data?.state).toBe("expired");
    expect((await admin.storage.from("mirai-asset-staging").download(abandoned.staging_key)).error).not.toBeNull();

    const cancelled = await reserveOriginalUpload(ownerId, {
      requestKey: randomUUID(), originalName: "cancelled.jpg", mediaType: "image/jpeg", bytes: source.byteLength,
    });
    uploadIds.push(cancelled.id);
    await uploadOriginalBytes(ownerId, cancelled.id, new Request("https://example.test", {
      method: "PUT", headers: { "content-length": String(source.byteLength) }, body: source,
    }));
    await cancelOriginalUpload(ownerId, cancelled.id);
    expect((await admin.from("asset_uploads").select("state").eq("id", cancelled.id).single()).data?.state).toBe("cancelled");
    expect((await admin.storage.from("mirai-asset-staging").download(cancelled.staging_key)).error).not.toBeNull();
  } finally {
    for (const uploadId of uploadIds) {
      const row = await admin.from("asset_uploads").select("*").eq("id", uploadId).maybeSingle();
      if (row.data) {
        await admin.storage.from("mirai-asset-staging").remove([row.data.staging_key]);
        await admin.storage.from("mirai-assets").remove([row.data.source_key, row.data.base_key]);
        await admin.from("asset_uploads").delete().eq("id", uploadId);
      }
    }
    await admin.auth.admin.deleteUser(ownerId);
    await admin.auth.admin.deleteUser(otherId);
  }
});
