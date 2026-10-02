import "server-only";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { CloudProjectError } from "./cloud-projects";

const lifecycleProject = z.object({ id: z.uuid(), owner_id: z.uuid(), name: z.string(),
  status: z.enum(["active", "trash", "purging"]), deleted_at: z.string().nullable(),
  purge_after: z.string().nullable() });

function lifecycleError(message: string): never {
  if (message.includes("project allowance")) throw new CloudProjectError("quota", "The five-project limit has been reached.");
  if (message.includes("not found")) throw new CloudProjectError("not-found", "Project not found.");
  if (message.includes("cannot be restored") || message.includes("purge already started"))
    throw new CloudProjectError("conflict", "This project can no longer be restored.");
  throw new CloudProjectError("unavailable", "The project action could not be completed. Retry it.");
}

export async function listTrashedProjects(ownerId: string) {
  const client = createAdminSupabaseClient();
  const projects: Array<z.infer<typeof lifecycleProject>> = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("cloud_projects")
      .select("id,owner_id,name,status,deleted_at,purge_after").eq("owner_id", ownerId)
      .eq("status", "trash").order("deleted_at", { ascending: false }).order("id", { ascending: true }).range(offset, offset + pageSize - 1);
    if (error || !data) throw new CloudProjectError("unavailable", "Trash could not be loaded.");
    projects.push(...data.map((row) => lifecycleProject.parse(row)));
    if (data.length < pageSize) break;
  }
  return projects;
}

export async function changeProjectLifecycle(ownerId: string, projectId: string, action: "trash" | "restore" | "purge") {
  const functionName = { trash: "mirai_trash_project", restore: "mirai_restore_project", purge: "mirai_request_project_purge" }[action];
  const { data, error } = await createAdminSupabaseClient().rpc(functionName, {
    target_owner: ownerId, target_project: projectId,
  });
  if (error) lifecycleError(error.message);
  return data;
}
