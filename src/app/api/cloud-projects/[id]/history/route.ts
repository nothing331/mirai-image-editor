import { z } from "zod";
import { listCloudHistory } from "@/server/cloud-projects/cloud-edit-history";
import { authorizedProjectOwner, projectIdSchema, projectResponse } from "@/server/cloud-projects/http";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await authorizedProjectOwner(request, false);
    const projectId = projectIdSchema.parse((await params).id);
    const before = new URL(request.url).searchParams.get("before");
    const beforeSequence = before === null ? undefined : z.coerce.number().int().nonnegative().parse(before);
    const history = await listCloudHistory(ownerId, projectId, beforeSequence);
    return Response.json(history, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
