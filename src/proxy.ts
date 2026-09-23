import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { refreshSupabaseSession } from "@/server/supabase/session-proxy";

const cloudSpikePath = "/api/internal/cloud-spike";
const cloudHealthPaths = new Set(["/api/health/live", "/api/health/ready"]);

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
    !cloudHealthPaths.has(request.nextUrl.pathname)
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
