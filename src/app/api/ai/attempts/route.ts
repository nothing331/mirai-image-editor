import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { getCloudProject } from "@/server/cloud-projects/cloud-projects";
import { aiError } from "@/server/cloud-ai/attempts";
export async function GET(request: Request) {
  try {
    const owner = await authorizedProjectOwner(request, false);
    const projectId = projectIdSchema.parse(new URL(request.url).searchParams.get("projectId"));
    await getCloudProject(owner, projectId);
    const { data, error } = await createAdminSupabaseClient().from("ai_attempts").select("id,status,workflow,input_version_id,expires_at")
      .eq("owner_id", owner).eq("project_id", projectId).or(`status.in.(running,unknown),and(status.eq.ready,workflow.neq.extend-analysis,expires_at.gt.${new Date().toISOString()})`).order("created_at", { ascending: false }).limit(50);
    if (error) aiError(error.message);
    return Response.json({ attempts: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
