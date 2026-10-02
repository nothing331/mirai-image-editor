import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/server/supabase/session-proxy";

const cloudSpikePath = "/api/internal/cloud-spike";
const cloudHealthPaths = new Set(["/api/health/live", "/api/health/ready"]);
const cloudAssetPath = /^\/api\/original-uploads(?:\/|$)/;
const cloudProjectsPath = /^\/api\/cloud-projects(?:\/|$)/;
const cloudAiPath = /^\/api\/ai(?:\/|$)/;
const cloudGenerationPaths = new Set(["/api/image-edits", "/api/image-extends/plan", "/api/image-extends/generate", "/api/asset-generations"]);
const cloudAccountPath = /^\/api\/account(?:\/|$)/;
const cloudAssetCleanupPath = "/api/internal/assets-cleanup";

export async function proxy(request: NextRequest) {
  const isApiPath = request.nextUrl.pathname.startsWith("/api/");
  if (
    isApiPath &&
    process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT === "true" &&
    request.nextUrl.pathname !== cloudSpikePath
  ) {
    return Response.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (
    isApiPath &&
    (process.env.MIRAI_APP_MODE === "staging" || process.env.MIRAI_APP_MODE === "beta") &&
    !cloudHealthPaths.has(request.nextUrl.pathname) &&
    !cloudAssetPath.test(request.nextUrl.pathname) &&
    !cloudProjectsPath.test(request.nextUrl.pathname) &&
    !cloudAccountPath.test(request.nextUrl.pathname) &&
    !cloudAiPath.test(request.nextUrl.pathname) &&
    !cloudGenerationPaths.has(request.nextUrl.pathname) &&
    request.nextUrl.pathname !== cloudAssetCleanupPath
  ) {
    return Response.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (process.env.MIRAI_AUTH_ENABLED === "true" && !cloudHealthPaths.has(request.nextUrl.pathname)) {
    return refreshSupabaseSession(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
