import { authorizeCloudSpike } from "@/server/cloud-spike/authorization";
import { cloudSpikeBenchmarkEdges, runCloudSpikeRuntimeBenchmark } from "@/server/cloud-spike/runtime-benchmark";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authorization = authorizeCloudSpike(request);
  if (!authorization.authorized) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }

  try {
    const edge = Number(new URL(request.url).searchParams.get("edge") ?? 2_048);
    if (!cloudSpikeBenchmarkEdges.includes(edge as (typeof cloudSpikeBenchmarkEdges)[number])) {
      return Response.json({ error: "Unsupported synthetic fixture size." }, { status: 400 });
    }
    const report = await runCloudSpikeRuntimeBenchmark(edge);
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[cloud-spike] Synthetic runtime benchmark failed.", error);
    return Response.json(
      { error: "Synthetic runtime benchmark failed." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
