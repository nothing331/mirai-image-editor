import { isCloudMode, readRuntimeEnvironment } from "@/server/config/runtime-environment";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const configuration = readRuntimeEnvironment();
    if (isCloudMode(configuration.mode)) await verifySupabase(configuration);
    return Response.json(
      { status: "ready", mode: configuration.mode, releaseId: configuration.releaseId },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "not-ready" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

async function verifySupabase(configuration: ReturnType<typeof readRuntimeEnvironment>): Promise<void> {
  if (!configuration.supabase) throw new Error("Supabase is not configured.");
  const endpoint = new URL("/auth/v1/health", configuration.supabase.url);
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: { apikey: configuration.supabase.publishableKey },
    signal: AbortSignal.timeout(configuration.limits.readinessTimeoutMs),
  });
  if (!response.ok) throw new Error("Supabase readiness check failed.");
}
