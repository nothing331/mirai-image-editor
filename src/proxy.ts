import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const cloudSpikePath = "/api/internal/cloud-spike";

export function proxy(request: NextRequest) {
  if (
    process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT === "true" &&
    request.nextUrl.pathname !== cloudSpikePath
  ) {
    return Response.json(
      { error: "Not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
