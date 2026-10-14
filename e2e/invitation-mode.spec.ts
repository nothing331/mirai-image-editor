import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";

test.skip(process.env.E2E_INVITATION_MODE !== "1", "Requires invitation mode and disposable local Supabase.");

const closedPages = ["/projects", "/projects/new", "/projects/trash", "/projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/welcome", "/settings", "/account-deletion"];
const closedApis = ["/api/cloud-projects", "/api/cloud-projects/image.png", "/api/original-uploads", "/api/ai/usage", "/api/ai/sessions", "/api/image-edits", "/api/asset-generations", "/api/image-extends/plan", "/api/image-extends/generate", "/api/account/export", "/api/account/deletion", "/api/internal/assets-cleanup", "/api/request-logs", "/api/projects"];

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedInAccount(browser: Browser, owner = false) {
  const admin = adminClient();
  const id = randomUUID();
  const email = `${id}@example.test`;
  const password = randomUUID() + randomUUID();
  expect((await admin.auth.admin.createUser({ id, email, password, email_confirm: true })).error).toBeNull();
  if (owner) expect((await admin.from("profiles").update({ status: "active", account_role: "owner" }).eq("id", id)).error).toBeNull();
  let cookies: Array<{ name: string; value: string }> = [];
  const client = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => cookies,
      setAll: (incoming) => {
        for (const cookie of incoming) cookies = [...cookies.filter((old) => old.name !== cookie.name), { name: cookie.name, value: cookie.value }];
      },
    },
  });
  expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
  const context = await browser.newContext({ baseURL: `http://127.0.0.1:${process.env.E2E_PORT}` });
  await context.addCookies(cookies.map((cookie) => ({ ...cookie, url: `http://127.0.0.1:${process.env.E2E_PORT}` })));
  return { id, email, context, page: await context.newPage(), async dispose() {
    await context.close();
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  } };
}

async function expectProductClosed(context: BrowserContext) {
  for (const path of closedPages) {
    const response = await context.request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers().location, path).toMatch(/\/access$/);
    expect(response.headers()["cache-control"], path).toBe("private, no-store");
  }
  for (const path of closedApis) {
    for (const method of ["GET", "POST"]) {
      const response = await context.request.fetch(path, { method, maxRedirects: 0 });
      expect(response.status(), `${method} ${path}`).toBe(404);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
    }
  }
  expect((await context.request.post("/projects", { maxRedirects: 0 })).status()).toBe(404);
}

test("signed-out visitors can view the landing and signup but cannot reach product routes", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The first image is just the beginning." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/sign-in?next=/access");
  await page.getByRole("link", { name: "Request an invite", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Join the invitation list" })).toBeVisible();
  await page.goto("/sign-in?next=/projects");
  await expect(page.locator('input[name="next"]')).toHaveValue("/access");
  await expectProductClosed(context);
  expect((await context.request.get("/api/health/live")).status()).toBe(200);
  expect((await context.request.get("/api/health/ready")).status()).toBe(200);
  expect((await context.request.get("/landing/mirai-anime.webp")).status()).toBe(200);
  const callback = await context.request.get("/auth/callback", { maxRedirects: 0 });
  expect(callback.headers().location).toMatch(/\/sign-in\?error=callback$/);
});

test("requests survive owner approval while approved members and owners stay out of the workspace", async ({ browser }) => {
  const member = await signedInAccount(browser);
  const owner = await signedInAccount(browser, true);
  try {
    await member.page.goto("/access");
    await member.page.getByRole("button", { name: "Request access", exact: true }).click();
    await expect(member.page.getByRole("heading", { name: "Request pending.", exact: true })).toBeVisible();
    await member.page.reload();
    await expect(member.page.getByRole("heading", { name: "Request pending.", exact: true })).toBeVisible();
    await expectProductClosed(member.context);

    await owner.page.goto("/admin/access");
    const request = owner.page.locator("article").filter({ hasText: member.email });
    await request.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(owner.page.locator("article").filter({ hasText: member.email }).getByRole("button", { name: "Revoke", exact: true })).toBeVisible();
    await member.page.goto("/access");
    await expect(member.page.getByRole("heading", { name: "Access approved.", exact: true })).toBeVisible();
    await expect(member.page.getByText("Your access is approved. The workspace will open when Mirai launches.", { exact: true })).toBeVisible();
    await expect(member.page.getByRole("button", { name: "Request access", exact: true })).toHaveCount(0);
    await member.page.setViewportSize({ width: 375, height: 667 });
    await member.page.screenshot({ path: "test-results/invitation-approved-mobile.png", fullPage: true });
    await member.page.goto("/");
    await expect(member.page.getByRole("link", { name: "Open my projects", exact: true })).toHaveCount(0);
    for (const link of await member.page.getByRole("link", { name: "Check access status", exact: true }).all()) {
      await expect(link).toHaveAttribute("href", "/access");
    }
    await expectProductClosed(member.context);
    expect((await member.context.request.get("/admin/access")).status()).toBe(404);
    await member.page.goto("/sign-in?next=/projects");
    await expect(member.page).toHaveURL(/\/access$/);

    await owner.page.goto("/access");
    await owner.page.getByRole("link", { name: "Manage invitations", exact: true }).click();
    await expect(owner.page).toHaveURL(/\/admin\/access$/);
    await expectProductClosed(owner.context);
    const { data } = await adminClient().from("account_allowance_grants").select("granted_quantity").eq("account_id", member.id);
    expect(data).toEqual([{ granted_quantity: 25 }]);
    await member.page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(member.page.getByRole("status")).toHaveText("You are signed out.");
  } finally {
    await member.dispose();
    await owner.dispose();
  }
});

test("an invitation can be claimed without opening the product or duplicating credits", async ({ browser }) => {
  const member = await signedInAccount(browser);
  const owner = await signedInAccount(browser, true);
  try {
    await owner.page.goto("/admin/access");
    await owner.page.getByLabel("Google email").fill(member.email);
    await owner.page.getByRole("button", { name: "Create link", exact: true }).click();
    const field = owner.page.getByRole("textbox", { name: "Invitation link", exact: true });
    await expect(field).toBeVisible();
    const inviteUrl = await field.inputValue();
    await member.page.goto(inviteUrl);
    await member.page.getByRole("button", { name: "Accept invitation", exact: true }).click();
    await expect(member.page).toHaveURL(/\/access\?approved=1$/);
    await expect(member.page.getByRole("heading", { name: "Access approved.", exact: true })).toBeVisible();
    await member.page.goto(inviteUrl);
    await expect(member.page.getByRole("button", { name: "Accept invitation", exact: true })).toHaveCount(0);
    const { data } = await adminClient().from("account_allowance_grants").select("granted_quantity").eq("account_id", member.id);
    expect(data).toEqual([{ granted_quantity: 25 }]);
    await expectProductClosed(member.context);
  } finally {
    await adminClient().from("invitations").delete().eq("email", member.email);
    await member.dispose();
    await owner.dispose();
  }
});
