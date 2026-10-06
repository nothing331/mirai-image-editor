import "server-only";
import { authorizedProjectOwner, projectResponse } from "@/server/cloud-projects/http";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
import { CloudProjectError } from "@/server/cloud-projects/cloud-projects";
import { generateCloudEdit, generateCloudExtend, planCloudExtend } from "./editing";
import { generateCloudOriginal } from "./creation";

export function cloudAiMode() { return process.env.MIRAI_AUTH_ENABLED === "true" || ["staging", "beta"].includes(process.env.MIRAI_APP_MODE ?? ""); }

export async function cloudAiPost(request: Request, workflow: "edit" | "extend-plan" | "extend" | "creation") {
  try {
    const owner = await authorizedProjectOwner(request, true);
    if (!readRuntimeEnvironment().aiEnabled) throw new CloudProjectError("unavailable", "AI is currently unavailable. Local edits and export remain available.");
    const length = Number(request.headers.get("content-length"));
    if (length > 13_000_000) throw new CloudProjectError("invalid", "This AI request is too large.");
    // Bound the streamed body too; Content-Length alone is not an admission control.
    const reader = request.body?.getReader();
    if (!reader) throw new CloudProjectError("invalid", "AI request details are required.");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 13_000_000) { await reader.cancel(); throw new CloudProjectError("invalid", "This AI request is too large."); }
      chunks.push(next.value);
    }
    let raw: unknown;
    try { raw = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw new CloudProjectError("invalid", "Check the AI request details."); }
    const result = workflow === "edit" ? await generateCloudEdit(owner, raw)
      : workflow === "extend-plan" ? await planCloudExtend(owner, raw)
      : workflow === "extend" ? await generateCloudExtend(owner, raw)
      : await generateCloudOriginal(owner, raw);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) { return projectResponse(cause); }
}
