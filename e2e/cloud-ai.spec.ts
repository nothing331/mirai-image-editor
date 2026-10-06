import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_CLOUD_AI !== "1", "Requires disposable local Supabase and fake AI admission.");
let projectId: string;
let ownerId: string;
let originalVersionId: string;
let cookies: Array<{ name: string; value: string }> = [];

test.beforeAll(async () => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  ownerId = randomUUID();
  const email = `${ownerId}@example.test`;
  const password = randomUUID() + randomUUID();
  expect((await admin.auth.admin.createUser({ id: ownerId, email, password, email_confirm: true })).error).toBeNull();
  expect((await admin.from("profiles").update({ status: "active" }).eq("id", ownerId)).error).toBeNull();
  expect((await admin.from("account_allowance_grants").insert({ account_id: ownerId, allowance_key: "initial-ai-images", granted_quantity: 25, granted_by: ownerId })).error).toBeNull();
  expect((await admin.from("ai_control").update({ enabled: true }).eq("id", true)).error).toBeNull();
  const source = await sharp({ create: { width: 320, height: 200, channels: 4, background: "#dc6a48" } }).png().toBuffer();
  const upload = await admin.rpc("mirai_reserve_original_upload", { target_owner: ownerId, target_id: randomUUID(), target_request_key: randomUUID(), target_name: "original.png", target_mime: "image/png", target_bytes: source.length });
  expect(upload.error).toBeNull();
  for (const key of [upload.data.source_key, upload.data.base_key]) expect((await admin.storage.from("mirai-assets").upload(key, source, { contentType: "image/png" })).error).toBeNull();
  expect((await admin.from("asset_uploads").update({ state: "finalizing" }).eq("id", upload.data.id)).error).toBeNull();
  const hash = createHash("sha256").update(source).digest("hex");
  expect((await admin.rpc("mirai_finish_original_upload", { target_id: upload.data.id, target_owner: ownerId, target_source_sha: hash, target_base_sha: hash, target_source_bytes: source.length, target_base_bytes: source.length, target_width: 320, target_height: 200 })).error).toBeNull();
  const project = await admin.rpc("mirai_create_cloud_project", { target_owner: ownerId, target_id: randomUUID(), target_version_id: randomUUID(), target_upload_id: upload.data.id, target_name: "Wave D browser fixture" });
  expect(project.error).toBeNull(); projectId = project.data.id; originalVersionId = project.data.current_version_id;
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => cookies, setAll: (incoming) => { for (const cookie of incoming) cookies = [...cookies.filter((old) => old.name !== cookie.name), { name: cookie.name, value: cookie.value }]; } } });
  expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
});

test("new project presents both paths without generating and keeps upload available when AI is off", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3100" })));
  const paidRequests: string[] = [];
  page.on("request", (request) => { if (request.method() === "POST" && request.url().includes("/api/asset-generations")) paidRequests.push(request.url()); });
  await page.goto("/projects");
  await page.getByRole("link", { name: "New project", exact: true }).click();
  await expect(page.getByRole("button", { name: "Upload an image to edit", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Create an image with AI", exact: true })).toBeEnabled();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/new-project-choice-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/new-project-choice-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Upload an image to edit", exact: true }).click();
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Choose another starting point" }).click();
  await page.getByRole("button", { name: "Create an image with AI", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Create Image", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("generate-assets")).toBeDisabled();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Upload an image to edit", exact: true })).toBeVisible();
  await page.goto("/projects/new?create=ai");
  await expect(page.getByRole("dialog", { name: "Create with AI" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Create Image", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  expect(paidRequests).toEqual([]);
  await page.evaluate((id) => sessionStorage.removeItem(`mirai-ai-session-${id}`), ownerId);
  await page.route("**/api/ai/usage", (route) => route.fulfill({ json: { granted: 25, spent: 0, pending: 0, enabled: false, unlimited: false } }));
  await page.goto("/projects/new");
  await expect(page.getByRole("button", { name: "Create an image with AI", exact: true })).toBeDisabled();
  await expect(page.getByText("AI is currently unavailable. You can still upload an image.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload an image to edit", exact: true })).toBeEnabled();
});

test("recovers and accepts a localized preview without repurchasing; Transform, Extend and creation share credits", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3100" })));
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("25 of 25 AI credits remaining")).toBeVisible();
  const generation = await page.evaluate(async ({ projectId, versionId }) => {
    const mask = new Uint8Array(320 * 200); mask.fill(255, 0, 160);
    let binary = ""; for (const value of mask) binary += String.fromCharCode(value);
    const input = { requestId: crypto.randomUUID(), projectId, inputVersionId: versionId, operation: "replace", boundaryPolicy: "review", prompt: "Add a compass detail", selectionMaskBase64: btoa(binary), providerMaskBase64: btoa(binary) };
    const response = await fetch("/api/image-edits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    return { ok: response.ok, body: await response.json() };
  }, { projectId, versionId: originalVersionId });
  expect(generation.ok, JSON.stringify(generation.body)).toBe(true);
  await page.reload();
  await expect(page.getByText("24 of 25 AI credits remaining")).toBeVisible();
  await page.getByRole("button", { name: "Review result", exact: true }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  await expect(page.getByText("24 of 25 AI credits remaining")).toBeVisible();

  await page.getByTestId("open-transform").click();
  await expect(page.getByTestId("generate-transform")).toContainText("1 credit");
  await page.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("23 of 25 AI credits remaining")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  await expect(page.getByText("Saved to cloud")).toBeVisible();

  await page.getByTestId("open-extend").click();
  await page.getByRole("button", { name: "Preview smart frame" }).click();
  await page.getByRole("button", { name: "Generate extension · 1 credit" }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("22 of 25 AI credits remaining")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  await page.screenshot({ path: "test-results/wave-d-editor.png", fullPage: true });

  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Create an image with AI", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Create Image", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("asset-description").fill("A mountain lake at sunrise, with warm light and a quiet shore");
  await page.getByTestId("generate-assets").click();
  await expect(page.getByTestId("use-generated-asset")).toBeEnabled();
  await page.screenshot({ path: "test-results/wave-d-creation.png", fullPage: true });
  await page.getByTestId("use-generated-asset").click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByText("21 of 25 AI credits remaining")).toBeVisible();
  const metadata = await page.evaluate(() => fetch(`/api/cloud-projects/${location.pathname.split("/").pop()}/history`).then((result) => result.json()));
  expect(metadata.versions).toHaveLength(1);
  await page.goto("/settings");
  await expect(page.getByText(/21 of 25 welcome AI credits remain/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/wave-d-usage-mobile.png", fullPage: true });
});

test("checks direct API authorization and preserves local editing after credit exhaustion", async ({ page, context }) => {
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3100" })));
  await page.goto(`/projects/${projectId}`);
  const denied = await page.request.post("/api/image-edits", { headers: { origin: "https://foreign.example" }, data: {} });
  expect(denied.status()).toBe(400);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const usage = await admin.rpc("mirai_ai_usage", { target_owner: ownerId });
  const sessionId = randomUUID();
  expect((await admin.from("ai_creation_sessions").insert({ id: sessionId, owner_id: ownerId })).error).toBeNull();
  const fillers = Array.from({ length: 25 - usage.data.spent }, () => {
    const id = randomUUID();
    return { id, owner_id: ownerId, creation_session_id: sessionId, workflow: "creation", digest: "a".repeat(64), executor_id: randomUUID(), status: "expired", credit_state: "spent", storage_bytes: 0, budget_reserved: 0, result_key: `${ownerId}/${id}/result.json` };
  });
  expect((await admin.from("ai_attempts").insert(fillers)).error).toBeNull();
  await page.reload();
  await expect(page.getByText("0 of 25 AI credits remaining")).toBeVisible();
  await page.getByTestId("open-transform").click();
  await expect(page.getByTestId("generate-transform")).toBeDisabled();
  await page.getByRole("radio", { name: "Monochrome" }).click();
  await expect(page.getByTestId("generate-transform")).toBeEnabled();
  await expect(page.getByTestId("generate-transform")).not.toContainText("1 credit");
  await page.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export accepted image" })).toBeEnabled();
});

test("admin has unlimited projects and AI after member credits are exhausted", async ({ page, context }) => {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  expect((await admin.from("profiles").update({ account_role: "owner" }).eq("id", ownerId)).error).toBeNull();
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: "http://127.0.0.1:3100" })));
  await page.goto("/settings");
  await expect(page.getByText("Unlimited AI previews for your admin account.", { exact: false })).toBeVisible();
  await expect(page.getByText("2 · Unlimited", { exact: true })).toBeVisible();
  const source = await sharp({ create: { width: 320, height: 200, channels: 4, background: "#dc6a48" } }).png().toBuffer();
  for (let n = 1; n <= 5; n++) {
    await page.goto("/projects/new");
    await expect(page.getByText("Unlimited AI · admin account", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Upload an image to edit", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "admin.png", mimeType: "image/png", buffer: source });
    await page.getByLabel("Project name").fill(`Admin project ${n}`);
    if (n === 1) {
      let interrupt = true;
      await page.route("**/api/cloud-projects", async (route) => {
        if (interrupt && route.request().method() === "POST") {
          interrupt = false;
          await route.fulfill({ status: 503, json: { error: "Synthetic attachment interrupted." } });
        } else await route.continue();
      });
    }
    await page.getByRole("button", { name: "Save project" }).click();
    if (n === 1) {
      await expect(page.getByText("Synthetic attachment interrupted.", { exact: true })).toBeVisible();
      await page.goto("/projects/new?create=ai");
      await expect(page.getByText("admin.png is uploaded.", { exact: false })).toBeVisible();
      await expect(page.getByRole("dialog", { name: "Create with AI" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Create an image with AI", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Finish saving project", exact: false }).click();
      await page.unroute("**/api/cloud-projects");
    }
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
    await expect(page.getByText("Unlimited AI · admin account", { exact: true })).toBeVisible();
  }
  await page.goto("/projects");
  await expect(page.getByText("Private workspace / 7 projects · unlimited admin account", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "New project" })).toBeVisible();
  await page.getByRole("button", { name: "Load more projects" }).click();
  for (let n = 1; n <= 5; n++) await expect(page.getByRole("link", { name: new RegExp(`Admin project ${n}`) })).toBeVisible();
  await page.goto(`/projects/${projectId}`);
  await page.getByTestId("open-transform").click();
  await page.getByRole("radio", { name: "Sketch", exact: true }).click();
  await expect(page.getByTestId("generate-transform")).toBeEnabled();
  await expect(page.getByTestId("generate-transform")).not.toContainText("1 credit");
  await page.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  await page.goto("/projects/new");
  await page.getByRole("button", { name: "Create an image with AI", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Create Image", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("asset-description").fill("A mountain lake at sunrise, with warm light and a quiet shore");
  await expect(page.getByTestId("generate-assets")).not.toContainText("1 credit");
  await page.getByTestId("generate-assets").click();
  await expect(page.getByTestId("use-generated-asset")).toBeEnabled();
  await page.getByTestId("use-generated-asset").click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByText("Unlimited AI · admin account", { exact: true })).toBeVisible();
});
