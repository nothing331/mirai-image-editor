// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { generateSelectionEdit, alphaPng } from "./selection-edit";
import { FakeEditIntentPlanner } from "./fake-intent-planner";
import { FakeImageEditProvider } from "./fake-provider";
import type { SelectionEditInput } from "./selection-edit";

async function fixture(prompt: string): Promise<SelectionEditInput> {
  const width = 12, height = 10;
  const sourcePng = await sharp({ create: { width, height, channels: 4, background: "#cc6644" } }).png().toBuffer();
  const alpha = Buffer.alloc(width * height); alpha[width * 4 + 5] = 255;
  return { projectId: crypto.randomUUID(), requestId: crypto.randomUUID(), sourcePng, selectionMaskPng: await alphaPng(alpha, width, height), width, height, prompt, boundaryPolicy: "review", references: [] };
}
const plan = (request: Parameters<FakeEditIntentPlanner["plan"]>[0]) => new FakeEditIntentPlanner().plan(request);

describe("prompt-driven selection", () => {
  it("routes a simple color request locally, preserving every outside pixel and calling no image provider", async () => {
    const input = await fixture("Make it blue");
    const generate = vi.fn();
    const result = await generateSelectionEdit(input, undefined, { plan, generate });
    expect(result.response.operation).toBe("recolor");
    expect(result.response.method).toBe("local");
    expect(result.response.color).toBe("#0000ff");
    expect(generate).not.toHaveBeenCalled();
    const source = await sharp(input.sourcePng).ensureAlpha().raw().toBuffer();
    const candidate = await sharp(Buffer.from(result.response.candidateBase64, "base64")).ensureAlpha().raw().toBuffer();
    const selected = 12 * 4 + 5;
    for (let pixel = 0; pixel < 120; pixel++) if (pixel !== selected) expect(candidate.subarray(pixel * 4, pixel * 4 + 4)).toEqual(source.subarray(pixel * 4, pixel * 4 + 4));
    expect(candidate.subarray(selected * 4, selected * 4 + 3)).not.toEqual(source.subarray(selected * 4, selected * 4 + 3));
    expect(result.response.canRefine).toBe(true);
  });

  it.each([["Remove this chair", "remove"], ["Add a lamp", "replace"], ["Give it a wooden material", "restyle"], ["Make it blue and add stripes", "replace"]])("routes %s through one image call", async (prompt, operation) => {
    const generate = vi.fn(request => new FakeImageEditProvider().edit(request));
    const result = await generateSelectionEdit(await fixture(prompt), undefined, { plan, generate });
    expect(result.response.operation).toBe(operation);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ operation, conversational: true }));
  });

  it("keeps reference-guided colors in the generative path", async () => {
    const input = await fixture("Make it blue like reference 1");
    input.references = [{ name: "material.png", dataUrl: `data:image/png;base64,${Buffer.from(input.sourcePng).toString("base64")}` }];
    const result = await generateSelectionEdit(input, undefined, { plan, generate: request => new FakeImageEditProvider().edit(request) });
    expect(result.response.operation).toBe("restyle");
    expect(result.conversation.references).toEqual(input.references);
  });

  it("refines a local preview into an AI proposal while retaining the root source and original references", async () => {
    const input = await fixture("Make it blue");
    const first = await generateSelectionEdit(input, undefined, { plan, generate: vi.fn() });
    const target = vi.fn(request => new FakeImageEditProvider().edit(request));
    const second = await generateSelectionEdit({ ...input, prompt: "Add a tiny emblem", requestId: crypto.randomUUID(), parent: first }, undefined, { plan, generate: target });
    expect(Buffer.from(target.mock.calls[0][0].imagePng)).toEqual(Buffer.from(first.response.candidateBase64, "base64"));
    expect(second.response.operation).toBe("replace");
    expect(second.conversation.edit?.sourceBase64).toBe(Buffer.from(input.sourcePng).toString("base64"));
    expect(second.conversation.refinementPrompts).toEqual(["Add a tiny emblem"]);
    expect(first.conversation.refinementPrompts).toEqual([]);
  });


  it("uses a feathered local candidate as the exact next target without compositing its mask twice", async () => {
    const input = await fixture("Make it blue");
    const alpha = Buffer.alloc(120); alpha[53] = 128;
    input.selectionMaskPng = await alphaPng(alpha, 12, 10);
    const first = await generateSelectionEdit(input, undefined, { plan, generate: vi.fn() });
    const target = vi.fn(request => new FakeImageEditProvider().edit(request));
    await generateSelectionEdit({ ...input, prompt: "Add a tiny emblem", requestId: crypto.randomUUID(), parent: first }, undefined, { plan, generate: target });
    expect(Buffer.from(target.mock.calls[0][0].imagePng)).toEqual(Buffer.from(first.response.candidateBase64, "base64"));
  });

  it("rejects an invalid classification and empty selection before image execution", async () => {
    const input = await fixture("Make it blue");
    const generate = vi.fn();
    const invalid = async () => ({ plan: (await plan({ ...input, imagePng: input.sourcePng })).plan, intent: { operation: "recolor", color: null }, providerRequestId: "bad" });
    await expect(generateSelectionEdit(input, undefined, { plan: invalid as never, generate })).rejects.toThrow();
    const empty = { ...input, selectionMaskPng: await alphaPng(Buffer.alloc(120), 12, 10) };
    await expect(generateSelectionEdit(empty, undefined, { plan, generate })).rejects.toThrow("Select an area");
    expect(generate).not.toHaveBeenCalled();
  });
});
