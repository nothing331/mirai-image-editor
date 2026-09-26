import { getCloudProject, renameCloudProject } from "@/server/cloud-projects/cloud-projects";
import { readCloudVersion } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";
import { z } from "zod";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const project = await getCloudProject(ownerId, projectIdSchema.parse((await params).id));
    const currentVersion = await readCloudVersion(ownerId, project.id, project.currentVersionId);
    return Response.json({ project, imageUrl: currentVersion.imageUrl, currentVersion, expiresIn: 60 }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const raw = await request.text();
    if (raw.length > 256) return Response.json({ error: "Project details are too large." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(raw); }
    catch { return Response.json({ error: "Check the project name." }, { status: 400 }); }
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).strict().parse(input);
    const project = await renameCloudProject(ownerId, projectIdSchema.parse((await params).id), name);
    return Response.json({ project }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
