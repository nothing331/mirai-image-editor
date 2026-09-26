import { readCloudVersion } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const { id, versionId } = await params;
    const version = await readCloudVersion(ownerId, projectIdSchema.parse(id), projectIdSchema.parse(versionId));
    return Response.json({ version }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
