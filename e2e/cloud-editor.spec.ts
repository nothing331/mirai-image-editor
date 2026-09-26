import { createHash, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

const enabled = process.env.E2E_CLOUD === "1";
test.skip(!enabled, "Runs only against disposable local Supabase with E2E_CLOUD=1.");

let projectId = "";
let originalVersionId = "";
let cookies: Array<{ name: string; value: string }> = [];

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const userId = randomUUID();
  const email = `${userId}@example.test`;
  const password = randomUUID() + randomUUID();
  expect((await admin.auth.admin.createUser({ id: userId, email, password, email_confirm: true })).error).toBeNull();
  expect((await admin.from("profiles").update({ status: "active" }).eq("id", userId)).error).toBeNull();
  const source = await sharp({ create: { width: 20, height: 16, channels: 4, background: "#dc6a48" } }).png().toBuffer();
  const base = await sharp(source).rotate().toColourspace("srgb").png({ compressionLevel: 9 }).toBuffer();
  const reserved = await admin.rpc("mirai_reserve_original_upload", {
    target_owner: userId, target_id: randomUUID(), target_request_key: randomUUID(),
    target_name: "sample.png", target_mime: "image/png", target_bytes: source.length,
  });
  expect(reserved.error).toBeNull();
  expect((await admin.storage.from("mirai-assets").upload(reserved.data.source_key, source, { contentType: "image/png" })).error).toBeNull();
  expect((await admin.storage.from("mirai-assets").upload(reserved.data.base_key, base, { contentType: "image/png" })).error).toBeNull();
  expect((await admin.from("asset_uploads").update({ state: "finalizing" }).eq("id", reserved.data.id)).error).toBeNull();
  const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  expect((await admin.rpc("mirai_finish_original_upload", {
    target_id: reserved.data.id, target_owner: userId, target_source_sha: hash(source),
    target_base_sha: hash(base), target_source_bytes: source.length,
    target_base_bytes: base.length, target_width: 20, target_height: 16,
  })).error).toBeNull();
  const project = await admin.rpc("mirai_create_cloud_project", {
    target_owner: userId, target_id: randomUUID(), target_version_id: randomUUID(),
    target_upload_id: reserved.data.id, target_name: "Cloud editor test",
  });
  expect(project.error).toBeNull();
  projectId = project.data.id;
  originalVersionId = project.data.current_version_id;
  const client = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookies,
      setAll: (incoming) => {
        for (const cookie of incoming) {
          cookies = [...cookies.filter((old) => old.name !== cookie.name), { name: cookie.name, value: cookie.value }];
        }
      },
    },
  });
  expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
});

test("accepts an edit, reopens it, and persists undo/redo and redo replacement", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3000" })));
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  let loseFirstAcknowledgement = true;
  await page.route("**/api/cloud-projects/*/edits", async (route) => {
    if (loseFirstAcknowledgement) {
      loseFirstAcknowledgement = false;
      const saved = await route.fetch();
      expect(saved.ok()).toBe(true);
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Connection interrupted after save." }) });
      return;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "Preview monochrome edit" }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("Save needs attention")).toBeVisible();
  await expect(page.getByTestId("cloud-pending-comparison")).toBeVisible();
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  const first = await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId);
  expect(first.project.currentVersionId).not.toBe(originalVersionId);
  const acceptedImage = await page.request.get(`/api/cloud-projects/${projectId}/versions/${first.project.currentVersionId}/image`);
  expect(acceptedImage.ok()).toBe(true);
  const acceptedPixels = await sharp(await acceptedImage.body()).ensureAlpha().raw().toBuffer();
  expect(acceptedPixels[0]).toBe(acceptedPixels[1]);
  expect(acceptedPixels[1]).toBe(acceptedPixels[2]);
  await page.reload();
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  const afterReload = await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId);
  expect(afterReload.project.currentVersionId).toBe(first.project.currentVersionId);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId)).project.currentVersionId).toBe(originalVersionId);
  const originalImage = await page.request.get(`/api/cloud-projects/${projectId}/versions/${originalVersionId}/image`);
  const originalPixels = await sharp(await originalImage.body()).ensureAlpha().raw().toBuffer();
  expect(originalPixels[0]).not.toBe(originalPixels[1]);
  await page.getByRole("button", { name: "Redo" }).click();
  await expect.poll(async () => (await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId)).project.currentVersionId).toBe(first.project.currentVersionId);
  await page.getByRole("button", { name: "Go to original" }).click();
  await expect.poll(async () => (await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId)).project.currentVersionId).toBe(originalVersionId);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Preview monochrome edit" }).click();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  const latest = await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId);
  expect(latest.project.currentVersionId).not.toBe(first.project.currentVersionId);
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("complementary", { name: "Project history" }).getByRole("button")).toHaveCount(2);
});
