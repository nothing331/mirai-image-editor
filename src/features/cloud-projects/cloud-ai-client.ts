import { decodeImage, pixelsToDataUrl } from "@/features/editor/image-data";
import { compositeCandidate } from "@/features/editor/composite";
import type { EditPreview, ImageVersion } from "@/features/editor/types";
import type { AiUsage } from "@/shared/cloud-ai";

export function alphaBase64(data: Uint8ClampedArray | Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < data.length; offset += 32_768) binary += String.fromCharCode(...data.subarray(offset, offset + 32_768));
  return btoa(binary);
}
export async function cloudAiJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The AI request could not be completed.");
  return payload as T;
}

/** A lost acknowledgement recovers the durable result; it never repeats paid work. */
export async function postCloudAi<T>(url: string, payload: { requestId: string } & Record<string, unknown>): Promise<T> {
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) return await cloudAiJson<T>(response);
    return await response.json() as T;
  } catch (cause) {
    const recovered = await fetch(`/api/ai/attempts/${payload.requestId}`, { cache: "no-store" }).catch(() => null);
    if (recovered?.ok) {
      const attempt = await recovered.json() as { status: string; result: T | null };
      if (attempt.result) return attempt.result;
      if (["running", "unknown"].includes(attempt.status)) throw new Error("This AI request is still processing or has an unknown outcome. Check request status before generating again.");
    }
    throw cause;
  } finally { window.dispatchEvent(new CustomEvent("mirai-ai-usage-updated")); }
}
export function fetchAiUsage() { return fetch("/api/ai/usage", { cache: "no-store" }).then(cloudAiJson<AiUsage>); }
export async function discardCloudAiPreview(requestId: string) {
  await cloudAiJson(await fetch(`/api/ai/attempts/${requestId}`, { method: "DELETE" }));
  window.dispatchEvent(new CustomEvent("mirai-ai-usage-updated"));
}
export async function recoverCloudAiPreview(requestId: string, source: ImageVersion): Promise<EditPreview> {
  const attempt = await cloudAiJson<{
    workflow: "remove" | "replace" | "restyle" | "transform" | "extend"; inputVersionId: string;
    result: { candidateBase64: string }; preview: { maskBase64: string; maskWidth: number; maskHeight: number; parameters: EditPreview["parameters"]; width: number; height: number };
  }>(await fetch(`/api/ai/attempts/${requestId}`, { cache: "no-store" }));
  if (attempt.inputVersionId !== source.id || !attempt.result || !attempt.preview) throw new Error("This result belongs to a different input version or is unavailable.");
  const bytes = Uint8Array.from(atob(attempt.result.candidateBase64), (character) => character.charCodeAt(0));
  const candidate = await decodeImage(new File([bytes], "recovered-preview.png", { type: "image/png" }));
  const { preview } = attempt;
  const mask = { id: crypto.randomUUID(), width: preview.maskWidth, height: preview.maskHeight, data: Uint8ClampedArray.from(atob(preview.maskBase64), (character) => character.charCodeAt(0)) };
  const protectedMode = "boundaryPolicy" in preview.parameters && preview.parameters.boundaryPolicy === "protected";
  const pixels = protectedMode ? compositeCandidate(source.pixels, candidate.pixels, mask) : candidate.pixels;
  return { id: crypto.randomUUID(), inputVersionId: source.id, type: attempt.workflow, method: "generative", parameters: preview.parameters, mask, pixels, dataUrl: pixelsToDataUrl(pixels, candidate.width, candidate.height), width: candidate.width, height: candidate.height } as EditPreview;
}
