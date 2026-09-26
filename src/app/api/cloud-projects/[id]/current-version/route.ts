import { z } from "zod";
import { CloudProjectError } from "@/server/cloud-projects/cloud-projects";
import { selectCloudVersion } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const projectId = projectIdSchema.parse((await params).id);
    const body = await request.text();
    if (body.length > 256) throw new CloudProjectError("invalid", "Version request is too large.");
    const { versionId } = z.object({ versionId: z.uuid() }).strict().parse(JSON.parse(body));
    const pointer = await selectCloudVersion(ownerId, projectId, versionId);
    return Response.json({ pointer }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
