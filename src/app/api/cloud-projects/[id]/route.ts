import { getCloudProject } from "@/server/cloud-projects/cloud-projects";
import { readCloudVersion } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const project = await getCloudProject(ownerId, projectIdSchema.parse((await params).id));
    const currentVersion = await readCloudVersion(ownerId, project.id, project.currentVersionId);
    return Response.json({ project, imageUrl: currentVersion.imageUrl, currentVersion, expiresIn: 60 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
