import { afterEach, describe, expect, it } from "vitest";
import { readRuntimeEnvironment, RuntimeEnvironmentError } from "./runtime-environment";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("runtime environment", () => {
  it("accepts invitation mode with authentication and AI disabled", () => {
    expect(readRuntimeEnvironment(invitationEnvironment()).invitationMode).toBe(true);
  });

  it.each([
    ["authentication disabled", { MIRAI_AUTH_ENABLED: "false" }, "requires MIRAI_AUTH_ENABLED=true"],
    ["AI enabled", { MIRAI_AI_ENABLED: "true" }, "requires MIRAI_AI_ENABLED=false"],
    ["real provider", { IMAGE_EDIT_PROVIDER: "openai" }, "requires fake providers"],
    ["provider credential", { OPENAI_API_KEY: "test-placeholder" }, "no OPENAI_API_KEY"],
    ["malformed flag", { MIRAI_INVITATION_MODE: "yes" }, "MIRAI_INVITATION_MODE"],
  ])("rejects invitation mode with %s", (_label, changes, message) => {
    expect(() => readRuntimeEnvironment({ ...invitationEnvironment(), ...changes })).toThrow(message);
  });

  it("preserves a safe local default with fake providers", () => {
    const configuration = readRuntimeEnvironment({});

    expect(configuration).toMatchObject({
      mode: "local",
      persistence: "local",
      aiEnabled: false,
      invitationMode: false,
      auth: { enabled: false, ownerEmails: [] },
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

  it("accepts authentication only with server-side owner and admin configuration", () => {
    const configuration = readRuntimeEnvironment({
      ...stagingEnvironment(),
      MIRAI_AUTH_ENABLED: "true",
      MIRAI_OWNER_EMAILS: "Owner@Example.com, second@example.com",
      SUPABASE_SECRET_KEY: "server-only-secret-key-placeholder",
    });

    expect(configuration.auth).toEqual({
      enabled: true,
      ownerEmails: ["owner@example.com", "second@example.com"],
    });
  });

  it.each([
    ["owner allowlist", { MIRAI_OWNER_EMAILS: "" }, "MIRAI_OWNER_EMAILS"],
    ["server credential", { SUPABASE_SECRET_KEY: "" }, "SUPABASE_SECRET_KEY"],
  ])("rejects enabled cloud authentication without its %s", (_label, changes, expectedIssue) => {
    expect(() => readRuntimeEnvironment({
      ...stagingEnvironment(),
      MIRAI_AUTH_ENABLED: "true",
      MIRAI_OWNER_EMAILS: "owner@example.com",
      SUPABASE_SECRET_KEY: "server-only-secret-key-placeholder",
      ...changes,
    })).toThrow(expectedIssue);
  });

  it("rejects a malformed owner allowlist without echoing its value", () => {
    expect(() => readRuntimeEnvironment({
      ...stagingEnvironment(),
      MIRAI_AUTH_ENABLED: "true",
      MIRAI_OWNER_EMAILS: "not-an-email",
      SUPABASE_SECRET_KEY: "server-only-secret-key-placeholder",
    })).toThrow("MIRAI_OWNER_EMAILS");
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

  it("allows cloud fake AI only behind authenticated admission", () => {
    expect(readRuntimeEnvironment({ ...stagingEnvironment(), MIRAI_AI_ENABLED: "true", MIRAI_AUTH_ENABLED: "true", MIRAI_OWNER_EMAILS: "owner@example.com", SUPABASE_SECRET_KEY: "server-only-placeholder-secret" }).aiEnabled).toBe(true);
  });
  it("requires hosted qualification and stage ceilings before real cloud AI", () => {
    const real = { ...stagingEnvironment(), MIRAI_AI_ENABLED: "true", MIRAI_AUTH_ENABLED: "true", MIRAI_OWNER_EMAILS: "owner@example.com", SUPABASE_SECRET_KEY: "server-only-placeholder-secret", IMAGE_EDIT_PROVIDER: "openai", OPENAI_API_KEY: "test-only-placeholder" };
    expect(() => readRuntimeEnvironment(real)).toThrow("MIRAI_AI_HOST_QUALIFIED");
    expect(() => readRuntimeEnvironment({ ...real, MIRAI_AI_HOST_QUALIFIED: "true" })).toThrow("MIRAI_AI_IMAGE_STAGE_MICROUSD");
    expect(() => readRuntimeEnvironment({ ...real, MIRAI_AI_HOST_QUALIFIED: "true", MIRAI_AI_IMAGE_STAGE_MICROUSD: "1000000", MIRAI_AI_TEXT_STAGE_MICROUSD: "100000", OPENAI_IMAGE_QUALITY: "high" })).toThrow("OPENAI_IMAGE_QUALITY");
    expect(readRuntimeEnvironment({ ...real, MIRAI_AI_HOST_QUALIFIED: "true", MIRAI_AI_IMAGE_STAGE_MICROUSD: "1000000", MIRAI_AI_TEXT_STAGE_MICROUSD: "100000" }).aiEnabled).toBe(true);
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

  it.each(["localhost", "127.0.0.1", "[::1]"])("allows authenticated real AI on loopback %s without hosted qualification", (host) => {
    const configuration = readRuntimeEnvironment(localRealAiEnvironment(`http://${host}:3000`));
    expect(configuration).toMatchObject({ mode: "local", aiEnabled: true, auth: { enabled: true }, imageEditProvider: "openai" });
  });

  it.each([
    ["missing canonical URL", { MIRAI_CANONICAL_URL: "" }],
    ["remote canonical URL", { MIRAI_CANONICAL_URL: "https://mirai.example" }],
    ["missing allowed origins", { MIRAI_ALLOWED_ORIGINS: "" }],
    ["remote allowed origin", { MIRAI_ALLOWED_ORIGINS: "http://localhost:3000,https://mirai.example" }],
    ["mismatched loopback origin", { MIRAI_ALLOWED_ORIGINS: "http://127.0.0.1:3000" }],
    ["CI mode", { MIRAI_APP_MODE: "ci" }],
    ["Render process", { RENDER: "true" }],
    ["Render service", { RENDER_SERVICE_ID: "srv-test" }],
  ])("keeps hosted qualification required for %s", (_label, changes) => {
    expect(() => readRuntimeEnvironment({ ...localRealAiEnvironment(), ...changes })).toThrow("MIRAI_AI_HOST_QUALIFIED");
  });

  it.each(["MIRAI_AI_IMAGE_STAGE_MICROUSD", "MIRAI_AI_TEXT_STAGE_MICROUSD"])("still requires %s during local authenticated AI development", (name) => {
    expect(() => readRuntimeEnvironment({ ...localRealAiEnvironment(), [name]: "0" })).toThrow(name);
  });
});

function localRealAiEnvironment(origin = "http://localhost:3000"): Record<string, string> {
  return {
    MIRAI_APP_MODE: "local",
    MIRAI_AUTH_ENABLED: "true",
    MIRAI_AI_ENABLED: "true",
    MIRAI_CANONICAL_URL: origin,
    MIRAI_ALLOWED_ORIGINS: origin,
    MIRAI_OWNER_EMAILS: "owner@example.com",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key-12345",
    SUPABASE_SECRET_KEY: "server-only-placeholder-secret",
    IMAGE_EDIT_PROVIDER: "openai",
    ASSET_GENERATION_PROVIDER: "openai",
    OPENAI_API_KEY: "test-only-placeholder",
    MIRAI_AI_HOST_QUALIFIED: "false",
    MIRAI_AI_IMAGE_STAGE_MICROUSD: "1000000",
    MIRAI_AI_TEXT_STAGE_MICROUSD: "100000",
  };
}

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

function invitationEnvironment(): Record<string, string> {
  return {
    ...stagingEnvironment(),
    MIRAI_INVITATION_MODE: "true",
    MIRAI_AUTH_ENABLED: "true",
    MIRAI_OWNER_EMAILS: "owner@example.com",
    SUPABASE_SECRET_KEY: "server-only-secret-key-placeholder",
  };
}
