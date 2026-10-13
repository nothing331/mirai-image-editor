// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { generateConversationImage } from "./openai-image-conversation";

const mocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create: mocks.create }; } }));

describe("image conversation transport", () => {
  beforeEach(() => mocks.create.mockReset());
  it("continues a saved conversation while explicitly identifying the newest main image and references", async () => {
    mocks.create.mockReturnValue({ withResponse: async () => ({ data: { id: "resp-next", status: "completed", output: [{ type: "image_generation_call", status: "completed", result: "AQI=" }], usage: { input_tokens: 123 } }, request_id: "request-next" }) });
    const result = await generateConversationImage(new OpenAI({ apiKey: "test" }), { prompt: "Make it darker", imageModel: "gpt-image-2", quality: "low", size: "1024x1024",
      mainImage: new Uint8Array([1]), references: [new Uint8Array([2]), new Uint8Array([3])], mask: new Uint8Array([4]), previousResponseId: "resp-parent" });
    const request = mocks.create.mock.calls[0][0];
    expect(request).toMatchObject({ store: true, previous_response_id: "resp-parent", max_tool_calls: 1, parallel_tool_calls: false, tool_choice: { type: "image_generation" } });
    expect(request.tools[0]).toMatchObject({ model: "gpt-image-2", action: "edit", input_image_mask: { image_url: "data:image/png;base64,BA==" } });
    expect(request.input[0].content.map((item: { text?: string }) => item.text).filter(Boolean)).toEqual([
      expect.stringContaining("MAIN IMAGE"), expect.stringContaining("REFERENCE 1"), expect.stringContaining("REFERENCE 2"), "Make it darker",
    ]);
    expect(request.instructions).toContain("Do not ask clarification questions");
    expect(result.conversationResponseId).toBe("resp-next");
    expect(result.providerRequestId).toBe("request-next");
  });

  it("rejects text-only or multiple-image results instead of presenting a false success", async () => {
    for (const output of [[], [{ type: "image_generation_call", status: "completed", result: "AQI=" }, { type: "image_generation_call", status: "completed", result: "AQI=" }]]) {
      mocks.create.mockReturnValue({ withResponse: async () => ({ data: { id: "resp-bad", status: "completed", output }, request_id: "request-bad" }) });
      await expect(generateConversationImage(new OpenAI({ apiKey: "test" }), { prompt: "A scene", imageModel: "gpt-image-2", quality: "low", size: "1024x1024" })).rejects.toMatchObject({ diagnostics: { providerCompleted: true } });
    }
  });
});
