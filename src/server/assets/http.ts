import { z } from "zod";
import { AccountAccessError, requireAccount } from "@/server/auth/account";
import { readRuntimeEnvironment } from "@/server/config/runtime-environment";
import { AssetError } from "./original-assets";

export const uuid = z.uuid();
export const reservationInput = z.object({
  requestKey: uuid,
  originalName: z.string().trim().min(1).max(180),
  mediaType: z.enum(["image/png", "image/jpeg"]),
  bytes: z.number().int().positive(),
}).strict();

export async function authorizedAssetOwner(request: Request, mutation: boolean, requirement: "eligible" | "owner" = "eligible"): Promise<string> {
  const environment = readRuntimeEnvironment();
  if (!environment.auth.enabled || environment.mode === "ci") {
    throw new AssetError("not-found", "Not found.");
  }
  if (mutation) {
    const origin = request.headers.get("origin");
    if (!origin || !environment.allowedOrigins.includes(origin)) {
      throw new AssetError("invalid", "Request origin is not allowed.");
    }
  }
  const account = await requireAccount(requirement);
  return account.profile.id;
}

export function assetResponse(error: unknown): Response {
  let status = 500;
  let message = "The asset service is unavailable.";
  if (error instanceof AccountAccessError) {
    status = error.reason === "unauthenticated" ? 401 : error.reason === "unavailable" ? 503 : 403;
    message = error.reason === "unauthenticated" ? "Sign in to continue." : error.reason === "unavailable" ? message : "This account cannot upload images.";
  } else if (error instanceof AssetError) {
    status = { invalid: 400, "too-large": 413, quota: 429, "not-found": 404, conflict: 409, unavailable: 503 }[error.code];
    message = error.message;
  } else if (error instanceof z.ZodError) {
    status = 400;
    message = "Check the upload details.";
  }
  if (status >= 500) console.error("[original-assets] Request failed.", error);
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export const privateHeaders = { "Cache-Control": "no-store" };
