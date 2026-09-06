const requiredVariables = ["CLOUD_SPIKE_URL", "CLOUD_SPIKE_TOKEN"];
for (const name of requiredVariables) {
  if (!process.env[name]) throw new Error(`Missing required environment variable: ${name}`);
}

const endpoint = new URL("/api/internal/cloud-spike", process.env.CLOUD_SPIKE_URL);
if (process.env.CLOUD_SPIKE_EDGE) endpoint.searchParams.set("edge", process.env.CLOUD_SPIKE_EDGE);
const startedAt = performance.now();
const response = await fetch(endpoint, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.CLOUD_SPIKE_TOKEN}` },
  signal: AbortSignal.timeout(120_000),
});
const body = await response.text();
if (!response.ok) throw new Error(`Render probe failed with HTTP ${response.status}: ${body.slice(0, 500)}`);
const report = JSON.parse(body);
process.stdout.write(`${JSON.stringify({
  ...report,
  clientObservedElapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
  endpointOrigin: endpoint.origin,
}, null, 2)}\n`);
