import { afterEach, describe, expect, it, vi } from "vitest";

const { benchmark } = vi.hoisted(() => ({ benchmark: vi.fn() }));
vi.mock("@/server/cloud-spike/runtime-benchmark", () => ({
  cloudSpikeBenchmarkEdges: [1024, 1536, 2048],
  runCloudSpikeRuntimeBenchmark: benchmark,
}));

import { POST } from "./route";

const originalEnvironment = { ...process.env };
const token = "wave-a-synthetic-probe-token-00000001";

afterEach(() => {
  process.env = { ...originalEnvironment };
  benchmark.mockReset();
});

describe("cloud spike route", () => {
  it("is indistinguishable from an absent route when disabled", async () => {
    delete process.env.CLOUD_SPIKE_ENABLED;
    const response = await POST(request(token));
    expect(response.status).toBe(404);
    expect(benchmark).not.toHaveBeenCalled();
  });

  it("rejects an unsupported fixture before doing heavy work", async () => {
    configure();
    const response = await POST(request(token, 4096));
    expect(response.status).toBe(400);
    expect(benchmark).not.toHaveBeenCalled();
  });

  it("runs an approved synthetic fixture without caching the report", async () => {
    configure();
    benchmark.mockResolvedValue({ schemaVersion: 1, synthetic: true });
    const response = await POST(request(token, 1536));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(benchmark).toHaveBeenCalledWith(1536);
    await expect(response.json()).resolves.toEqual({ schemaVersion: 1, synthetic: true });
  });
});

function configure() {
  process.env.CLOUD_SPIKE_ENABLED = "true";
  process.env.CLOUD_SPIKE_TOKEN = token;
  process.env.IMAGE_EDIT_PROVIDER = "fake";
  process.env.ASSET_GENERATION_PROVIDER = "fake";
}

function request(bearer: string, edge = 2048) {
  return new Request(`http://localhost/api/internal/cloud-spike?edge=${edge}`, {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}` },
  });
}
