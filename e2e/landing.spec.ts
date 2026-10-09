import { expect, test } from "@playwright/test";

test.skip(
  process.env.MIRAI_AUTH_ENABLED !== "true",
  "The product landing belongs to the authenticated app entry.",
);

test("motion respects the live OS preference without a playback control", async ({ page }) => {
  await page.goto("/");
  const surface = page.locator("main.public-page");
  await expect(surface).toHaveAttribute("data-motion", "running");
  await expect(page.getByRole("button", { name: /Pause animations|Resume animations/ })).toHaveCount(0);
  const visual = page.locator("#edit-story [data-parallax-visual]").first();
  await visual.scrollIntoViewIfNeeded();
  const initial = await visual.evaluate(element => getComputedStyle(element).transform);
  await surface.evaluate(element => element.scrollBy({ top: 180, behavior: "instant" }));
  await expect.poll(() => visual.evaluate(element => getComputedStyle(element).transform)).not.toBe(initial);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(surface).toHaveAttribute("data-motion", "static");
  await expect(visual).toHaveCSS("transform", "none");
  await expect(page.locator("[data-reveal]").last()).toHaveCSS("opacity", "1");
  const template = page.getByRole("button", { name: "Explore Photograph template", exact: true });
  await template.hover();
  await expect(template.locator("img")).toHaveCSS("transform", "none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(surface).toHaveAttribute("data-motion", "running");
});

test("sections reveal on navigation while the workspace stays stationary", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("main.public-page")).toHaveAttribute(
    "data-motion",
    "running",
  );
  const article = page.getByRole("article").filter({
    has: page.getByRole("heading", {
      name: "Create your starting point",
      exact: true,
    }),
  });
  await expect(article).toHaveAttribute("data-reveal-state", "pending");
  await page
    .getByRole("link", { name: "Explore the tools", exact: true })
    .click();
  await article.scrollIntoViewIfNeeded();
  await expect(article).toHaveAttribute("data-reveal-state", "visible");
  await expect(article).toHaveCSS("opacity", "1");
  await expect(page.locator("[data-motion-loop]")).toHaveCount(0);
  await expect(page.locator("#landing-content img").first()).toHaveCSS("transform", "none");
});

test("landing content and entry links remain available without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.locator("main.public-page")).toHaveAttribute(
    "data-motion",
    "static",
  );
  await expect(page.locator("#workflow li")).toHaveCount(4);
  await expect(page.locator("#workspace-tour figure")).toHaveCount(4);
  await expect(
    page.getByRole("heading", {
      name: "Create your starting point",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .locator("summary")
    .filter({ hasText: "What happens to my original image?" })
    .click();
  await expect(page.getByText(/Saved edits are flattened/)).toBeVisible();
  await page.getByRole("link", { name: "Request early access", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in\?next=\/access$/);
  await context.close();
});

test("shows a complete real edit and supports keyboard exploration of the horizontal tour", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /\/api\/(asset-generations|image-edits|image-extends)/.test(request.url())) requests.push(request.url());
  });
  await page.goto("/");
  for (const title of ["Start with an idea.", "Change what matters.", "See what actually changes.", "Make it ready to use."]) {
    await expect(page.locator("#workflow").getByRole("heading", { name: title, exact: true })).toHaveCount(1);
  }
  await expect(page.locator("#workflow").getByAltText("After: Mirai replaced the lime glasses with polished chrome glasses")).toHaveAttribute("src", /mirai-portrait-chrome/);
  const tour = page.locator("#workspace-tour");
  const rail = tour.getByRole("region", { name: "Horizontal editor walkthrough" });
  await rail.focus();
  await rail.press("ArrowRight");
  await expect(tour.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute("aria-current", "step");
  await rail.press("End");
  await expect(tour.getByRole("button", { name: "Keep", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(tour.getByRole("button", { name: "Next workspace step" })).toBeDisabled();
  await rail.press("Home");
  await expect(tour.getByRole("button", { name: "Start", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(tour.getByRole("button", { name: "Previous workspace step" })).toBeDisabled();
  expect(requests).toEqual([]);
});

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
  await page.getByRole("button", { name: "Explore Watercolor template", exact: true }).click();
  await expect(page.getByRole("button", { name: "Explore Watercolor template", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#creation-prompt")).toContainText("A sunlit lemon tree");
  await page.getByRole("button", { name: "Explore Anime template", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#creation-prompt")).toContainText("A fox explorer");
  await expect(page.getByRole("button", { name: "Explore Watercolor template", exact: true })).toHaveAttribute("aria-pressed", "false");
  const slider = page.getByRole("slider", {
    name: "Compare original and AI edit",
  });
  await slider.focus();
  expect(
    await slider.evaluate(
      (element) => element.closest("figure")?.dataset.revealState,
    ),
  ).toBe("focused");
  await slider.press("Home");
  await expect(slider).toHaveValue("0");
  await expect(slider).toHaveAttribute(
    "aria-valuetext",
    "0% original, 100% AI edit",
  );
  await page.getByAltText("Mirai AI Transform proposal with charcoal ink, ivory paper, and lime sunglasses").scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      page
        .getByAltText(
          "Mirai AI Transform proposal with charcoal ink, ivory paper, and lime sunglasses",
        )
        .evaluate(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ),
    )
    .toBe(true);
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
      page.getByRole("link", { name: "Request an invite", exact: true }),
    ).toBeInViewport();
    await expect(
      page.getByRole("heading", { name: "The first image is just the beginning." }),
    ).toHaveCSS("opacity", "1");
    await page
      .getByRole("heading", { name: "The first image is just the beginning." })
      .evaluate(async (heading) => {
        await Promise.all(
          heading
            .parentElement!.getAnimations({ subtree: true })
            .map((animation) => animation.finished),
        );
        await document.fonts.ready;
      });
    await expect
      .poll(() =>
        page
          .locator("#landing-content")
          .getByAltText(
            "AI-created editorial portrait with acid-lime sunglasses against a charcoal background",
          )
          .evaluate(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
      )
      .toBe(true);
    if (viewport.width > 760) await expect(page.locator("#landing-content img").first()).toBeInViewport();
    await expect(page.locator("#landing-content img").first()).toHaveAttribute(
      "src", /mirai-portrait/,
    );
    expect(await page.locator("#landing-content img").first().evaluate(
      (image) => image.getBoundingClientRect().top,
    )).toBeLessThan(viewport.height + 120);
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
      page.getByRole("heading", { name: "Tools for every part of your edit." }),
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
      .getByRole("heading", { name: "Save your work. Export your image." })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `test-results/landing-workspace-${viewport.width}.png`,
    });
    await page.getByRole("link", { name: "Request early access", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=\/access$/);
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });
}
