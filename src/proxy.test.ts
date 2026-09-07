import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

afterEach(() => {
  delete process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT;
});

describe("cloud spike API isolation", () => {
  it("does not change local API routing by default", () => {
    const response = proxy(new NextRequest("http://localhost/api/projects"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps the protected benchmark route reachable in an isolated deployment", () => {
    process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT = "true";

    const response = proxy(new NextRequest("https://example.com/api/internal/cloud-spike?edge=1024"));

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each([
    "/api/projects",
    "/api/projects/project-id",
    "/api/request-logs",
    "/api/image-edits",
    "/api/asset-generations",
    "/api/image-extends/plan",
  ])("hides %s in an isolated deployment", async (pathname) => {
    process.env.CLOUD_SPIKE_ISOLATED_DEPLOYMENT = "true";

    const response = proxy(new NextRequest(`https://example.com${pathname}`));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Not found." });
  });
});
