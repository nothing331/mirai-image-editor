import { expect, test } from "@playwright/test";

test.skip(
  process.env.MIRAI_AUTH_ENABLED !== "true",
  "The product landing belongs to the authenticated app entry.",
);

test("explains the complete toolkit and lets visitors compare an example without generating", async ({
  page,
}) => {
  const generationRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/api\/(asset-generations|image-edits|image-extends)/.test(request.url())
    )
      generationRequests.push(request.url());
  });
  await page.goto("/");
  for (const title of [
    "Create your starting point",
    "Edit just the part you mean",
    "Try a whole new direction",
    "Give your image more room",
    "Finish the details by hand",
    "Keep every project within reach",
  ]) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toHaveCount(1);
  }
  const slider = page.getByRole("slider", {
    name: "Compare original and monochrome",
  });
  await slider.focus();
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "0% original, 100% monochrome",
  );
  await slider.press("End");
  await expect(slider).toHaveValue("100");
  const credits = page
    .locator("summary")
    .filter({ hasText: "How do private-beta access and AI credits work?" });
  await credits.focus();
  await credits.press("Enter");
  await expect(page.getByText(/25 one-time welcome AI credits/)).toBeVisible();
  const boundaries = page
    .locator("summary")
    .filter({ hasText: "Does a selection keep everything outside unchanged?" });
  await boundaries.click();
  await expect(
    page.getByText(/the default selection is a focus hint/),
  ).toBeVisible();
  expect(generationRequests).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 375, height: 667 },
]) {
  test(`landing navigation and start actions work at ${viewport.width} × ${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Sign in with Google", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("heading", { name: "Edit boldly. Keep the original." }),
    ).toHaveCSS("opacity", "1");
    await page
      .getByRole("heading", { name: "Edit boldly. Keep the original." })
      .evaluate(async (heading) => {
        await Promise.all(
          heading
            .parentElement!.getAnimations()
            .map((animation) => animation.finished),
        );
        await document.fonts.ready;
      });
    await expect
      .poll(() =>
        page
          .getByAltText(
            "A sculptural orange chair beside a sunlit arch overlooking olive hills",
          )
          .evaluate(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
      )
      .toBe(true);
    if (viewport.width <= 760) {
      const contentBottom = await page
        .getByText("Private beta ·")
        .evaluate((element) => element.getBoundingClientRect().bottom);
      const imageTop = await page
        .getByAltText(
          "A sculptural orange chair beside a sunlit arch overlooking olive hills",
        )
        .evaluate((element) => element.getBoundingClientRect().top);
      expect(contentBottom).toBeLessThan(imageTop);
    }
    await page.screenshot({
      path: `test-results/landing-hero-${viewport.width}.png`,
    });
    await page
      .getByRole("link", { name: "Explore the tools", exact: true })
      .click();
    await expect(page).toHaveURL(/#features$/);
    await expect
      .poll(() =>
        page
          .locator("#features")
          .evaluate((section) =>
            Math.round(section.getBoundingClientRect().top),
          ),
      )
      .toBeGreaterThanOrEqual(64);
    await expect(
      page.getByRole("heading", { name: "From first idea to final image." }),
    ).toBeInViewport();
    expect(
      await page
        .locator(".public-page")
        .evaluate((surface) => surface.scrollWidth <= surface.clientWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/landing-features-${viewport.width}.png`,
    });
    await page
      .getByRole("heading", { name: "The image takes center stage." })
      .scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        page
          .getByAltText(
            "Mirai’s editor with the studio image on its canvas and selection tools beside it",
          )
          .evaluate(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
      )
      .toBe(true);
    await page.screenshot({
      path: `test-results/landing-workspace-${viewport.width}.png`,
    });
    await page.getByRole("link", { name: "Get started", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=\/projects$/);
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });
}
