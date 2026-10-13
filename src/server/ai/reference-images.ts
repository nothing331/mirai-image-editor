import sharp from "sharp";
import { referenceImagesSchema } from "@/shared/reference-images";

export class ReferenceImageValidationError extends Error {}

/** Decode before buying provider work; metadata and dimensions supplied by the browser are never trusted. */
export async function prepareReferenceImages(value: unknown): Promise<Uint8Array[]> {
  const parsed = referenceImagesSchema.safeParse(value ?? []);
  if (!parsed.success) throw new ReferenceImageValidationError(parsed.error.issues[0]?.message ?? "Check the reference images.");
  return Promise.all(parsed.data.map(async (reference, index) => {
    try {
      const encoded = reference.dataUrl.split(",")[1];
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.toString("base64") !== encoded) throw new Error("Invalid encoding.");
      const image = sharp(bytes, { limitInputPixels: 16_777_216, animated: false });
      const metadata = await image.metadata();
      const declaredFormat = reference.dataUrl.slice(11, reference.dataUrl.indexOf(";"));
      if (!metadata.width || !metadata.height || metadata.format !== declaredFormat || (metadata.pages ?? 1) > 1) throw new Error("Invalid image.");
      return new Uint8Array(await image.rotate().resize({ width: 1536, height: 1536, fit: "inside", withoutEnlargement: true }).png().toBuffer());
    } catch {
      throw new ReferenceImageValidationError(`Reference ${index + 1} is unreadable. Choose a PNG, JPEG, or WebP image.`);
    }
  }));
}
