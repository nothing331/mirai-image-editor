import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("liveness route", () => {
  it("reports only process status and release identity without caching", async () => {
    process.env.RENDER_GIT_COMMIT = "release-123";

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "live", releaseId: "release-123" });
  });
});
