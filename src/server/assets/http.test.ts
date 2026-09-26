import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizedAssetOwner } from "./http";

vi.mock("@/server/auth/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/account")>();
  return {
    ...actual,
    requireAccount: vi.fn(async () => ({ profile: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } })),
  };
});

const originalEnvironment = { ...process.env };

beforeEach(() => {
  process.env = {
    ...originalEnvironment,
    MIRAI_APP_MODE: "local",
    MIRAI_AUTH_ENABLED: "true",
    MIRAI_OWNER_EMAILS: "owner@example.com",
    MIRAI_ALLOWED_ORIGINS: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder-value",
    SUPABASE_SECRET_KEY: "server-secret-placeholder-value",
  };
});

afterEach(() => { process.env = { ...originalEnvironment }; });

describe("P04 HTTP access", () => {
  it("permits an authenticated local upload from the configured origin", async () => {
    const request = new Request("http://localhost:3000/api/original-uploads", {
      method: "POST", headers: { origin: "http://localhost:3000" },
    });
    await expect(authorizedAssetOwner(request, true)).resolves.toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("rejects a foreign origin even in local mode", async () => {
    const request = new Request("http://localhost:3000/api/original-uploads", {
      method: "POST", headers: { origin: "http://another-host:3000" },
    });
    await expect(authorizedAssetOwner(request, true)).rejects.toMatchObject({ code: "invalid" });
  });

  it("keeps CI and unauthenticated local mode closed", async () => {
    const request = new Request("http://localhost:3000/api/original-uploads", {
      method: "POST", headers: { origin: "http://localhost:3000" },
    });
    process.env.MIRAI_APP_MODE = "ci";
    await expect(authorizedAssetOwner(request, true)).rejects.toMatchObject({ code: "not-found" });
    process.env.MIRAI_APP_MODE = "local";
    process.env.MIRAI_AUTH_ENABLED = "false";
    await expect(authorizedAssetOwner(request, true)).rejects.toMatchObject({ code: "not-found" });
  });
});
