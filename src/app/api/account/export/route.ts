import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { CloudProjectError } from "@/server/cloud-projects/cloud-projects";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const { data, error } = await createAdminSupabaseClient().rpc("mirai_request_account_export", { target_owner: ownerId });
    if (error || !data) throw new CloudProjectError("unavailable", "Account export could not be requested.");
    return Response.json({ id: data.id, status: data.status }, { status: 202, headers });
  } catch (error) { return projectResponse(error); }
}

export async function GET(request: Request) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const client = createAdminSupabaseClient();
    const { data, error } = await client.from("mirai_maintenance_tasks")
      .select("id,status,created_at,completed_at,result_key,result_expires_at")
      .eq("owner_id", ownerId).eq("kind", "account-export")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new CloudProjectError("unavailable", "Account export status could not be loaded.");
    if (!data) return Response.json({ export: null }, { headers });
    let downloadUrl: string | null = null;
    if (data.status === "complete" && data.result_key && data.result_expires_at
      && new Date(data.result_expires_at).getTime() > Date.now()) {
      const signed = await client.storage.from("mirai-exports").createSignedUrl(data.result_key, 60, {
        download: "mirai-account-export.tar.gz",
      });
      if (signed.error || !signed.data) throw new CloudProjectError("unavailable", "Account export download is unavailable.");
      downloadUrl = signed.data.signedUrl;
    }
    return Response.json({ export: { id: data.id, status: data.status,
      createdAt: data.created_at, completedAt: data.completed_at,
      expiresAt: data.result_expires_at, downloadUrl } }, { headers });
  } catch (error) { return projectResponse(error); }
}
