import { expect, test } from "@playwright/test";

test.skip(process.env.MIRAI_AUTH_ENABLED !== "true", "The account journey requires the Wave B auth environment.");

test("cloud landing sends a signed-out visitor to the Google sign-in journey", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Create. Edit. Make it yours." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Request an invite" })).toHaveAttribute("href", "/sign-in?next=/access");
  await expect(page.getByText("Request access or use your invitation. A Google account is required.", { exact: true })).toBeVisible();

  await expect(page.getByRole("link", { name: "I have an invitation", exact: true })).toHaveAttribute("href", "#invitation");
  await page.getByRole("link", { name: "I have an invitation", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Already have an invitation?", exact: true })).toBeInViewport();
  await expect(page.locator("#invitation").getByText("Open your emailed invitation link", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Request an invite" }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=\/access$/, { timeout: 15_000 });
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


test("sign-in failures keep the Google action available", async ({ page }) => {
  await page.goto("/sign-in?error=callback&next=/projects");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("incomplete or expired");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await expect(page.locator('input[name="next"]')).toHaveValue("/projects");
});
