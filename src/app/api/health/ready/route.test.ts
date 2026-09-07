import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.unstubAllGlobals();
});

describe("readiness route", () => {
  it("is ready locally without contacting an external dependency", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env = { NODE_ENV: "test", MIRAI_APP_MODE: "local" };

    const response = await GET();

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ status: "ready", mode: "local", releaseId: "local" });
  });

  it("checks Supabase with a bounded browser-safe request in staging", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    process.env = stagingEnvironment();

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe("https://project.supabase.co/auth/v1/health");
    expect(options.headers).toEqual({ apikey: "sb_publishable_test-key-12345" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    await expect(response.json()).resolves.toEqual({ status: "ready", mode: "staging", releaseId: "release-123" });
  });

  it("returns a non-sensitive failure when dependency readiness fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private upstream detail", { status: 503 })));
    process.env = stagingEnvironment();

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "not-ready" });
  });
});

function stagingEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    MIRAI_APP_MODE: "staging",
    MIRAI_PERSISTENCE_MODE: "disabled",
    MIRAI_AI_ENABLED: "false",
    MIRAI_CANONICAL_URL: "https://mirai.example",
    MIRAI_ALLOWED_ORIGINS: "https://mirai.example",
    MIRAI_RELEASE_ID: "release-123",
    IMAGE_EDIT_PROVIDER: "fake",
    ASSET_GENERATION_PROVIDER: "fake",
    CLOUD_SPIKE_ENABLED: "false",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key-12345",
  };
}
