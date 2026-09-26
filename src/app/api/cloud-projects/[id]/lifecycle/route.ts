import { z } from "zod";
import { changeProjectLifecycle } from "@/server/cloud-projects/cloud-lifecycle";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, true);
    const raw = await request.text();
    if (raw.length > 128) return Response.json({ error: "Project action is too large." }, { status: 413 });
    let input: unknown;
    try { input = JSON.parse(raw); }
    catch { return Response.json({ error: "Check the project action." }, { status: 400 }); }
    const { action } = z.object({ action: z.enum(["trash", "restore", "purge"]) }).strict().parse(input);
    const result = await changeProjectLifecycle(ownerId, projectIdSchema.parse((await params).id), action);
    return Response.json({ result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
