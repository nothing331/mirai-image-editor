import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { attemptIdSchema, discardAiAttempt, ownedAttempt, readAiResult } from "@/server/cloud-ai/attempts";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const owner = await authorizedProjectOwner(request, false);
    const attempt = await ownedAttempt(owner, attemptIdSchema.parse((await context.params).id));
    const expired = Date.parse(attempt.expires_at) <= Date.now();
    const stored = !expired && ["ready", "accepted"].includes(attempt.status) ? await readAiResult(attempt) : null;
    return Response.json({ id: attempt.id, status: expired && attempt.status === "ready" ? "expired" : attempt.status, workflow: attempt.workflow, inputVersionId: attempt.input_version_id, projectId: attempt.project_id, result: stored?.response ?? null, preview: stored?.acceptance ? stored.acceptance : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return projectResponse(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await discardAiAttempt(await authorizedProjectOwner(request, true), attemptIdSchema.parse((await context.params).id));
    return Response.json({ discarded: true });
  } catch (error) { return projectResponse(error); }
}
