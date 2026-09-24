import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { AssetError, normalizeOriginal, readBoundedBody } from "./original-assets";

describe("original image preparation", () => {
  it("preserves source bytes separately from an oriented, source-sized PNG base", async () => {
    const source = await sharp({ create: { width: 2, height: 3, channels: 3, background: "#d76540" } })
      .jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await normalizeOriginal(source, "image/jpeg");
    const baseMeta = await sharp(result.base).metadata();
    expect([result.width, result.height]).toEqual([3, 2]);
    expect([baseMeta.width, baseMeta.height, baseMeta.orientation]).toEqual([3, 2, undefined]);
    expect(Buffer.from(source)).not.toEqual(result.base);
    expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects mismatched signatures and dangerous dimensions", async () => {
    const png = await sharp({ create: { width: 3, height: 2, channels: 4, background: "#abcd" } }).png().toBuffer();
    await expect(normalizeOriginal(png, "image/jpeg")).rejects.toMatchObject({ code: "invalid" } satisfies Partial<AssetError>);
    const wide = await sharp({ create: { width: 2_049, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    await expect(normalizeOriginal(wide, "image/png")).rejects.toMatchObject({ code: "too-large" } satisfies Partial<AssetError>);
  });
});

describe("bounded transfer", () => {
  it("accepts exactly the reserved byte count", async () => {
    const request = new Request("https://example.test/api/original-uploads/id", {
      method: "PUT", headers: { "content-length": "3" }, body: new Uint8Array([1, 2, 3]),
    });
    expect(await readBoundedBody(request, 3)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("rejects missing length and excess streamed bytes", async () => {
    const missing = new Request("https://example.test", { method: "PUT", body: new Uint8Array([1]) });
    await expect(readBoundedBody(missing, 1)).rejects.toMatchObject({ code: "too-large" } satisfies Partial<AssetError>);
    const mismatch = new Request("https://example.test", {
      method: "PUT", headers: { "content-length": "2" }, body: new Uint8Array([1, 2, 3]),
    });
    await expect(readBoundedBody(mismatch, 2)).rejects.toMatchObject({ code: "too-large" } satisfies Partial<AssetError>);
  });
});
