import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { createAiSession } from "@/server/cloud-ai/attempts";
export async function POST(request: Request) {
  try { return Response.json(await createAiSession(await authorizedProjectOwner(request, true))); }
  catch (error) { return projectResponse(error); }
}
