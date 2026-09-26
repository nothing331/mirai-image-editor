import { CloudProjectError } from "@/server/cloud-projects/cloud-projects";
import { commitCloudEdit } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";
const MAX_REQUEST_BYTES = 50 * 1024 * 1024;
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const projectId = projectIdSchema.parse((await params).id);
    const length = Number(request.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_REQUEST_BYTES) {
      throw new CloudProjectError("invalid", "Edit payload is too large.");
    }
    if (!request.body) throw new CloudProjectError("invalid", "Edit payload is empty.");
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_REQUEST_BYTES) {
          await reader.cancel();
          throw new CloudProjectError("invalid", "Edit payload is too large.");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const body = Buffer.concat(chunks);
    let parsed: unknown;
    try { parsed = JSON.parse(body.toString("utf8")); }
    catch { throw new CloudProjectError("invalid", "Check the edit payload."); }
    const receipt = await commitCloudEdit(ownerId, projectId, parsed);
    return Response.json({ receipt }, { headers });
  } catch (error) { return projectResponse(error); }
}
