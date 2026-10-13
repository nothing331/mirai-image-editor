// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { AssetGenerationResponse } from "@/shared/asset-generation";
import type { ReferenceImage } from "@/shared/reference-images";
import { configuredImageConversationModel } from "@/server/ai/openai-image-conversation";
import type { PreviewConversation } from "@/server/ai/preview-conversation";

vi.mock("./provider-factory", () => ({
  assetGenerationCapabilities: () => ({ provider: "fake", model: "fake-asset-generator" }),
  createAssetGenerator: vi.fn(),
}));

import { refineCreationPreview } from "./refine-preview";

async function fixture() {
  const png = await sharp({ create: { width: 16, height: 12, channels: 4, background: "#123456" } }).png().toBuffer();
  const reference: ReferenceImage = { name: "original.png", dataUrl: `data:image/png;base64,${png.toString("base64")}` };
  const creation = { mode: "image" as const, prompt: "An original landscape", treatment: "auto" as const, format: "instagram-post" as const, references: [reference] };
  const conversation: PreviewConversation = { creation, references: [reference], responseId: "owned-provider-response", provider: "fake", imageModel: "fake-asset-generator", languageModel: configuredImageConversationModel(), width: 16, height: 12, refinementPrompts: ["Earlier successful change"] };
  const response: AssetGenerationResponse = { creation, projectId: "session", requestId: crypto.randomUUID(), provider: "fake", providerRequestId: "prior", model: conversation.imageModel, quality: "low", mode: "image", format: creation.format, width: 16, height: 12, prompt: creation.prompt, candidates: [{ id: "candidate", candidateBase64: png.toString("base64"), width: 16, height: 12 }], warnings: [], imageGenerationAttempted: true };
  const parent = { conversation, response: response as unknown as Record<string, unknown> };
  const generate = vi.fn().mockResolvedValue({ providerRequestId: "next", conversationResponseId: "next-owned-response", candidates: [{ ordinal: 0, png }] });
  const refinement = { parentRequestId: response.requestId, prompt: "Use reference 1 to change the background" };
  return { png, reference, parent, generate, refinement };
}

describe("creation refinement references", () => {
  it("uses edited attachments with the owned latest preview and persists them only in the new snapshot", async () => {
    const { png, reference, parent, generate, refinement } = await fixture();
    const replacementPng = await sharp({ create: { width: 16, height: 12, channels: 4, background: "#abcdef" } }).png().toBuffer();
    const replacement = { name: "new-reference.png", dataUrl: `data:image/png;base64,${replacementPng.toString("base64")}` };
    const result = await refineCreationPreview(parent, refinement, { projectId: "session", requestId: crypto.randomUUID() }, undefined, generate, [replacement]);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toMatchObject({ inputImagePng: png, previousResponseId: "owned-provider-response", count: 1, width: 16, height: 12 });
    expect(generate.mock.calls[0][0].referenceImages).toHaveLength(1);
    expect(await sharp(generate.mock.calls[0][0].referenceImages[0]).raw().toBuffer()).toEqual(await sharp(replacementPng).raw().toBuffer());
    expect(generate.mock.calls[0][0].prompt).toContain("Only the REFERENCE images attached to this turn are active references");
    expect(result.conversation.references).toEqual([replacement]);
    expect(result.response.creation).toMatchObject({ references: [replacement] });
    expect(result.conversation.refinementPrompts).toEqual(["Earlier successful change", refinement.prompt]);
    expect(parent.conversation.references).toEqual([reference]);
    expect(parent.conversation.responseId).toBe("owned-provider-response");
  });

  it("inherits references when omitted, but an explicit empty list clears active references", async () => {
    const { parent, generate, refinement, reference } = await fixture();
    const inherited = await refineCreationPreview(parent, refinement, { projectId: "session", requestId: crypto.randomUUID() }, undefined, generate);
    expect(inherited.conversation.references).toEqual([reference]);
    expect(generate.mock.calls[0][0].prompt).toContain("Keep the original reference numbers and their roles");
    const cleared = await refineCreationPreview(parent, refinement, { projectId: "session", requestId: crypto.randomUUID() }, undefined, generate, []);
    expect(generate.mock.calls[1][0].referenceImages).toEqual([]);
    expect(cleared.conversation.references).toEqual([]);
    expect(cleared.response.creation).toMatchObject({ references: [] });
  });

  it("rejects unreadable or excessive attachments before the provider runs", async () => {
    const { parent, generate, refinement, reference } = await fixture();
    for (const references of [[{ name: "broken.png", dataUrl: "data:image/png;base64,YWJj" }], Array(4).fill(reference)]) {
      await expect(refineCreationPreview(parent, refinement, { projectId: "session", requestId: crypto.randomUUID() }, undefined, generate, references)).rejects.toThrow();
    }
    expect(generate).not.toHaveBeenCalled();
    expect(parent.conversation.references).toEqual([reference]);
  });

  it("leaves the parent and its references intact when the provider fails", async () => {
    const { parent, generate, refinement, reference } = await fixture();
    generate.mockRejectedValue(new Error("Provider unavailable"));
    await expect(refineCreationPreview(parent, refinement, { projectId: "session", requestId: crypto.randomUUID() }, undefined, generate, [])).rejects.toThrow("Provider unavailable");
    expect(parent.conversation.references).toEqual([reference]);
    expect(parent.conversation.refinementPrompts).toEqual(["Earlier successful change"]);
  });
});
