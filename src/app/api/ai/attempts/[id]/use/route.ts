import { z } from "zod";
import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { attemptIdSchema } from "@/server/cloud-ai/attempts";
import { attachCloudOriginal } from "@/server/cloud-ai/creation";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await authorizedProjectOwner(request, true);
    const { name } = z.object({ name: z.string().trim().min(1).max(80) }).strict().parse(await request.json());
    return Response.json({ project: await attachCloudOriginal(owner, attemptIdSchema.parse((await context.params).id), name) });
  } catch (error) { return projectResponse(error); }
}
