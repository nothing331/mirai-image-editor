import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { signedOriginalRead } from "@/server/assets/original-assets";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";

const rowSchema = z.object({
  id: z.uuid(), owner_id: z.uuid(), name: z.string(), status: z.literal("active"),
  original_upload_id: z.uuid(), current_version_id: z.uuid(), revision: z.number().int(),
  head_version_id: z.uuid(),
  created_at: z.string(), updated_at: z.string(),
});

export interface CloudProject {
  id: string;
  name: string;
  originalUploadId: string;
  currentVersionId: string;
  headVersionId: string;
  revision: number;
  createdAt: string;
  width: number;
  height: number;
  originalName: string;
}

export class CloudProjectError extends Error {
  constructor(readonly code: "invalid" | "not-found" | "conflict" | "quota" | "unavailable", message: string) {
    super(message);
    this.name = "CloudProjectError";
  }
}

const uploadSchema = z.object({
  id: z.uuid(), width: z.number().int().positive(), height: z.number().int().positive(),
  original_name: z.string(),
});

function projectWithUpload(row: unknown, upload: unknown): CloudProject {
  const project = rowSchema.parse(row);
  const original = uploadSchema.parse(upload);
  return {
    id: project.id, name: project.name, originalUploadId: project.original_upload_id,
    currentVersionId: project.current_version_id, headVersionId: project.head_version_id, revision: project.revision,
    createdAt: project.created_at, width: original.width, height: original.height,
    originalName: original.original_name,
  };
}

export async function createCloudProject(ownerId: string, uploadId: string, name: string): Promise<CloudProject> {
  const normalizedName = name.trim();
  if (!normalizedName || normalizedName.length > 80) {
    throw new CloudProjectError("invalid", "Use a project name between 1 and 80 characters.");
  }
  const client = createAdminSupabaseClient();
  const { data, error } = await client.rpc("mirai_create_cloud_project", {
    target_owner: ownerId, target_id: randomUUID(), target_version_id: randomUUID(),
    target_upload_id: uploadId, target_name: normalizedName,
  });
  if (error) {
    if (error.message.includes("project allowance")) throw new CloudProjectError("quota", "The five-project limit has been reached.");
    if (error.message.includes("already attached")) throw new CloudProjectError("conflict", "This image already belongs to a project with another name.");
    if (error.message.includes("ready upload not found")) throw new CloudProjectError("not-found", "Finalized upload not found.");
    throw new CloudProjectError("unavailable", "The project could not be saved. Retry the final step.");
  }
  const project = rowSchema.parse(data);
  const uploadResult = await client.from("asset_uploads")
    .select("id,width,height,original_name").eq("id", project.original_upload_id)
    .eq("owner_id", ownerId).single();
  if (uploadResult.error) throw new CloudProjectError("unavailable", "The saved project could not be opened.");
  return projectWithUpload(project, uploadResult.data);
}

export async function listCloudProjects(ownerId: string): Promise<CloudProject[]> {
  const client = createAdminSupabaseClient();
  const { data, error } = await client.from("cloud_projects")
    .select("id,owner_id,name,status,original_upload_id,current_version_id,head_version_id,revision,created_at,updated_at")
    .eq("owner_id", ownerId).eq("status", "active")
    .order("created_at", { ascending: false }).order("id", { ascending: true }).limit(6);
  if (error || !data) throw new CloudProjectError("unavailable", "Projects could not be loaded.");
  if (!data.length) return [];
  const uploadIds = data.map((row) => row.original_upload_id);
  const uploads = await client.from("asset_uploads")
    .select("id,width,height,original_name").eq("owner_id", ownerId).in("id", uploadIds);
  if (uploads.error || !uploads.data || uploads.data.length !== data.length) {
    throw new CloudProjectError("unavailable", "Project originals could not be loaded.");
  }
  const byId = new Map(uploads.data.map((upload) => [upload.id, upload]));
  return data.map((row) => projectWithUpload(row, byId.get(row.original_upload_id)));
}

export async function getCloudProject(ownerId: string, projectId: string): Promise<CloudProject> {
  const client = createAdminSupabaseClient();
  const { data, error } = await client.from("cloud_projects")
    .select("id,owner_id,name,status,original_upload_id,current_version_id,head_version_id,revision,created_at,updated_at")
    .eq("id", projectId).eq("owner_id", ownerId).eq("status", "active").maybeSingle();
  if (error) throw new CloudProjectError("unavailable", "The project could not be opened.");
  if (!data) throw new CloudProjectError("not-found", "Project not found.");
  const upload = await client.from("asset_uploads")
    .select("id,width,height,original_name").eq("id", data.original_upload_id)
    .eq("owner_id", ownerId).eq("state", "ready").single();
  if (upload.error) throw new CloudProjectError("unavailable", "The original could not be opened.");
  return projectWithUpload(data, upload.data);
}

export async function getCloudProjectImage(ownerId: string, project: CloudProject): Promise<string> {
  return (await signedOriginalRead(ownerId, project.originalUploadId, "base")).url;
}
