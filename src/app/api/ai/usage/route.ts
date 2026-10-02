import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { aiUsage } from "@/server/cloud-ai/attempts";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
export async function GET(request: Request) {
  try {
    const owner = await authorizedProjectOwner(request, false);
    const usage = await aiUsage(owner);
    return Response.json({ ...usage, enabled: usage.enabled && readRuntimeEnvironment().aiEnabled }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
