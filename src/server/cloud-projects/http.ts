import { z } from "zod";
import { AccountAccessError, requireAccount } from "@/server/auth/account";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
import { CloudProjectError } from "./cloud-projects";

export const projectIdSchema = z.uuid();
export const createProjectSchema = z.object({
  uploadId: z.uuid(), name: z.string().trim().min(1).max(80),
}).strict();

export async function authorizedProjectOwner(request: Request, mutation: boolean): Promise<string> {
  const environment = readRuntimeEnvironment();
  if (!environment.auth.enabled || environment.mode === "ci") {
    throw new CloudProjectError("not-found", "Not found.");
  }
  if (mutation) {
    const origin = request.headers.get("origin");
    if (!origin || !environment.allowedOrigins.includes(origin)) {
      throw new CloudProjectError("invalid", "Request origin is not allowed.");
    }
  }
  return (await requireAccount("eligible")).profile.id;
}

export function projectResponse(error: unknown): Response {
  let status = 503;
  let message = "The project service is unavailable.";
  if (error instanceof CloudProjectError) {
    status = { invalid: 400, "not-found": 404, conflict: 409, quota: 429, unavailable: 503 }[error.code];
    message = error.message;
  } else if (error instanceof AccountAccessError) {
    status = error.reason === "unauthenticated" ? 401 : error.reason === "unavailable" ? 503 : 403;
    message = error.reason === "unauthenticated" ? "Sign in to continue." : error.reason === "unavailable" ? message : "This account cannot access projects.";
  } else if (error instanceof z.ZodError) {
    status = 400;
    message = "Check the project details.";
  }
  if (status >= 500) console.error("[cloud-projects] Request failed.", error);
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
