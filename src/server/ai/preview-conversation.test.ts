// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readLocalPreview, saveLocalPreview, visibleEditPreview, type PreviewConversation } from "./preview-conversation";
import { refineSelectionPreview } from "./refine-preview";

async function png(pixels: number[]) { return sharp(Buffer.from(pixels), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer(); }
async function fixture() {
  const source = await png([10, 20, 30, 255, 40, 50, 60, 255]);
  const candidate = await png([100, 110, 120, 255, 200, 210, 220, 255]);
  const mask = await png([255, 255, 255, 255, 255, 255, 255, 0]);
  const conversation: PreviewConversation = { responseId: null, languageModel: "gpt-5.4-mini-2026-03-17", provider: "fake", imageModel: "fake-image-editor", width: 2, height: 1,
    references: [], refinementPrompts: [], edit: { operation: "replace", boundaryPolicy: "protected", prompt: "A chair", sourceBase64: source.toString("base64"),
      selectionMaskBase64: mask.toString("base64"), providerMaskBase64: mask.toString("base64") } };
  return { conversation, response: { candidateBase64: candidate.toString("base64") }, candidate };
}

describe("preview conversation state", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
  it("scopes private local snapshots and rejects unavailable context", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "mirai-conversations-"));
    vi.stubEnv("MIRAI_LOCAL_CONVERSATION_DIR", directory);
    try {
      const parent = await fixture();
      await saveLocalPreview("project-a", "request-a", parent.conversation, parent.response);
      expect((await readLocalPreview("project-a", "request-a")).conversation).toEqual(parent.conversation);
      await expect(readLocalPreview("project-b", "request-a")).rejects.toThrow("unavailable or expired");
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now + 24 * 60 * 60 * 1000 + 1);
      await expect(readLocalPreview("project-a", "request-a")).rejects.toThrow("unavailable or expired");
    } finally { await rm(directory, { recursive: true }); }
  });

  it("uses the visible protected composite as the next target and retains the complete new proposal", async () => {
    vi.stubEnv("IMAGE_EDIT_PROVIDER", "fake");
    const parent = await fixture();
    const visible = await visibleEditPreview(parent.candidate, parent.conversation.edit!, 2, 1);
    expect([...await sharp(visible).ensureAlpha().raw().toBuffer()]).toEqual([100, 110, 120, 255, 40, 50, 60, 255]);
    const generate = vi.fn<(_: import("./contracts").ImageEditRequest) => Promise<import("./contracts").ProviderCandidate>>().mockResolvedValue({ candidatePng: parent.candidate, providerRequestId: "next", conversationResponseId: "resp-next" });
    const refined = await refineSelectionPreview(parent, { parentRequestId: crypto.randomUUID(), prompt: "Darker" }, { projectId: "project-a", requestId: "next" }, undefined, undefined, generate);
    expect([...await sharp(generate.mock.calls[0][0].imagePng).ensureAlpha().raw().toBuffer()]).toEqual([100, 110, 120, 255, 40, 50, 60, 255]);
    expect(refined.response.candidateBase64).toBe(parent.response.candidateBase64);
    expect(refined.conversation.refinementPrompts).toEqual(["Darker"]);
    expect(parent.conversation.refinementPrompts).toEqual([]);
  });
});
