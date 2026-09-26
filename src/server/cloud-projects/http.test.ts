import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizedProjectOwner, createProjectSchema } from "./http";

vi.mock("@/server/auth/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/account")>();
  return { ...actual, requireAccount: vi.fn(async () => ({ profile: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } })) };
});

const originalEnvironment = { ...process.env };
beforeEach(() => {
  process.env = {
    ...originalEnvironment,
    MIRAI_APP_MODE: "local", MIRAI_AUTH_ENABLED: "true",
    MIRAI_OWNER_EMAILS: "owner@example.com", MIRAI_ALLOWED_ORIGINS: "http://localhost:3000",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key-placeholder-value",
    SUPABASE_SECRET_KEY: "server-secret-placeholder-value",
  };
});
afterEach(() => { process.env = { ...originalEnvironment }; });

describe("P05 project HTTP boundary", () => {
  it("requires an active account and configured origin for mutations", async () => {
    const own = new Request("http://localhost:3000/api/cloud-projects", {
      method: "POST", headers: { origin: "http://localhost:3000" },
    });
    await expect(authorizedProjectOwner(own, true)).resolves.toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const foreign = new Request("http://localhost:3000/api/cloud-projects", {
      method: "POST", headers: { origin: "http://another-host:3000" },
    });
    await expect(authorizedProjectOwner(foreign, true)).rejects.toMatchObject({ code: "invalid" });
  });

  it("keeps cloud project APIs closed in CI and auth-disabled local mode", async () => {
    const request = new Request("http://localhost:3000/api/cloud-projects");
    process.env.MIRAI_APP_MODE = "ci";
    await expect(authorizedProjectOwner(request, false)).rejects.toMatchObject({ code: "not-found" });
    process.env.MIRAI_APP_MODE = "local";
    process.env.MIRAI_AUTH_ENABLED = "false";
    await expect(authorizedProjectOwner(request, false)).rejects.toMatchObject({ code: "not-found" });
  });

  it("accepts only an upload receipt and bounded name", () => {
    expect(createProjectSchema.safeParse({ uploadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "  Study  " }).success).toBe(true);
    expect(createProjectSchema.safeParse({ uploadId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Study", ownerId: "foreign" }).success).toBe(false);
    expect(createProjectSchema.safeParse({ uploadId: "wrong", name: "Study" }).success).toBe(false);
  });
});
