import { afterEach, describe, expect, it } from "vitest";
import { readRuntimeEnvironment, RuntimeEnvironmentError } from "./runtime-environment";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("runtime environment", () => {
  it("preserves a safe local default with fake providers", () => {
    const configuration = readRuntimeEnvironment({});

    expect(configuration).toMatchObject({
      mode: "local",
      persistence: "local",
      aiEnabled: false,
      imageEditProvider: "fake",
      assetGenerationProvider: "fake",
      releaseId: "local",
      limits: {
        maxSourceEdge: 2048,
        maxSourcePixels: 4_194_304,
        heavyRequestConcurrency: 1,
      },
    });
  });

  it("accepts the explicit staging contract", () => {
    const configuration = readRuntimeEnvironment(stagingEnvironment());

    expect(configuration.mode).toBe("staging");
    expect(configuration.persistence).toBe("disabled");
    expect(configuration.canonicalUrl?.origin).toBe("https://mirai.example");
    expect(configuration.supabase?.url.origin).toBe("https://project.supabase.co");
  });

  it.each([
    ["local persistence", { MIRAI_PERSISTENCE_MODE: "local" }, "MIRAI_PERSISTENCE_MODE"],
    ["real image provider", { IMAGE_EDIT_PROVIDER: "openai" }, "must both be fake"],
    ["an AI key", { OPENAI_API_KEY: "not-installed-in-wave-a" }, "OPENAI_API_KEY"],
    ["an enabled benchmark", { CLOUD_SPIKE_ENABLED: "true" }, "CLOUD_SPIKE_ENABLED"],
    ["an oversized source edge", { MIRAI_MAX_SOURCE_EDGE: "4096" }, "MIRAI_MAX_SOURCE_EDGE"],
    ["heavy concurrency above one", { MIRAI_HEAVY_REQUEST_CONCURRENCY: "2" }, "MIRAI_HEAVY_REQUEST_CONCURRENCY"],
    ["a wildcard origin", { MIRAI_ALLOWED_ORIGINS: "*" }, "cannot contain a wildcard"],
    ["a public privileged key", { NEXT_PUBLIC_SUPABASE_SECRET_KEY: "secret" }, "privileged keys"],
  ])("rejects %s in staging", (_label, changes, expectedIssue) => {
    expect(() => readRuntimeEnvironment({ ...stagingEnvironment(), ...changes })).toThrow(expectedIssue);
  });

  it("reports missing cloud requirements without exposing values", () => {
    try {
      readRuntimeEnvironment({ MIRAI_APP_MODE: "beta" });
      throw new Error("Expected configuration to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeEnvironmentError);
      expect((error as RuntimeEnvironmentError).issues).toEqual(expect.arrayContaining([
        expect.stringContaining("MIRAI_CANONICAL_URL"),
        expect.stringContaining("MIRAI_ALLOWED_ORIGINS"),
        expect.stringContaining("NEXT_PUBLIC_SUPABASE_URL"),
        expect.stringContaining("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
        expect.stringContaining("release identifier"),
      ]));
    }
  });
});

function stagingEnvironment(): Record<string, string> {
  return {
    MIRAI_APP_MODE: "staging",
    MIRAI_PERSISTENCE_MODE: "disabled",
    MIRAI_AI_ENABLED: "false",
    MIRAI_CANONICAL_URL: "https://mirai.example",
    MIRAI_ALLOWED_ORIGINS: "https://mirai.example",
    RENDER_GIT_COMMIT: "0123456789abcdef",
    IMAGE_EDIT_PROVIDER: "fake",
    ASSET_GENERATION_PROVIDER: "fake",
    CLOUD_SPIKE_ENABLED: "false",
    MIRAI_MAX_SOURCE_EDGE: "2048",
    MIRAI_MAX_SOURCE_PIXELS: "4194304",
    MIRAI_HEAVY_REQUEST_CONCURRENCY: "1",
    MIRAI_REQUEST_TIMEOUT_MS: "60000",
    MIRAI_READINESS_TIMEOUT_MS: "3000",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key-12345",
  };
}
