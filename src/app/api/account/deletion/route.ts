import { z } from "zod";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { createServerSupabaseClient } from "@/server/supabase/server-client";
import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { CloudProjectError } from "@/server/cloud-projects/cloud-projects";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const client = await createServerSupabaseClient();
    const claims = await client.auth.getClaims();
    if (claims.error || claims.data?.claims?.sub !== ownerId) throw new CloudProjectError("invalid", "Sign in again before deleting your account.");
    const sessionId = z.uuid().safeParse(claims.data.claims.session_id);
    if (!sessionId.success) throw new CloudProjectError("invalid", "Sign in again before deleting your account.");
    const { data, error } = await createAdminSupabaseClient().rpc("mirai_request_account_deletion", {
      target_owner: ownerId, target_session: sessionId.data,
    });
    if (error) {
      if (error.message.includes("recent sign-in")) throw new CloudProjectError("conflict", "Sign out and sign in again before deleting your account.");
      throw new CloudProjectError("unavailable", "Account deletion could not be started. Try again.");
    }
    await client.auth.signOut({ scope: "global" });
    return Response.json({ receipt: data.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
