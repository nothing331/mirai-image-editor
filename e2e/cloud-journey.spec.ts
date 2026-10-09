import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.E2E_CLOUD !== "1", "Requires disposable local Supabase.");

async function reviewAtBothSizes(page: Page, name: string) {
  for (const [size, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, mobile: { width: 375, height: 667 } })) {
    await page.setViewportSize(viewport);
    await expect.poll(() => page.evaluate(() => {
      const surface = document.querySelector(".public-page");
      return !surface || surface.scrollWidth <= surface.clientWidth;
    })).toBe(true);
    await page.screenshot({ path: `test-results/journey-${name}-${size}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("connects access, welcome, project creation, editing, library and account navigation", async ({ page, context }) => {
  test.setTimeout(120_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const ownerId = randomUUID();
  const email = `${ownerId}@example.test`;
  const password = randomUUID() + randomUUID();
  expect((await admin.auth.admin.createUser({ id: ownerId, email, password, email_confirm: true })).error).toBeNull();
  let cookies: Array<{ name: string; value: string }> = [];
  const client = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: {
    getAll: () => cookies,
    setAll: (incoming) => { for (const cookie of incoming) cookies = [...cookies.filter((old) => old.name !== cookie.name), { name: cookie.name, value: cookie.value }]; },
  } });
  expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: `http://127.0.0.1:${process.env.E2E_PORT ?? 3000}` })));
  await page.goto("/");
  await page.getByRole("link", { name: "Check access status", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Approval required." })).toBeVisible();
  await reviewAtBothSizes(page, "access");
  await page.getByRole("button", { name: "Request access", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Request pending." })).toBeVisible();
  await reviewAtBothSizes(page, "pending");

  expect((await admin.from("profiles").update({ status: "active", display_name: "Alex" }).eq("id", ownerId)).error).toBeNull();
  expect((await admin.from("account_allowance_grants").insert({ account_id: ownerId, allowance_key: "initial-ai-images", granted_quantity: 25, granted_by: ownerId })).error).toBeNull();
  await page.goto("/welcome");
  await expect(page.getByRole("heading", { name: "Welcome, Alex." })).toBeVisible();
  await reviewAtBothSizes(page, "welcome");
  await page.getByRole("button", { name: "Acknowledge and continue" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Open my projects" }).click();
  await expect(page.getByRole("heading", { name: "Start with one image." })).toBeVisible();
  await reviewAtBothSizes(page, "empty-projects");
  await page.getByRole("link", { name: "Start a new project" }).click();
  await expect(page.getByRole("button", { name: "Upload an image to edit" })).toBeEnabled();
  await reviewAtBothSizes(page, "choice");
  await page.getByRole("button", { name: "Upload an image to edit" }).click();
  await reviewAtBothSizes(page, "upload");
  await page.getByLabel("Original image").setInputFiles({ name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("invalid") });
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await reviewAtBothSizes(page, "upload-error");
  const image = await sharp({ create: { width: 480, height: 320, channels: 4, background: "#809985" } }).png().toBuffer();
  await page.getByLabel("Original image").setInputFiles({ name: "Quiet landscape.png", mimeType: "image/png", buffer: image });
  await page.getByLabel("Project name").fill("Quiet landscape");
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]+$/);
  await expect(page.getByText("Saved to cloud")).toBeVisible();
  await reviewAtBothSizes(page, "editor");
  await page.getByRole("button", { name: "Export accepted image" }).click();
  await reviewAtBothSizes(page, "export");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My projects" })).toBeVisible();
  await reviewAtBothSizes(page, "library");
  await page.getByLabel("Search projects").fill("no matching name");
  await expect(page.getByText("No projects match that search.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Rename project" }).click();
  await page.getByRole("dialog").getByLabel("Project name").fill("A new perspective");
  await page.route("**/api/cloud-projects/*", (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 503, json: { error: "Try saving again." } }) : route.continue());
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Try saving again.");
  await reviewAtBothSizes(page, "rename-error");
  await page.unroute("**/api/cloud-projects/*");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("A new perspective", { exact: true })).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");
  await reviewAtBothSizes(page, "settings");
  await page.getByRole("navigation").getByRole("link", { name: "Projects", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Move to trash" }).click();
  await expect(page.getByText("No saved originals yet")).toBeVisible();
  await page.getByRole("navigation").getByRole("link", { name: "Trash", exact: true }).click();
  await expect(page.getByText("A new perspective", { exact: true })).toBeVisible();
  await reviewAtBothSizes(page, "trash");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByText("Trash is empty.")).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?signedOut=1$/);
  await expect(page.getByRole("status")).toHaveText("You are signed out.");
  await reviewAtBothSizes(page, "sign-in");
});
