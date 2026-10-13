import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.skip(process.env.E2E_ACCESS_EMAIL !== "1", "Requires disposable local Supabase and the offline Resend interceptor.");

test("owner approval sends once and invitation failure retries the same link", async ({ page, context }) => {
  test.setTimeout(120_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const admin = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const ownerId = randomUUID(), memberId = randomUUID();
  const ownerEmail = `owner-${ownerId}@example.test`, memberEmail = `member-${memberId}@example.test`;
  const password = randomUUID() + randomUUID();
  const logPath = process.env.ACCESS_EMAIL_TEST_LOG!;
  const responsePath = process.env.ACCESS_EMAIL_TEST_RESPONSE!;
  const emails = () => readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  try {
    expect((await admin.auth.admin.createUser({ id: ownerId, email: ownerEmail, password, email_confirm: true })).error).toBeNull();
    expect((await admin.auth.admin.createUser({ id: memberId, email: memberEmail, password, email_confirm: true })).error).toBeNull();
    expect((await admin.rpc("mirai_bootstrap_owner", { target_account_id: ownerId })).error).toBeNull();
    const member = createClient(url, key, { auth: { persistSession: false } });
    expect((await member.auth.signInWithPassword({ email: memberEmail, password })).error).toBeNull();
    expect((await member.rpc("mirai_request_access")).error).toBeNull();
    let cookies: Array<{ name: string; value: string }> = [];
    const owner = createServerClient(url, key, { cookies: {
      getAll: () => cookies,
      setAll: incoming => { for (const cookie of incoming) cookies = [...cookies.filter(old => old.name !== cookie.name), { name: cookie.name, value: cookie.value }]; },
    } });
    expect((await owner.auth.signInWithPassword({ email: ownerEmail, password })).error).toBeNull();
    await context.addCookies(cookies.map(cookie => ({ ...cookie, url: "http://127.0.0.1:3120" })));
    await page.goto("/admin/access");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Email sent. Inbox delivery depends", { exact: false })).toBeVisible();
    expect(emails()).toHaveLength(1);
    expect(emails()[0].message.to).toEqual([memberEmail]);
    const approvalResponse = page.waitForResponse(response => response.request().method() === "POST" && response.url().includes("/admin/access"));
    await page.getByRole("button", { name: "Send approval email", exact: true }).click();
    await (await approvalResponse).finished();
    await expect(page.getByRole("button", { name: "Send approval email", exact: true })).toBeEnabled();
    expect(emails()).toHaveLength(1);
    const grants = await admin.from("account_allowance_grants").select("granted_quantity").eq("account_id", memberId);
    expect(grants.data).toEqual([{ granted_quantity: 25 }]);

    writeFileSync(responsePath, "422");
    await page.getByLabel("Google email", { exact: true }).focus();
    await expect(page.getByLabel("Google email", { exact: true })).toBeFocused();
    await page.getByLabel("Google email", { exact: true }).fill(`invite-${randomUUID()}@example.test`);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText("Access is saved, but the email could not be sent.", { exact: false })).toBeVisible();
    const link = await page.getByRole("textbox", { name: "Invitation link" }).inputValue();
    expect(link).toContain("http://127.0.0.1:3120/access?invite=");
    writeFileSync(responsePath, "200");
    await page.getByRole("button", { name: "Retry invitation email", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Invite someone", exact: true }).locator("..").getByText("Email sent. Inbox delivery depends", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry invitation email", exact: true })).toHaveCount(0);
    expect(await page.getByRole("textbox", { name: "Invitation link" }).inputValue()).toBe(link);
    expect(emails()).toHaveLength(3);
    expect(emails()[1].key).toBe(emails()[2].key);
    expect(emails()[2].message.text).toContain(link);
    for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/access-email-${viewport.width}.png`, fullPage: true });
    }
  } finally {
    await admin.auth.admin.deleteUser(memberId);
    await admin.from("invitations").delete().eq("invited_by", ownerId);
    await admin.auth.admin.deleteUser(ownerId);
  }
});
