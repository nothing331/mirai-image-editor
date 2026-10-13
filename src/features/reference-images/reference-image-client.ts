import { maxReferenceDataUrlLength, type ReferenceImage } from "@/shared/reference-images";

/** Compress visual references for transport without changing the user's canvas or original file. */
export async function readReferenceImage(file: File): Promise<ReferenceImage> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Choose a PNG, JPEG, or WebP reference image.");
  if (file.size > 20_000_000) throw new Error("Choose a reference image smaller than 20 MB.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(`“${file.name}” could not be opened. Choose another image.`); }
  try {
    if (bitmap.width * bitmap.height > 16_777_216) throw new Error("Choose a reference image with fewer than 16 million pixels.");
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image preparation is unavailable in this browser.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let dataUrl = canvas.toDataURL("image/png");
    if (dataUrl.length > maxReferenceDataUrlLength) {
      context.globalCompositeOperation = "destination-over";
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    }
    if (dataUrl.length > maxReferenceDataUrlLength) dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    if (dataUrl.length > maxReferenceDataUrlLength) throw new Error("This reference is too detailed to attach. Choose a smaller image.");
    return { name: file.name.slice(0, 160) || "Reference image", dataUrl };
  } finally { bitmap.close(); }
}
