import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/server/supabase/session-proxy";
import { invitationModeEnabled } from "@/server/config/invitation-mode";

const cloudSpikePath = "/api/internal/cloud-spike";
const cloudHealthPaths = new Set(["/api/health/live", "/api/health/ready"]);
const cloudAssetPath = /^\/api\/original-uploads(?:\/|$)/;
const cloudProjectsPath = /^\/api\/cloud-projects(?:\/|$)/;
const cloudAiPath = /^\/api\/ai(?:\/|$)/;
const cloudGenerationPaths = new Set(["/api/image-edits", "/api/image-extends/plan", "/api/image-extends/generate", "/api/asset-generations"]);
const cloudAccountPath = /^\/api\/account(?:\/|$)/;
const cloudAssetCleanupPath = "/api/internal/assets-cleanup";
const invitationPages = new Set(["/", "/sign-in", "/access", "/auth/callback", "/admin/access"]);

export async function proxy(request: NextRequest) {
  const isApiPath = request.nextUrl.pathname.startsWith("/api/");
  if (invitationModeEnabled() && !cloudHealthPaths.has(request.nextUrl.pathname)) {
    if (isApiPath || (!invitationPages.has(request.nextUrl.pathname) && !["GET", "HEAD"].includes(request.method))) {
      return Response.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    if (!invitationPages.has(request.nextUrl.pathname)) {
      const response = NextResponse.redirect(new URL("/access", process.env.MIRAI_CANONICAL_URL ?? request.url));
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
  }
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
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
