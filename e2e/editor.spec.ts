import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 727 }, { width: 375, height: 568 }]) {
  test(`workspace keeps intake and review actions reachable at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const intake = page.getByLabel("Open an image", { exact: true });
    await intake.focus();
    await expect(intake).toBeFocused();
    await expect(page.getByTestId("open-asset-generator")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Export current image" })).toBeDisabled();
    await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

    await uploadTestImage(page, 320, 200);
    const canvas = await page.getByTestId("editor-canvas").boundingBox();
    expect(canvas!.height).toBeGreaterThanOrEqual(130);
    await expect(page.getByTestId("generate-edit")).toBeInViewport();
    await page.getByRole("radio", { name: "Brush" }).click();
    await expect(page.getByTestId("apply-paint")).toBeDisabled();
    await page.getByTestId("open-lasso-edit").click();
    await drawSourceSelection(page, 2, 2, 16, 16);
    await page.getByLabel("Edit instruction").fill("Make it blue");
    await page.getByTestId("generate-edit").click();
    await expect(page.getByTestId("preview-comparison")).toBeVisible();
    await page.getByLabel("Refinement instruction").fill("Make it green");
    await page.getByTestId("refine-edit-preview").click();
    await expect(page.getByLabel("Refinement instruction")).toHaveValue("");
    await expect(page.getByRole("radiogroup", { name: "Edit operation" })).toHaveCount(0);
    await expect(page.getByTestId("accept-preview")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Discard", exact: true })).toBeInViewport();
    await page.screenshot({ path: `/tmp/mirai-prompt-lasso-review-${viewport.width}.png`, animations: "disabled" });
    await page.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/mirai-prompt-lasso-${viewport.width}.png`, animations: "disabled" });
    await expect.poll(() => page.evaluate(() => ({
      vertical: document.documentElement.scrollHeight === document.documentElement.clientHeight,
      horizontal: document.documentElement.scrollWidth === document.documentElement.clientWidth,
    }))).toEqual({ vertical: true, horizontal: true });
  });
}

test("fake asset generator creates a transparent, auto-saved project with no edit history", async ({ page }) => {
  const conceptName = `Orbital compass ${Date.now()}`;
  await page.goto("/");
  await expect(page.getByTestId("rail-asset-generator")).toBeVisible();
  const aiRailButtons = page.locator('[data-testid="rail-asset-generator"], [data-testid="open-lasso-edit"], [data-testid="open-transform"], [data-testid="open-extend"]');
  await expect(aiRailButtons).toHaveCount(4);
  await expect(page.getByTestId("rail-asset-generator")).toHaveClass(/bg-acid/);
  await expect(page.getByTestId("open-lasso-edit")).toHaveClass(/bg-ink/);
  await expect(page.getByTestId("open-transform")).toHaveClass(/bg-acid/);
  await expect(page.getByTestId("open-extend")).toHaveClass(/bg-acid/);
  const aiButtonPositions = await aiRailButtons.evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().top));
  expect(aiButtonPositions).toEqual([...aiButtonPositions].sort((left, right) => left - right));
  const brushTop = await page.getByRole("radio", { name: "Brush" }).evaluate((button) => button.getBoundingClientRect().top);
  expect(aiButtonPositions.at(-1)).toBeLessThan(brushTop);
  await expect(page.locator("header").getByRole("button", { name: "Create with AI" })).toHaveCount(0);
  await page.getByTestId("rail-asset-generator").click();
  const dialog = page.getByRole("dialog", { name: "Create with AI" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("One low-quality result", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Logo Mark" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tab", { name: "Icon" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Create Image" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: /Transform/ })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByLabel("Color 1")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Custom" }).click();
  await expect(dialog.getByLabel("Color 1")).toBeVisible();
  await dialog.getByRole("button", { name: "Auto" }).click();
  await dialog.getByTestId("asset-description").fill(conceptName);
  await dialog.getByTestId("generate-assets").click();
  await expect(dialog.getByTestId("asset-candidate-1")).toBeVisible();
  await expect(dialog.getByTestId("asset-candidate-2")).toHaveCount(0);
  await expect(dialog.getByText("Transparent PNG")).toHaveCount(1);
  await dialog.getByTestId("use-generated-asset").click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("1024 × 1024px")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Open saved project").locator("option", { hasText: conceptName })).toHaveCount(1);
  await page.getByRole("button", { name: "Diagnostics" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(diagnostics.getByText(/fake · asset-generation · review/)).toBeVisible();
  await expect(diagnostics.getByText("A1 / Provider result")).toBeVisible();
  await expect(diagnostics.getByText("A1 / Ready result")).toBeVisible();
});

test("AI creator applies a treatment and destination format to one complete image", async ({ page }) => {
  const imageConcept = `Mount Everest at sunrise ${Date.now()}`;
  await page.goto("/");
  await page.getByTestId("rail-asset-generator").click();
  const dialog = page.getByRole("dialog", { name: "Create with AI" });

  await dialog.getByRole("tab", { name: "Create Image" }).click();
  await expect(dialog.getByRole("button", { name: /Auto/ })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: /Sketch/ }).click();
  await dialog.getByRole("button", { name: /Story \/ Reel/ }).click();
  await dialog.getByTestId("asset-description").fill(imageConcept);
  await expect(dialog.getByTestId("asset-description")).toHaveValue(imageConcept);
  await dialog.getByTestId("generate-assets").click();
  const generated = dialog.getByTestId("asset-candidate-1");
  await expect(generated).toBeVisible();
  await expect(generated.getByRole("img")).toHaveAttribute("alt", "Generated image");
  await expect(dialog.getByRole("tablist")).toHaveCount(0);
  await expect(dialog.getByTestId("asset-description")).toHaveCount(0);
  await expect(dialog.getByTestId("asset-candidate-2")).toHaveCount(0);
  await expect(dialog.getByTestId("transform-source-input")).toHaveCount(0);

  await expectPreviewDownload(page, dialog, "mirai-image-720x1280.png");
  const previewBeforeBrief = await generated.getByRole("img").getAttribute("src");
  await dialog.getByRole("button", { name: "Create another image", exact: true }).click();
  await expect(dialog.getByRole("tablist")).toBeVisible();
  await expect(dialog.getByTestId("asset-description")).toHaveValue(imageConcept);
  await dialog.getByRole("button", { name: /Photograph/ }).click();
  await dialog.getByRole("button", { name: "Return to image" }).click();
  await expect(generated.getByRole("img")).toHaveAttribute("src", previewBeforeBrief!);
  await expect(dialog.getByRole("tablist")).toHaveCount(0);

  await page.route("**/api/asset-generations", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary provider failure.", retryable: true, imageGenerationAttempted: true }) });
      return;
    }
    await route.continue();
  });
  await dialog.getByLabel("Refinement instruction").fill("Make the sunlight warmer");
  await dialog.getByTestId("refine-created-image").click();
  await expect(dialog.getByRole("alert")).toContainText("Temporary provider failure. You can try again.");
  await expect(generated).toBeVisible();
  await expect(dialog.getByLabel("Refinement instruction")).toHaveValue("Make the sunlight warmer");
  await page.unroute("**/api/asset-generations");

  await dialog.getByTestId("use-generated-asset").click();
  const savedOption = page.getByLabel("Open saved project").locator("option", { hasText: `${imageConcept} image` });
  await expect(savedOption).toHaveCount(1);
  const savedProjectId = await savedOption.getAttribute("value");
  const savedProject = await page.evaluate(async (projectId) => fetch(`/api/projects/${projectId}`).then((response) => response.json()), savedProjectId);
  expect(savedProject.origin).toMatchObject({ creationMode: "image", treatment: "sketch", format: "story-reel", width: 720, height: 1280 });
  expect(savedProject.operations).toHaveLength(0);
});

test("focused creation review keeps a wide image and three references usable on a short phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByTestId("open-asset-generator").click();
  const dialog = page.getByRole("dialog", { name: "Create with AI" });
  await dialog.getByRole("tab", { name: "Create Image" }).click();
  await dialog.getByRole("button", { name: /YouTube Thumbnail/ }).click();
  await dialog.getByTestId("asset-description").fill("A widescreen mountain lake at sunrise");
  const buffer = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 12;
    canvas.getContext("2d")!.fillRect(0, 0, 16, 12);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
  await dialog.getByLabel("Add reference images").setInputFiles([1, 2, 3].map(index => ({ name: `reference-${index}.png`, mimeType: "image/png", buffer })));
  await expect(dialog.getByAltText("Reference 3: reference-3.png")).toBeVisible();
  await dialog.getByTestId("generate-assets").click();
  const preview = dialog.getByTestId("asset-candidate-1");
  await expect(preview).toBeVisible();
  await expect(dialog.getByRole("tablist")).toHaveCount(0);
  await expect(dialog.getByLabel("Add reference images")).toBeDisabled();
  await dialog.getByLabel("Refinement instruction").fill("Make the scene darker");
  await dialog.getByLabel("Refinement instruction").focus();
  await expect(dialog.getByLabel("Refinement instruction")).toBeFocused();
  await expect(dialog.getByTestId("refine-created-image")).toBeInViewport();
  await expect(dialog.getByTestId("use-generated-asset")).toBeInViewport();
  const downloadButton = dialog.getByRole("button", { name: "Download image", exact: true });
  await expect(downloadButton).toBeInViewport();
  await downloadButton.focus();
  await expect(downloadButton).toBeFocused();
  await expect(dialog.getByRole("tooltip")).toHaveCSS("opacity", "1");
  await dialog.getByLabel("Refinement instruction").focus();
  const header = dialog.locator("header");
  expect(await header.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const actionBounds = await dialog.getByTestId("refine-created-image").boundingBox();
  expect(actionBounds!.y + actionBounds!.height).toBeLessThanOrEqual(568);
  expect((await preview.boundingBox())!.height).toBeGreaterThan(140);
  expect(await preview.getByRole("img").evaluate(image => getComputedStyle(image).objectFit)).toBe("contain");
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/mirai-creation-review-short-phone.png", animations: "disabled" });
});

async function expectPreviewDownload(page: Page, dialog: Locator, filename: string) {
  const preview = dialog.getByTestId("asset-candidate-1").getByRole("img");
  const displayedDataUrl = await preview.getAttribute("src");
  const mutations: string[] = [];
  const trackMutation = (request: import("@playwright/test").Request) => {
    if (request.method() !== "GET" && request.method() !== "HEAD") mutations.push(request.url());
  };
  page.on("request", trackMutation);
  try {
    const downloading = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Download image", exact: true }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe(filename);
    expect(await download.failure()).toBeNull();
    expect(await readFile((await download.path())!)).toEqual(Buffer.from(displayedDataUrl!.split(",")[1], "base64"));
    expect(mutations).toEqual([]);
    await expect(preview).toHaveAttribute("src", displayedDataUrl!);
    await expect(dialog).toBeVisible();
  } finally {
    page.off("request", trackMutation);
  }
}

async function uploadTestImage(page: Page, width = 20, height = 20) {
  await page.getByTestId("file-input").evaluate(async (input: HTMLInputElement, dimensions) => {
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#2878b8";
    context.fillRect(0, 0, 20, 20);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!), "image/png"));
    const transfer = new DataTransfer();
    transfer.items.add(new File([blob], "sample.png", { type: "image/png" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { width, height });
  const editorCanvas = page.getByTestId("editor-canvas");
  await expect(editorCanvas).toBeVisible();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-viewport-x"))).toBeGreaterThan(0);
}

async function clickSourcePoint(page: Page, sourceX: number, sourceY: number) {
  const editorCanvas = page.getByTestId("editor-canvas");
  await editorCanvas.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const viewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const viewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const viewportScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  await editorCanvas.locator("canvas").first().click({
    position: {
      x: viewportX + sourceX * viewportScale,
      y: viewportY + sourceY * viewportScale,
    },
  });
}

async function drawSourceSelection(page: Page, left = 3, top = 3, right = 17, bottom = 17) {
  const editorCanvas = page.getByTestId("editor-canvas");
  await editorCanvas.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const bounds = await editorCanvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  const viewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const viewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const viewportScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const point = (x: number, y: number) => ({ x: bounds.x + viewportX + x * viewportScale, y: bounds.y + viewportY + y * viewportScale });
  const start = point(left, top);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const [x, y] of [[right, top], [right, bottom], [left, bottom], [left, top]]) {
    const next = point(x, y);
    await page.mouse.move(next.x, next.y, { steps: 4 });
  }
  await page.mouse.up();
}

test("upload, select, and recolor an image", async ({ page }) => {
  const projectName = `Playwright project ${Date.now()}`;
  await page.goto("/");
  const canvasRegion = page.getByRole("region", { name: "Image canvas" });
  const inspector = page.getByRole("complementary", { name: "Editor tools" });
  const canvasTop = (await canvasRegion.boundingBox())?.y;
  await inspector.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  expect((await canvasRegion.boundingBox())?.y).toBe(canvasTop);
  expect(await page.evaluate(() => ({ pageY: window.scrollY, viewportLocked: document.documentElement.scrollHeight === document.documentElement.clientHeight }))).toEqual({ pageY: 0, viewportLocked: true });
  await inspector.evaluate((element) => element.scrollTo({ top: 0 }));
  await uploadTestImage(page);
  await expect(page.getByText("20 × 20px")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Select an area" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Draw selection on canvas" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add area" })).toHaveCount(0);
  const operationTop = (await page.getByText("Describe the change", { exact: true }).boundingBox())?.y;
  const selectionTop = (await page.getByText("Selection area", { exact: true }).boundingBox())?.y;
  if (operationTop === undefined || selectionTop === undefined) throw new Error("Lasso inspector sections are not visible.");
  expect(operationTop).toBeLessThan(selectionTop);
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  const initialX = Number(await canvas.getAttribute("data-viewport-x"));
  const initialY = Number(await canvas.getAttribute("data-viewport-y"));
  await expect(page.getByRole("heading", { name: "MIRAI", exact: true })).toBeVisible();
  await expect(page.getByText("IMAGE STUDIO", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Size", { exact: true })).toHaveCount(0);
  await page.mouse.move(bounds.x + initialX + 2, bounds.y + initialY + 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + initialX + 17, bounds.y + initialY + 2, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 17, bounds.y + initialY + 17, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 2, bounds.y + initialY + 17, { steps: 4 });
  await page.mouse.move(bounds.x + initialX + 2, bounds.y + initialY + 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("heading", { name: "Edit selected area" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add area" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subtract area" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove selection" })).toBeVisible();
  await page.getByRole("button", { name: "Remove selection" }).click();
  await expect(page.getByRole("button", { name: "Remove selection" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Select an area" })).toBeVisible();
  await drawSourceSelection(page);
  await page.getByRole("button", { name: "Add area" }).click();
  await expect(page.getByText("Draw another closed dashed shape on the image to add its interior.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Invert selection/ })).toBeVisible();
  await page.getByRole("button", { name: /Invert selection/ }).click();
  await expect(page.getByRole("button", { name: "Remove selection" })).toBeVisible();
  await page.getByRole("button", { name: /Invert selection/ }).click();
  await expect(page.getByLabel("Refine size", { exact: true })).toHaveCount(0);
  await expect(canvas).toHaveClass(/tool-lasso/);
  await page.getByRole("button", { name: "Collapse inspector" }).click();
  await expect(page.getByTestId("editor-inspector")).toHaveCount(0);
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(page.getByTestId("editor-inspector")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Select & edit" })).toBeChecked();
  await drawSourceSelection(page, 8, 8, 12, 12);
  await page.getByLabel("Edit instruction").fill("Make it blue");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("redo")).toBeEnabled();
  await page.getByTestId("redo").click();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Open saved project").locator("option", { hasText: projectName })).toHaveCount(1);
  await page.getByLabel("Edit instruction").fill("Make it #22cc66");
  await expect(page.getByTestId("generate-edit")).toBeDisabled();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();

  const scaleBefore = await canvas.getAttribute("data-viewport-scale");
  await canvas.hover({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await page.mouse.wheel(0, -300);
  await expect(canvas).not.toHaveAttribute("data-viewport-scale", scaleBefore!);
  await page.getByRole("radio", { name: "Hand" }).click();
  await expect(page.getByLabel("Size", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Softness")).toHaveCount(0);
  const viewportBefore = await canvas.getAttribute("data-viewport-x");
  const panBounds = await canvas.boundingBox();
  if (!panBounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(panBounds.x + panBounds.width / 2, panBounds.y + panBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(panBounds.x + panBounds.width / 2 + 60, panBounds.y + panBounds.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute("data-viewport-x", viewportBefore!);

  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(canvas).toHaveAttribute("data-viewport-scale", "1");
  await page.keyboard.press("l");
  await expect(page.getByRole("radio", { name: "Select & edit" })).toBeChecked();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export current image" }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.readUInt32BE(16)).toBe(20);
  expect(png.readUInt32BE(20)).toBe(20);

  await page.reload();
  await page.route(/\/api\/projects\/[^/]+$/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.continue();
  });
  await page.getByLabel("Open saved project").selectOption({ label: projectName });
  await expect(page.getByTestId("project-loading-overlay")).toBeVisible();
  await expect(page.getByText("Opening project")).toBeVisible();
  await expect(page.getByText("Opening…", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await expect(page.getByText(/20.+20px/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Diagnostics" })).toBeEnabled();
});

test("brush paint is draft-only until applied and eraser only clears that draft", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page);
  await page.getByRole("radio", { name: "Brush" }).click();
  await expect(page.getByRole("heading", { name: "Brush" })).toBeVisible();
  await expect(page.getByTestId("generate-edit")).toHaveCount(0);
  await page.getByLabel("Brush color").fill("#ff0000");
  await clickSourcePoint(page, 5, 5);
  await expect(page.getByText("1 pending gesture")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await page.getByRole("radio", { name: "Eraser" }).click();
  await expect(page.getByText(/original image is never erased/i)).toBeVisible();
  await clickSourcePoint(page, 5, 5);
  await expect(page.getByText("2 pending gestures")).toBeVisible();
  await page.getByTestId("discard-paint").click();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByTestId("apply-paint")).toBeDisabled();

  await page.getByRole("radio", { name: "Brush" }).click();
  await clickSourcePoint(page, 5, 5);
  await clickSourcePoint(page, 15, 15);
  await page.getByTestId("apply-paint").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByTestId("undo").click();
  await expect(page.getByTestId("redo")).toBeEnabled();

  await page.getByRole("radio", { name: "Hand" }).click();
  await expect(page.getByTestId("editor-inspector")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open inspector" })).toHaveCount(0);
  await page.keyboard.press("l");
  await expect(page.getByRole("radio", { name: "Select & edit" })).toBeChecked();
  await expect(page.getByTestId("editor-inspector")).toBeVisible();
});

test("text, watermark, and crop stay live on canvas and apply without comparison", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page, 320, 200);
  await expect(page.getByText("320 × 200px", { exact: true })).toBeVisible();
  const editorCanvas = page.getByTestId("editor-canvas");
  const sceneCanvas = editorCanvas.locator("canvas").first();

  await page.getByTestId("open-text").click();
  await expect(editorCanvas).toHaveAttribute("data-local-draft", "text");
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  const initialTextCanvas = await sceneCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.getByLabel("Text content").fill("VISIBLE NOW");
  await expect(page.getByRole("button", { name: "Save text" })).toBeVisible();
  await expect.poll(() => sceneCanvas.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(initialTextCanvas);
  const textX = Number(await editorCanvas.getAttribute("data-draft-x"));
  const textY = Number(await editorCanvas.getAttribute("data-draft-y"));
  const textWidth = Number(await editorCanvas.getAttribute("data-draft-width"));
  const textHeight = Number(await editorCanvas.getAttribute("data-draft-height"));
  const textViewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const textViewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const textScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const textBounds = await editorCanvas.boundingBox();
  if (!textBounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(textBounds.x + textViewportX + (textX + textWidth / 2) * textScale, textBounds.y + textViewportY + (textY + textHeight / 2) * textScale);
  await page.mouse.down();
  await page.mouse.move(textBounds.x + textViewportX + (textX + textWidth / 2 + 45) * textScale, textBounds.y + textViewportY + (textY + textHeight / 2 + 20) * textScale, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-draft-x"))).not.toBe(textX);
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByTestId("open-watermark").click();
  await expect(page.getByRole("dialog", { name: "Save your text?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await expect(editorCanvas).toHaveAttribute("data-local-draft", "text");
  await page.getByTestId("open-watermark").click();
  await page.getByTestId("save-local-edit").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);

  await expect(editorCanvas).toHaveAttribute("data-local-draft", "watermark");
  await expect(page.getByRole("button", { name: "Save watermark" })).toBeVisible();
  await page.getByRole("button", { name: "Watermark center" }).click();
  const initialX = Number(await editorCanvas.getAttribute("data-draft-x"));
  const initialY = Number(await editorCanvas.getAttribute("data-draft-y"));
  const viewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const viewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const scale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const bounds = await editorCanvas.boundingBox();
  if (!bounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(bounds.x + viewportX + (initialX + 40) * scale, bounds.y + viewportY + (initialY + 6) * scale);
  await page.mouse.down();
  await page.mouse.move(bounds.x + viewportX + (initialX + 80) * scale, bounds.y + viewportY + (initialY + 30) * scale, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-draft-x"))).not.toBe(initialX);
  await expect(editorCanvas).toHaveAttribute("data-draft-anchor", "free");
  await page.getByRole("button", { name: "Watermark center" }).click();
  await page.getByTestId("open-size-position").click();
  await expect(page.getByRole("dialog", { name: "Save your watermark?" })).toBeVisible();
  await page.getByTestId("save-local-edit").click();
  await expect(page.getByText("2 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);

  await expect(editorCanvas).toHaveAttribute("data-local-draft", "crop");
  await page.getByLabel("Crop aspect ratio").selectOption("1:1");
  await expect(page.getByLabel("Crop width")).toHaveValue("200");
  const cropX = Number(await editorCanvas.getAttribute("data-draft-x"));
  const cropY = Number(await editorCanvas.getAttribute("data-draft-y"));
  const cropWidth = Number(await editorCanvas.getAttribute("data-draft-width"));
  const cropHeight = Number(await editorCanvas.getAttribute("data-draft-height"));
  const cropViewportX = Number(await editorCanvas.getAttribute("data-viewport-x"));
  const cropViewportY = Number(await editorCanvas.getAttribute("data-viewport-y"));
  const cropScale = Number(await editorCanvas.getAttribute("data-viewport-scale"));
  const cropBounds = await editorCanvas.boundingBox();
  if (!cropBounds) throw new Error("Editor canvas has no visible bounds.");
  await page.mouse.move(cropBounds.x + cropViewportX + (cropX + cropWidth) * cropScale, cropBounds.y + cropViewportY + (cropY + cropHeight) * cropScale);
  await page.mouse.down();
  await page.mouse.move(cropBounds.x + cropViewportX + (cropX + cropWidth - 50) * cropScale, cropBounds.y + cropViewportY + (cropY + cropHeight - 50) * cropScale, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => Number(await editorCanvas.getAttribute("data-draft-width"))).toBeLessThan(cropWidth);
  await page.getByRole("button", { name: "Save crop" }).click();
  await expect(page.getByText("150 × 150px", { exact: true })).toBeVisible();
  await expect(page.getByText("3 accepted edits", { exact: true })).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
});

test("Transform works without a selection for local and generative presets", async ({ page }) => {
  const projectName = `Transform project ${Date.now()}`;
  await page.goto("/");
  await uploadTestImage(page);

  const toolRail = page.getByRole("complementary", { name: "Editor tools" });
  for (const label of ["Select & edit", "Brush", "Eraser", "Hand", "AI Transform"]) {
    await toolRail.getByLabel(label, { exact: true }).hover();
    await expect(toolRail.locator(`[data-tooltip="${label}"]`)).toBeVisible();
  }
  await toolRail.getByLabel("Collapse inspector").hover();
  await expect(toolRail.locator('[data-tooltip="Collapse inspector"]')).toBeVisible();
  await toolRail.getByTestId("open-transform").click();
  const transform = page.getByTestId("transform-inspector");
  await expect(transform).toBeVisible();
  await expect(transform.getByText("5 presets + custom")).toBeVisible();
  await expect(transform.getByRole("radio", { name: "Faithful" })).toBeChecked();
  await transform.getByRole("radio", { name: /Monochrome/ }).click();
  await expect(transform.getByText(/no model call/i)).toBeVisible();
  await transform.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();

  await page.getByTestId("undo").click();
  await page.keyboard.press("t");
  await transform.getByRole("radio", { name: /Anime Theme/ }).click();
  await transform.getByLabel("Transformation prompt").fill("Warm nostalgic evening light");
  await transform.getByRole("radio", { name: "Faithful" }).click();
  await transform.getByLabel("Development scenario").selectOption("success");
  await transform.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(transform.getByTestId("generate-transform")).toBeDisabled();
  await expect(transform.getByText("Review on canvas")).toBeVisible();
  await page.getByRole("button", { name: "Adjust" }).click();
  await expect(transform).toBeVisible();
  await expect(transform.getByLabel("Transformation prompt")).toHaveValue("Warm nostalgic evening light");
  await transform.getByTestId("generate-transform").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByRole("button", { name: "Save" }).click();
  await page.reload();
  await page.getByLabel("Open saved project").selectOption({ label: projectName });
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
});

test("Extend plans a target frame before generating and accepts changed dimensions", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page);
  const toolRail = page.getByRole("complementary", { name: "Editor tools" });
  await toolRail.getByLabel("AI Extend", { exact: true }).hover();
  await expect(toolRail.locator('[data-tooltip="AI Extend"]')).toBeVisible();
  await page.getByTestId("open-extend").click();
  const inspector = page.getByTestId("extend-inspector");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("radio", { name: "Smart Reframe" })).toBeChecked();
  await inspector.getByRole("radio", { name: /Story \/ Reel/ }).click();
  await inspector.getByRole("button", { name: "Preview smart frame" }).click();
  await expect(page.getByTestId("extend-plan-canvas")).toBeVisible();
  await expect(page.getByTestId("extend-plan-summary")).toContainText("18 × 32px");
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await inspector.getByRole("button", { name: "Generate extension" }).click();
  await expect(page.getByTestId("extend-processing-overlay")).toBeVisible();
  await expect(page.getByText(/Generating surroundings|Preparing comparison/).first()).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("Complete AI extension")).toBeVisible();
  await expect(page.getByTestId("comparison-source")).toBeVisible();
  await expect(page.getByTestId("comparison-candidate")).toBeVisible();
  await expect(page.getByRole("img", { name: "Original image" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Generated preview" })).toBeVisible();
  await page.getByRole("button", { name: "Diagnostics" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(diagnostics.getByRole("img", { name: "11 / Final preview" })).toBeVisible();
  await expect(diagnostics.getByRole("link", { name: "Open Extend plan" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Adjust frame" }).click();
  await expect(page.getByTestId("extend-plan-canvas")).toBeVisible();
  await expect(page.getByTestId("preview-comparison")).toHaveCount(0);
  await expect(inspector.getByRole("button", { name: "Back to comparison" })).toBeVisible();
  await inspector.getByRole("button", { name: "Back to comparison" }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByTestId("comparison-candidate")).toBeVisible();
  await expect(inspector.getByRole("button", { name: "Back to comparison" })).toHaveCount(0);
  await page.getByRole("button", { name: "Adjust frame" }).click();
  await expect(page.getByTestId("extend-plan-canvas")).toBeVisible();
  await inspector.getByRole("button", { name: "Generate extension" }).click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByTestId("accept-preview").click();
  await expect(page.getByText("18 × 32px")).toBeVisible();
  await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  await page.getByTestId("undo").click();
  await expect(page.getByText("20 × 20px")).toBeVisible();
  await page.getByTestId("redo").click();
  await expect(page.getByText("18 × 32px")).toBeVisible();
});

test("fake provider supports generative success, retry, and failure states", async ({ page }) => {
  await page.goto("/");
  await uploadTestImage(page);
  const canvas = page.getByTestId("editor-canvas");
  await expect(canvas).toBeVisible();
  await drawSourceSelection(page);
  await expect(canvas).toHaveClass(/tool-lasso/);

  await page.getByLabel("Edit instruction").fill("Remove the selected object");
  await page.getByText("Advanced", { exact: true }).click();
  await expect(page.getByLabel("AI edit behavior")).toHaveValue("review");
  await expect(page.getByText("Fake provider scenario")).toBeVisible();
  const scenario = page.getByLabel("Fake provider scenario");
  await scenario.selectOption("success");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Diagnostics" }).click();
  const diagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(diagnostics).toBeVisible();
  await expect(diagnostics.getByText("Visual chain of custody")).toBeVisible();
  await expect(diagnostics.getByText("01 / Source")).toBeVisible();
  await expect(diagnostics.getByText("11 / Final preview")).toBeVisible();
  await expect(diagnostics.getByText("10 / Change map")).toBeVisible();
  await expect(diagnostics.getByText("Candidate scope diagnosis")).toBeVisible();
  await expect(diagnostics.getByText("Browser preserved the complete normalized provider candidate.")).toBeVisible();
  await diagnostics.getByRole("button", { name: "Pin evidence" }).click();
  await expect(diagnostics.getByRole("button", { name: "Unpin" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Unpin" }).click();
  await expect(diagnostics.getByRole("button", { name: "Pin evidence" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Copy for coding agent" }).click();
  await expect(diagnostics.getByRole("button", { name: "Copied" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove selection" }).click();
  await drawSourceSelection(page, 3, 3, 7, 7);


  await page.getByLabel("Edit instruction", { exact: true }).fill("add an Indian flag");
  await scenario.selectOption("success");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await expect(page.getByTestId("replace-scope-mismatch")).toContainText("Review the entire image before accepting");
  await expect(page.getByTestId("accept-preview")).toBeEnabled();
  await page.getByRole("button", { name: "Diagnostics" }).click();
  await expect(diagnostics.getByText("2 recorded calls in this logical request.")).toBeVisible();
  await expect(diagnostics.getByText("Structured edit plan")).toBeVisible();
  await expect(diagnostics.getByText(/surface_graphic/).first()).toBeVisible();
  await expect(diagnostics.getByRole("link", { name: "Open edit plan" })).toBeVisible();
  await diagnostics.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Discard" }).click();


  await page.getByLabel("Edit instruction", { exact: true }).fill("brushed copper");
  await scenario.selectOption("slow");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByTestId("generate-edit")).toContainText("Processing…");
  await expect(page.getByTestId("preview-comparison")).toBeVisible();
  await page.getByRole("button", { name: "Discard" }).click();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await page.getByLabel("Edit instruction").fill("Remove the selected object");
  await scenario.selectOption("retryable-error");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByText("The fake provider is temporarily unavailable.").first()).toBeVisible();
  await page.getByRole("button", { name: "Retry same request" }).click();
  await expect(page.getByRole("button", { name: "Retry same request" })).toBeVisible();
  await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();

  await scenario.selectOption("fatal-error");
  await page.getByTestId("generate-edit").click();
  await expect(page.getByText("The fake provider rejected this edit.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry same request" })).toHaveCount(0);
  await page.getByRole("button", { name: "View diagnostics" }).click();
  const reopenedDiagnostics = page.getByRole("dialog", { name: "Request diagnostics" });
  await expect(reopenedDiagnostics.getByText("The fake provider rejected this edit.").first()).toBeVisible();
  await expect(reopenedDiagnostics.getByText("failed", { exact: true }).first()).toBeVisible();

  const requestEntries = reopenedDiagnostics.getByRole("complementary", { name: "Diagnostic requests" }).locator("button:has(code)");
  await expect(requestEntries).toHaveCount(6);
  const olderRequestId = await requestEntries.nth(1).locator("code").innerText();
  await requestEntries.nth(1).click();
  await expect(reopenedDiagnostics.getByRole("button", { name: `Request ID ${olderRequestId}` })).toBeVisible();
  await reopenedDiagnostics.getByRole("button", { name: "Refresh" }).click();
  await expect(reopenedDiagnostics.getByRole("button", { name: `Request ID ${olderRequestId}` })).toBeVisible();
});

test("compact workspace preserves edit configuration when the inspector collapses", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 727 });
  await page.goto("/");
  await uploadTestImage(page);

  await page.getByLabel("Edit instruction", { exact: true }).fill("add a small paper lantern");
  await page.getByRole("button", { name: "Collapse inspector" }).click();
  await expect(page.getByTestId("editor-inspector")).toHaveCount(0);
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Open inspector" }).click();
  await expect(page.getByLabel("Edit instruction", { exact: true })).toHaveValue("add a small paper lantern");
  await expect(page.getByRole("radiogroup", { name: "Edit operation" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => ({ vertical: document.documentElement.scrollHeight === document.documentElement.clientHeight, horizontal: document.documentElement.scrollWidth === document.documentElement.clientWidth }))).toEqual({ vertical: true, horizontal: true });
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 393, height: 727 }]) {
  test(`reference images stay separate from the canvas at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const buffer = Buffer.from(await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 12;
      const context = canvas.getContext("2d")!; context.fillStyle = "#c54242"; context.fillRect(0, 0, 16, 12);
      return canvas.toDataURL("image/png").split(",")[1];
    }), "base64");
    await page.getByTestId("open-asset-generator").click();
    const dialog = page.getByRole("dialog", { name: "Create with AI" });
    await dialog.getByRole("tab", { name: "Create Image" }).click();
    await dialog.getByLabel("Add reference images").setInputFiles([{ name: "chair.png", mimeType: "image/png", buffer }, { name: "fabric.png", mimeType: "image/png", buffer }]);
    await expect(dialog.getByAltText("Reference 2: fabric.png")).toBeVisible();
    await dialog.getByRole("button", { name: "Remove reference 1" }).click();
    await expect(dialog.getByAltText("Reference 1: fabric.png")).toBeVisible();
    await dialog.getByTestId("asset-description").fill("Create a room using reference 1");
    const creationRequest = page.waitForRequest(request => request.url().endsWith("/api/asset-generations") && request.method() === "POST");
    await dialog.getByTestId("generate-assets").click();
    expect((await creationRequest).postDataJSON().references).toHaveLength(1);
    await expect(dialog.getByTestId("asset-candidate-1")).toBeVisible();
    await expect(dialog.getByRole("tablist")).toHaveCount(0);
    await expect(dialog.getByTestId("asset-description")).toHaveCount(0);
    await expect(dialog.getByText(/This preview’s references/)).toHaveCount(0);
    await expect(dialog.getByText("Visual treatment", { exact: true })).toHaveCount(0);
    await expect(dialog.getByText("Intended format", { exact: true })).toHaveCount(0);
    await dialog.getByLabel("Add reference images").setInputFiles({ name: "next-image.png", mimeType: "image/png", buffer });
    await expect(dialog.getByAltText("Reference 2: next-image.png")).toBeVisible();
    const originalPreview = await dialog.getByTestId("asset-candidate-1").getByRole("img").getAttribute("src");
    let releaseRefinement!: () => void;
    const refinementGate = new Promise<void>(resolve => { releaseRefinement = resolve; });
    await page.route("**/api/asset-generations", async route => {
      if (route.request().method() === "POST") await refinementGate;
      await route.continue();
    });
    await dialog.getByLabel("Refinement instruction").fill("Make the sky darker");
    const refinementRequest = page.waitForRequest(request => request.url().endsWith("/api/asset-generations") && request.method() === "POST");
    const refinementResponse = page.waitForResponse(response => response.url().endsWith("/api/asset-generations") && response.request().method() === "POST");
    await dialog.getByTestId("refine-created-image").click();
    const refinementPayload = (await refinementRequest).postDataJSON();
    expect(refinementPayload.refinement.prompt).toBe("Make the sky darker");
    expect(refinementPayload.references).toHaveLength(2);
    expect(refinementPayload.references[1].name).toBe("next-image.png");
    await expect(dialog.getByTestId("refine-created-image")).toBeDisabled();
    await expect(dialog.getByRole("status")).toHaveText("Refining image…");
    await expect(dialog.getByLabel("Refinement instruction")).toBeDisabled();
    await expect(dialog.getByLabel("Add reference images")).toBeDisabled();
    await expect(dialog.getByTestId("use-generated-asset")).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Download image", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Create another image", exact: true })).toBeDisabled();
    await expect(dialog.getByTestId("asset-candidate-1").getByRole("img")).toHaveAttribute("src", originalPreview!);
    releaseRefinement();
    expect((await (await refinementResponse).json()).creation.references.map((reference: { name: string }) => reference.name)).toEqual(["fabric.png", "next-image.png"]);
    await page.unroute("**/api/asset-generations");
    await expect.poll(() => dialog.getByTestId("asset-candidate-1").getByRole("img").getAttribute("src")).not.toBe(originalPreview);
    await expectPreviewDownload(page, dialog, "mirai-image-1024x1024.png");
    const previewBounds = await dialog.getByTestId("asset-candidate-1").boundingBox();
    const footerBounds = await dialog.getByTestId("creation-review-composer").boundingBox();
    expect(previewBounds!.y + previewBounds!.height).toBeLessThanOrEqual(footerBounds!.y);
    expect(previewBounds!.height).toBeGreaterThan(200);
    await expect(dialog.getByTestId("refine-created-image")).toBeInViewport();
    await expect(dialog.getByTestId("use-generated-asset")).toBeInViewport();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (viewport.width > 1024) {
      expect(previewBounds!.width).toBeGreaterThan(1000);
      const titleBounds = await dialog.getByRole("heading", { name: "Create with AI", exact: true }).boundingBox();
      expect(titleBounds!.y).toBeGreaterThanOrEqual((await dialog.locator("section.editor-dialog").boundingBox())!.y);
    }
    await dialog.getByTestId("creation-review-stage").click({ position: { x: 2, y: 2 } });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `/tmp/mirai-creation-refinement-${viewport.width}.png`, animations: "disabled" });
    await dialog.getByTestId("use-generated-asset").click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
    await page.getByTestId("open-lasso-edit").click();

    await page.getByLabel("Add reference images").setInputFiles({ name: "chair.png", mimeType: "image/png", buffer });
    await expect(page.getByAltText("Reference 1: chair.png")).toBeVisible();
    await page.getByLabel("Edit instruction").fill("Use the chair from reference 1");
    await drawSourceSelection(page, 100, 100, 600, 600);
    const editResponse = page.waitForResponse(response => response.url().endsWith("/api/image-edits") && response.request().method() === "POST");
    await page.getByTestId("generate-edit").click();
    const edit = await (await editResponse).json();
    const diagnostic = await page.request.get(`/api/request-logs/${edit.requestId}`);
    expect(JSON.stringify(await diagnostic.json())).toContain("reference-1.png");
    await expect(page.getByTestId("preview-comparison")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove reference 1" })).toBeDisabled();
    const firstPreview = await page.getByAltText("Generated preview").getAttribute("src");
    await page.getByLabel("Refinement instruction").fill("Make the replacement smaller");
    await page.getByTestId("refine-edit-preview").click();
    await expect.poll(() => page.getByAltText("Generated preview").getAttribute("src")).not.toBe(firstPreview);
    await expect(page.getByText("0 accepted edits", { exact: true })).toBeVisible();
    const retained = await page.getByAltText("Generated preview").getAttribute("src");
    await page.route("**/api/image-edits", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Refinement temporarily unavailable", retryable: true }) }), { times: 1 });
    await page.getByLabel("Refinement instruction").fill("Make it darker");
    await page.getByTestId("refine-edit-preview").click();
    await expect(page.getByTestId("editor-inspector").getByRole("alert")).toContainText("Refinement temporarily unavailable");
    expect(await page.getByAltText("Generated preview").getAttribute("src")).toBe(retained);
    await page.getByRole("button", { name: "Retry same refinement" }).click();
    await expect(page.getByLabel("Refinement instruction")).toHaveValue("");
    await page.screenshot({ path: `/tmp/mirai-refinement-${viewport.width}.png` });
    await page.getByTestId("accept-preview").click();
    await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
    await page.keyboard.press("Control+z");
    await page.keyboard.press("Control+Shift+z");
    await expect(page.getByText("1 accepted edit", { exact: true })).toBeVisible();
  });
}
