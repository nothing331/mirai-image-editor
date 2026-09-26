import { createCloudProject, listCloudProjects } from "@/server/cloud-projects/cloud-projects";
import { authorizedProjectOwner, createProjectSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  try {
    return Response.json({ projects: await listCloudProjects(await authorizedProjectOwner(request, false)) }, { headers });
  } catch (error) { return projectResponse(error); }
}

export async function POST(request: Request) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const body = await request.text();
    if (body.length > 512) return Response.json({ error: "Project details are too large." }, { status: 413, headers });
    let parsed: unknown;
    try { parsed = JSON.parse(body); }
    catch { return Response.json({ error: "Check the project details." }, { status: 400, headers }); }
    const { uploadId, name } = createProjectSchema.parse(parsed);
    const project = await createCloudProject(ownerId, uploadId, name);
    return Response.json({ project }, { status: 201, headers });
  } catch (error) { return projectResponse(error); }
}
