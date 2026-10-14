import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT;
  delete process.env.MIRAI_APP_MODE;
  delete process.env.MIRAI_AUTH_ENABLED;
  delete process.env.MIRAI_INVITATION_MODE;
});

describe("invitation launch boundary", () => {
  it("redirects through the public origin behind the hosting proxy", async () => {
    process.env.MIRAI_INVITATION_MODE = "true";
    vi.stubEnv("MIRAI_CANONICAL_URL", "https://mirai.example");
    const response = await proxy(new NextRequest("http://localhost:10000/projects"));
    expect(response.headers.get("location")).toBe("https://mirai.example/access");
  });

  it.each(["/", "/sign-in", "/access?invite=abc", "/auth/callback?code=abc", "/admin/access", "/api/health/live", "/api/health/ready"])("preserves %s", async (path) => {
    process.env.MIRAI_INVITATION_MODE = "true";
    expect((await proxy(new NextRequest(`https://example.com${path}`))).headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/projects", "/projects/new", "/projects/project-id", "/settings", "/welcome", "/account-deletion", "/unknown"])("redirects %s to access status", async (path) => {
    process.env.MIRAI_INVITATION_MODE = "true";
    const response = await proxy(new NextRequest(`https://example.com${path}?next=/projects`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/access");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["/api/cloud-projects", "/api/original-uploads", "/api/ai/usage", "/api/image-edits", "/api/asset-generations", "/api/image-extends/plan", "/api/image-extends/generate", "/api/account/export", "/api/internal/assets-cleanup", "/api/request-logs/image.png", "/projects"])("rejects direct mutations at %s", async (path) => {
    process.env.MIRAI_INVITATION_MODE = "true";
    const response = await proxy(new NextRequest(`https://example.com${path}`, { method: "POST" }));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("preserves invitation Server Action requests and normal routing when disabled", async () => {
    process.env.MIRAI_INVITATION_MODE = "true";
    expect((await proxy(new NextRequest("https://example.com/access", { method: "POST" }))).headers.get("x-middleware-next")).toBe("1");
    process.env.MIRAI_INVITATION_MODE = "false";
    expect((await proxy(new NextRequest("https://example.com/projects"))).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("cloud foundation API isolation", () => {
  it.each(["/api/health/live", "/api/health/ready"])("allows %s in staging", async (pathname) => {
    process.env.MIRAI_APP_MODE = "staging";

    const response = await proxy(new NextRequest(`https://example.com${pathname}`));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/api/original-uploads",
    "/api/original-uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    "/api/original-uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/finalize",
    "/api/internal/assets-cleanup",
  ])("passes P04's %s route to its account checks in staging", async (pathname) => {
    process.env.MIRAI_APP_MODE = "staging";
    const response = await proxy(new NextRequest(`https://example.com${pathname}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/api/cloud-projects", "/api/cloud-projects/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])(
    "passes P05's %s route to its account checks in staging", async (pathname) => {
      process.env.MIRAI_APP_MODE = "staging";
      const response = await proxy(new NextRequest(`https://example.com${pathname}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it.each(["/api/account/profile", "/api/account/export", "/api/account/deletion"])(
    "passes Wave C's %s route to its account checks in staging", async (pathname) => {
      process.env.MIRAI_APP_MODE = "staging";
      const response = await proxy(new NextRequest(`https://example.com${pathname}`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    },
  );

  it.each(["staging", "beta"])("hides unfinished APIs in %s", async (mode) => {
    process.env.MIRAI_APP_MODE = mode;

    const response = await proxy(new NextRequest("https://example.com/api/projects"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });

  it("does not allow the retired spike flag to expose its route in staging", async () => {
    process.env.MIRAI_APP_MODE = "staging";

    const response = await proxy(new NextRequest("https://example.com/api/internal/cloud-spike"));

    expect(response.status).toBe(404);
  });
});

describe("Wave D routing", () => {
  it.each(["/api/ai/usage", "/api/ai/sessions", "/api/ai/attempts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "/api/image-edits", "/api/asset-generations", "/api/image-extends/plan", "/api/image-extends/generate"])("delegates %s to its cloud account and admission checks", async (path) => {
    process.env.MIRAI_APP_MODE = "beta";
    const response = await proxy(new NextRequest(`https://example.com${path}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
  it("keeps disk-backed diagnostics closed", async () => {
    process.env.MIRAI_APP_MODE = "beta";
    expect((await proxy(new NextRequest("https://example.com/api/request-logs"))).status).toBe(404);
  });
});

describe("cloud spike API isolation", () => {
  it("does not change local API routing by default", async () => {
    const response = await proxy(new NextRequest("http://localhost/api/projects"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps the protected benchmark route reachable in an isolated deployment", async () => {
    process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT = "true";

    const response = await proxy(new NextRequest("https://example.com/api/internal/cloud-spike?edge=1024"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/api/projects",
    "/api/projects/project-id",
    "/api/request-logs",
    "/api/image-edits",
    "/api/asset-generations",
    "/api/image-extends/plan",
    "/api/original-uploads",
    "/api/cloud-projects",
    "/api/account/deletion",
    "/api/internal/assets-cleanup",
  ])("hides %s in an isolated deployment", async (pathname) => {
    process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT = "true";

    const response = await proxy(new NextRequest(`https://example.com${pathname}`));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });
});
