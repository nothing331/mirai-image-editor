// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), edit: vi.fn(), responses: vi.fn() }));
vi.mock("openai", () => ({
  toFile: vi.fn(async (image) => image),
  default: class MockOpenAI {
    static APIError = class APIError extends Error {};
    images = { generate: mocks.generate, edit: mocks.edit };
    responses = { create: mocks.responses };
  },
}));

import { OpenAIAssetGenerator } from "./openai-provider";

describe("OpenAIAssetGenerator", () => {
  beforeEach(() => { mocks.generate.mockReset(); mocks.edit.mockReset(); mocks.responses.mockReset(); });

  it("requests one low-quality image and decodes its PNG", async () => {
    const first = Buffer.from("candidate-one");
    mocks.generate.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({
      data: { created: 1, data: [{ b64_json: first.toString("base64") }] },
      request_id: "openai-generation-1",
    }) });
    const result = await new OpenAIAssetGenerator("test-key", "gpt-image-2").generate({
      mode: "mark",
      prompt: "a strict symbol prompt",
      count: 1,
      width: 1024,
      height: 1024,
      quality: "low",
      matteColor: "#00d9ff",
      colors: ["#171714"],
    });

    expect(mocks.generate).toHaveBeenCalledWith({ model: "gpt-image-2", prompt: "a strict symbol prompt", n: 1, size: "1024x1024", quality: "low", output_format: "png" });
    expect(result.providerRequestId).toBe("openai-generation-1");
    expect(Buffer.from(result.candidates[0].png)).toEqual(first);
  });

  it("passes a server-approved flexible size through the image conversation", async () => {
    const output = Buffer.from("portrait-image");
    mocks.responses.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { id: "resp-1", status: "completed", output: [{ type: "image_generation_call", status: "completed", result: output.toString("base64") }] }, request_id: "openai-image-1" }) });

    const result = await new OpenAIAssetGenerator("test-key", "gpt-image-2").generate({ mode: "image", prompt: "a graphite mountain", count: 1, width: 1024, height: 1280, quality: "low", matteColor: null, colors: [] });

    expect(mocks.responses).toHaveBeenCalledWith(expect.objectContaining({ tools: [expect.objectContaining({ model: "gpt-image-2", size: "1024x1280", quality: "low" })], max_tool_calls: 1 }));
    expect(Buffer.from(result.candidates[0].png)).toEqual(output);
  });
  it("labels ordered reference images in the image conversation", async () => {
    mocks.responses.mockReturnValue({ withResponse: vi.fn().mockResolvedValue({ data: { id: "resp-refs", status: "completed", output: [{ type: "image_generation_call", status: "completed", result: Buffer.from("output").toString("base64") }] }, request_id: "references-1" }) });
    const references = [new Uint8Array([1]), new Uint8Array([2])];
    await new OpenAIAssetGenerator("test-key").generate({ mode: "image", prompt: "Combine reference 1 and 2", referenceImages: references, count: 1, width: 1024, height: 1024, quality: "low", matteColor: null, colors: [] });
    expect(mocks.generate).not.toHaveBeenCalled();
    const content = mocks.responses.mock.calls[0][0].input[0].content;
    expect(content.filter((part: { type: string }) => part.type === "input_image")).toHaveLength(2);
    expect(content[0].text).toContain("REFERENCE 1");
    expect(content[2].text).toContain("REFERENCE 2");
    expect(mocks.edit).not.toHaveBeenCalled();
  });

});
