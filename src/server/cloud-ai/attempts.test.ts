// @vitest-environment node
import { describe, expect, it } from "vitest";
import { confirmedProviderRejection, numericProviderUsage } from "./attempts";
import { decodeAiMask, validateAiDimensions } from "./editing";
import { cloudAiEditSchema } from "@/shared/cloud-ai";

describe("AI admission boundaries", () => {
  it("keeps timeout, network and server outcomes uncertain", () => {
    for (const status of [undefined, 408, 409, 500, 503]) expect(confirmedProviderRejection({ diagnostics: { status } })).toBe(false);
    expect(confirmedProviderRejection(new Error("network"))).toBe(false);
    for (const status of [400, 401, 403, 404, 422, 429]) expect(confirmedProviderRejection({ diagnostics: { status } })).toBe(true);
  });
  it("records nested numeric usage without storing private diagnostic content", () => {
    expect(numericProviderUsage({ input_tokens: 50, details: { cached_tokens: 20 }, prompt: "private", image: "data:image/png;base64,...", invalid: -1 })).toEqual({ input_tokens: 50, "details.cached_tokens": 20 });
  });
  it("rejects empty, mismatched and noncanonical masks", () => {
    expect(() => decodeAiMask(Buffer.alloc(4).toString("base64"), 2, 2)).toThrow("non-empty mask");
    expect(() => decodeAiMask("/w==", 2, 2)).toThrow();
    expect(() => decodeAiMask("/w", 1, 1)).toThrow();
    expect(decodeAiMask("/w==", 1, 1)).toEqual(Buffer.from([255]));
  });
  it("bounds output dimensions and rejects client model or quality overrides", () => {
    for (const dims of [[0, 10], [4096, 1], [10.5, 10], [2048, 2049]]) expect(() => validateAiDimensions(...dims as [number, number])).toThrow();
    expect(() => validateAiDimensions(2048, 2048)).not.toThrow();
    expect(cloudAiEditSchema.safeParse({ model: "premium", quality: "high" }).success).toBe(false);
  });
});
