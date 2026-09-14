import { expect, test } from "@playwright/test";

test.skip(process.env.MIRAI_AUTH_ENABLED !== "true", "The account journey requires the Wave B auth environment.");

test("cloud landing sends a signed-out visitor to the Google sign-in journey", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Edit boldly. Keep the original." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in with Google" })).toHaveAttribute("href", "/sign-in");
  await expect(page.getByText("Sign in to continue", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Sign in with Google" }).click();
  await expect(page).toHaveURL(/\/sign-in$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Continue with Google." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page.getByText("Signing in does not automatically grant product access.", { exact: false })).toBeVisible();
});

test("sign-in only accepts an internal account return path", async ({ page }) => {
  await page.goto("/sign-in?next=https://attacker.example/account");
  await expect(page.locator('input[name="next"]')).toHaveValue("/access");

  await page.goto("/sign-in?next=/admin/access");
  await expect(page.locator('input[name="next"]')).toHaveValue("/admin/access");
});

test("signed-out private account pages return to sign-in", async ({ page }) => {
  await page.goto("/access");
  await expect(page).toHaveURL(/\/sign-in\?next=\/access$/);

  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/sign-in\?next=\/welcome$/);
});

test("account pages remain readable and scrollable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/sign-in?signedOut=1");

  await expect(page.getByRole("heading", { name: "Continue with Google." })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("You are signed out.");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();

  const viewport = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    canScrollVertically: document.querySelector(".public-page")!.scrollHeight > document.querySelector(".public-page")!.clientHeight,
  }));
  expect(viewport.pageWidth).toBe(viewport.viewportWidth);
  expect(viewport.canScrollVertically).toBe(true);
});
