// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareReferenceImages } from "./reference-images";

describe("reference image admission", () => {
  it("preserves attachment order and fits large references without stretching them", async () => {
    const input = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "red" } }).png().toBuffer();
    const small = await sharp({ create: { width: 8, height: 12, channels: 3, background: "blue" } }).webp().toBuffer();
    const result = await prepareReferenceImages([
      { name: "wide.png", dataUrl: `data:image/png;base64,${input.toString("base64")}` },
      { name: "small.webp", dataUrl: `data:image/webp;base64,${small.toString("base64")}` },
    ]);
    expect(await sharp(result[0]).metadata()).toMatchObject({ format: "png", width: 1536, height: 768 });
    expect(await sharp(result[1]).metadata()).toMatchObject({ format: "png", width: 8, height: 12 });
  });

  it("rejects excessive counts, unreadable content, and a forged MIME type", async () => {
    const unreadable = { name: "broken.png", dataUrl: "data:image/png;base64,YWJj" };
    await expect(prepareReferenceImages(Array(4).fill(unreadable))).rejects.toThrow(/three/);
    await expect(prepareReferenceImages([unreadable])).rejects.toThrow(/Reference 1 is unreadable/);
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    await expect(prepareReferenceImages([{ name: "forged.jpg", dataUrl: `data:image/jpeg;base64,${png.toString("base64")}` }])).rejects.toThrow(/unreadable/);
  });
});
