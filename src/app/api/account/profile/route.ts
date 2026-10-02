import { z } from "zod";
import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { createServerSupabaseClient } from "@/server/supabase/server-client";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const raw = await request.text();
    if (raw.length > 256) return Response.json({ error: "Profile details are too large." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(raw); }
    catch { return Response.json({ error: "Check the display name." }, { status: 400 }); }
    const { displayName } = z.object({ displayName: z.string().trim().min(1).max(80) }).strict().parse(input);
    const client = await createServerSupabaseClient();
    const { error } = await client.from("profiles").update({ display_name: displayName }).eq("id", ownerId);
    if (error) throw error;
    return Response.json({ displayName }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
