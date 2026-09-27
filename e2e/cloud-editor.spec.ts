import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

const enabled = process.env.E2E_CLOUD === "1";
test.skip(!enabled, "Runs only against disposable local Supabase with E2E_CLOUD=1.");

let projectId = "";
let ownerId = "";
let originalVersionId = "";
let cookies: Array<{ name: string; value: string }> = [];

test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });
  const userId = randomUUID();
  ownerId = userId;
  const email = `${userId}@example.test`;
  const password = randomUUID() + randomUUID();
  expect((await admin.auth.admin.createUser({ id: userId, email, password, email_confirm: true })).error).toBeNull();
  expect((await admin.from("profiles").update({ status: "active" }).eq("id", userId)).error).toBeNull();
  const source = await sharp({ create: { width: 320, height: 200, channels: 4, background: "#dc6a48" } }).png().toBuffer();
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
    target_base_bytes: base.length, target_width: 320, target_height: 200,
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
  await expect(page.getByRole("region", { name: "Cloud editor" }).locator("header").getByText("Save needs attention")).toBeVisible();
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

test("saves a crop from the inspector as one cloud version", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3000" })));
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  const before = await page.evaluate(async (id) => ({
    project: await fetch(`/api/cloud-projects/${id}`).then((response) => response.json()),
    history: await fetch(`/api/cloud-projects/${id}/history`).then((response) => response.json()),
  }), projectId);
  await page.getByTestId("open-size-position").click();
  const save = page.getByRole("button", { name: "Save crop" });
  await expect(save).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByLabel("Crop width").fill("240");
  await expect(save).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(save).toBeInViewport();
  await save.click();
  await expect.poll(async () => (await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId)).project.currentVersionId)
    .not.toBe(before.project.project.currentVersionId);
  const after = await page.evaluate(async (id) => ({
    project: await fetch(`/api/cloud-projects/${id}`).then((response) => response.json()),
    history: await fetch(`/api/cloud-projects/${id}/history`).then((response) => response.json()),
  }), projectId);
  expect(after.history.versions).toHaveLength(before.history.versions.length + 1);
  expect(after.history.versions[0]).toMatchObject({ operationType: "crop", width: 240, height: 200 });
  expect(after.project.project.currentVersionId).toBe(after.history.versions[0].id);
  await page.reload();
  await expect(page.getByRole("region", { name: "Image canvas" }).getByText("Cloud saved")).toBeVisible();
  const reloaded = await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId);
  expect(reloaded.project.currentVersionId).toBe(after.history.versions[0].id);
});

test("saves direct and paint edits, then undoes and redoes the saved versions", async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3000" })));
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Saved to cloud")).toBeVisible();

  const currentId = async () => (await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId)).project.currentVersionId as string;
  const history = async () => (await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}/history`).then((response) => response.json()), projectId)).versions as Array<{ id: string; operationType: string }>;
  const saveAndCheck = async (kind: string, action: () => Promise<void>) => {
    const previousId = await currentId();
    const previousCount = (await history()).length;
    await action();
    await expect.poll(currentId).not.toBe(previousId);
    const savedId = await currentId();
    await expect.poll(async () => (await history()).length).toBe(previousCount + 1);
    expect((await history())[0]).toMatchObject({ id: savedId, operationType: kind });
    await page.reload();
    await expect(page.getByText("Saved to cloud")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect.poll(currentId).toBe(previousId);
    await page.getByRole("button", { name: "Redo" }).click();
    await expect.poll(currentId).toBe(savedId);
    await expect(page.getByRole("button", { name: "Redo" })).toBeDisabled();
  };

  await page.getByTestId("open-text").click();
  await page.getByLabel("Text content").fill("SAVE THIS TEXT");
  await saveAndCheck("text", () => page.getByRole("button", { name: "Save text" }).click());

  await page.getByTestId("open-watermark").click();
  await page.getByLabel("Watermark text").fill("MIRAI");
  await saveAndCheck("watermark", () => page.getByRole("button", { name: "Save watermark" }).click());

  await page.getByTestId("open-size-position").click();
  await page.getByRole("radio", { name: "Resize" }).click();
  await page.getByLabel("Width", { exact: true }).fill("120");
  await saveAndCheck("resize", () => page.getByRole("button", { name: "Save resize" }).click());
  await page.getByTestId("open-size-position").click();
  await page.getByRole("radio", { name: "Rotate" }).click();
  await saveAndCheck("rotate", () => page.getByRole("button", { name: "Save rotation" }).click());
  await page.getByTestId("open-size-position").click();
  await page.getByRole("radio", { name: "Flip" }).click();
  await saveAndCheck("flip", () => page.getByRole("button", { name: "Save flip" }).click());

  await page.getByRole("radio", { name: "Brush" }).click();
  await page.getByLabel("Brush color").fill("#00ff00");
  const canvas = page.getByTestId("editor-canvas");
  const viewportX = Number(await canvas.getAttribute("data-viewport-x"));
  const viewportY = Number(await canvas.getAttribute("data-viewport-y"));
  const viewportScale = Number(await canvas.getAttribute("data-viewport-scale"));
  await canvas.locator("canvas").first().click({ position: { x: viewportX + 20 * viewportScale, y: viewportY + 20 * viewportScale } });
  await expect(page.getByTestId("apply-paint")).toBeEnabled();
  await saveAndCheck("paint", () => page.getByTestId("apply-paint").click());

  await page.getByTestId("open-lasso-edit").click();
  const selectionCanvas = page.getByTestId("editor-canvas");
  const bounds = await selectionCanvas.boundingBox();
  if (!bounds) throw new Error("Cloud canvas is not visible.");
  const selectX = Number(await selectionCanvas.getAttribute("data-viewport-x"));
  const selectY = Number(await selectionCanvas.getAttribute("data-viewport-y"));
  const selectScale = Number(await selectionCanvas.getAttribute("data-viewport-scale"));
  const point = (x: number, y: number) => ({ x: bounds.x + selectX + x * selectScale, y: bounds.y + selectY + y * selectScale });
  const start = point(10, 10);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [x, y] of [[40, 10], [40, 40], [10, 40], [10, 10]]) {
    const next = point(x, y);
    await page.mouse.move(next.x, next.y, { steps: 4 });
  }
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Edit selected area" })).toBeVisible();
  await page.getByLabel("Recolor selection").fill("#0000ff");
  await page.getByTestId("apply-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await saveAndCheck("recolor", () => page.getByTestId("accept-preview").click());
});

test("searches, renames, exports, trashes, and restores an owned project", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3000" })));
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "My projects" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByPlaceholder("Search project names").fill("not here");
  await expect(page.getByText("No projects match that search.")).toBeVisible();
  await page.getByPlaceholder("Search project names").fill("Cloud editor");
  await page.getByRole("button", { name: "Rename project" }).click();
  await page.getByRole("dialog", { name: "Rename project" }).getByLabel("Project name").fill("Cloud library check");
  await page.getByRole("dialog", { name: "Rename project" }).getByRole("button", { name: "Save name" }).click();
  await expect(page.getByText("Cloud library check")).toBeVisible();
  await page.getByRole("link", { name: /Cloud library check/ }).click();
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  await page.getByRole("button", { name: "Export accepted image" }).click();
  await expect(page.getByRole("dialog", { name: "Export image" })).toBeVisible();
  await page.getByRole("radio", { name: "JPEG" }).check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download accepted version" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Cloud library check.jpg");
  const original = await page.request.get(`/api/cloud-projects/${projectId}/original-file`);
  expect(original.ok()).toBe(true);
  expect(original.headers()["content-type"]).toBe("image/png");
  await page.getByRole("button", { name: "Close" }).click();
  await page.goto("/projects");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Move to trash" }).click();
  await expect(page.getByText("No saved originals yet")).toBeVisible();
  await page.getByRole("link", { name: "View trash" }).click();
  await expect(page.getByText("Cloud library check")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Saved to cloud")).toBeVisible();
});

test("offers a browser draft only for the same saved version", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3000" })));
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  const before = await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId);
  await page.getByRole("button", { name: "Preview monochrome edit" }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByRole("region", { name: "Cloud editor" }).locator("header").getByText("Draft on device")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Stored browser draft" })).toBeVisible();
  await page.getByRole("button", { name: "Restore draft" }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  const after = await page.evaluate(async (id) => fetch(`/api/cloud-projects/${id}`).then((response) => response.json()), projectId);
  expect(after.project.currentVersionId).toBe(before.project.currentVersionId);
});

test("prepares portable data and completes fenced account deletion", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3000" })));
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel("Display name").fill("Export test owner");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByLabel("Display name")).toHaveValue("Export test owner");
  await page.getByRole("button", { name: "Prepare data export" }).click();
  await expect.poll(async () => (await page.evaluate(async () => fetch("/api/account/export").then((response) => response.json()))).export?.status).toBe("pending");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  execFileSync("node", ["scripts/cloud-maintenance/run.mjs"], {
    cwd: process.cwd(), env: { ...process.env, SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL! },
  });
  await expect.poll(async () => (await page.evaluate(async () => fetch("/api/account/export").then((response) => response.json()))).export?.status).toBe("complete");
  const exportResponse = await page.evaluate(async () => fetch("/api/account/export").then((response) => response.json()));
  const archiveResponse = await page.request.get(exportResponse.export.downloadUrl);
  expect(archiveResponse.ok()).toBe(true);
  const archive = await archiveResponse.body();
  const directory = mkdtempSync(join(tmpdir(), "mirai-export-test-"));
  try {
    const path = join(directory, "account.tar.gz");
    writeFileSync(path, archive);
    const entries = execFileSync("tar", ["-tzf", path], { encoding: "utf8" });
    expect(entries).toContain("manifest.json");
    expect(entries).toContain(`projects/${projectId}/normalized.png`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
  const tar = gunzipSync(archive);
  expect(tar.subarray(0, 100).toString("utf8")).toContain("manifest.json");
  expect(tar.toString("utf8")).toContain("Export test owner");
  expect(tar.toString("utf8")).toContain(projectId);
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("heading", { name: "Deletion requested." })).toBeVisible();
  const profile = await admin.from("profiles").select("status").eq("id", ownerId).single();
  expect(profile.data?.status).toBe("revoked");
  expect((await admin.from("mirai_maintenance_tasks")
    .update({ next_attempt_at: new Date().toISOString() }).eq("owner_id", ownerId)
    .eq("kind", "account-purge")).error).toBeNull();
  execFileSync("node", ["scripts/cloud-maintenance/run.mjs"], {
    cwd: process.cwd(), env: { ...process.env, SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL! },
  });
  expect((await admin.from("cloud_projects").select("id").eq("owner_id", ownerId)).data).toHaveLength(0);
  expect((await admin.from("asset_uploads").select("id").eq("owner_id", ownerId)).data).toHaveLength(0);
  expect((await admin.from("profiles").select("id").eq("id", ownerId)).data).toHaveLength(0);
});
