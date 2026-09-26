import { decodeImage } from "@/features/editor/image-data";
import type { EditOperation, ImageVersion, MaskAsset } from "@/features/editor/types";

export interface CloudVersionSummary {
  id: string;
  parentVersionId: string | null;
  kind: "original" | "edit";
  width: number;
  height: number;
  sequence: number;
  createdAt: string;
  operationType?: string | null;
  nextVersionId?: string | null;
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The cloud project request failed.");
  return body as T;
}

export async function loadCloudVersion(projectId: string, versionId: string): Promise<{ image: ImageVersion; summary: CloudVersionSummary }> {
  const route = `/api/cloud-projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`;
  const { version } = await responseJson<{ version: CloudVersionSummary }>(await fetch(route, { cache: "no-store" }));
  const image = await fetch(`${route}/image`, { cache: "no-store" });
  if (!image.ok) throw new Error("The saved image could not be loaded.");
  const decoded = await decodeImage(new File([await image.blob()], "saved-version.png", { type: "image/png" }));
  if (decoded.width !== version.width || decoded.height !== version.height) {
    throw new Error("The saved image dimensions do not match its history record.");
  }
  return { image: { ...decoded, id: version.id, parentVersionId: version.parentVersionId, mediaType: "image/png" }, summary: version };
}

export async function loadCloudHistory(projectId: string, before?: number) {
  const query = before === undefined ? "" : `?before=${encodeURIComponent(before)}`;
  return responseJson<{ versions: CloudVersionSummary[]; nextCursor: number | null }>(
    await fetch(`/api/cloud-projects/${encodeURIComponent(projectId)}/history${query}`, { cache: "no-store" }),
  );
}

export async function selectCloudVersion(projectId: string, versionId: string) {
  return responseJson<{ pointer: { currentVersionId: string; headVersionId: string; revision: number } }>(
    await fetch(`/api/cloud-projects/${encodeURIComponent(projectId)}/current-version`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionId }),
    }),
  );
}

function maskBase64(mask: MaskAsset): string {
  let binary = "";
  for (let offset = 0; offset < mask.data.length; offset += 32_768) {
    binary += String.fromCharCode(...mask.data.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

export interface CloudPendingEdit {
  input: ImageVersion;
  output: ImageVersion;
  operation: EditOperation;
  mask: MaskAsset;
}

export async function saveCloudEdit(projectId: string, pending: CloudPendingEdit, keys: { requestKey: string; assetId: string }, replaceFuture: boolean) {
  const response = await fetch(`/api/cloud-projects/${encodeURIComponent(projectId)}/edits`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...keys, inputVersionId: pending.input.id, outputVersionId: pending.output.id,
      replaceFuture, outputDataUrl: pending.output.dataUrl,
      maskAlphaBase64: maskBase64(pending.mask), maskWidth: pending.mask.width,
      maskHeight: pending.mask.height, operation: pending.operation,
    }),
  });
  return responseJson<{ receipt: { output_version_id: string; revision: number } }>(response);
}
