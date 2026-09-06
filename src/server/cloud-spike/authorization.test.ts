import { afterEach, describe, expect, it } from "vitest";
import { authorizeCloudSpike } from "./authorization";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("authorizeCloudSpike", () => {
  it("looks absent when the spike is disabled", () => {
    delete process.env.CLOUD_SPIKE_ENABLED;
    expect(authorizeCloudSpike(request())).toEqual({ authorized: false, status: 404, error: "Not found." });
  });

  it("refuses to run when either paid-provider boundary is not fake", () => {
    configure();
    process.env.IMAGE_EDIT_PROVIDER = "openai";
    expect(authorizeCloudSpike(request(token))).toEqual({
      authorized: false,
      status: 409,
      error: "Cloud spike requires fake providers.",
    });
  });

  it("fails closed when the configured token is too short", () => {
    configure();
    process.env.CLOUD_SPIKE_TOKEN = "short";
    expect(authorizeCloudSpike(request("short"))).toEqual({
      authorized: false,
      status: 500,
      error: "Cloud spike is not configured safely.",
    });
  });

  it("does not reveal whether an incorrect token was close", () => {
    configure();
    expect(authorizeCloudSpike(request(`${token.slice(0, -1)}x`))).toEqual({
      authorized: false,
      status: 404,
      error: "Not found.",
    });
  });

  it("authorizes the exact token with fake providers", () => {
    configure();
    expect(authorizeCloudSpike(request(token))).toEqual({ authorized: true });
  });
});

const token = "wave-a-synthetic-probe-token-00000001";

function configure() {
  process.env.CLOUD_SPIKE_ENABLED = "true";
  process.env.CLOUD_SPIKE_TOKEN = token;
  process.env.IMAGE_EDIT_PROVIDER = "fake";
  process.env.ASSET_GENERATION_PROVIDER = "fake";
}

function request(bearer?: string) {
  return new Request("http://localhost/api/internal/cloud-spike", {
    method: "POST",
    headers: bearer ? { authorization: `Bearer ${bearer}` } : undefined,
  });
}
