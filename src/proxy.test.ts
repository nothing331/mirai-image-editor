import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => {
  delete process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT;
  delete process.env.MIRAI_APP_MODE;
  delete process.env.MIRAI_AUTH_ENABLED;
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
    "/api/internal/assets-cleanup",
  ])("hides %s in an isolated deployment", async (pathname) => {
    process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT = "true";

    const response = await proxy(new NextRequest(`https://example.com${pathname}`));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });
});
