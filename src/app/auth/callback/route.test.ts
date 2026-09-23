import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("authentication callback", () => {
  it("redirects through the public canonical origin behind a hosting proxy", async () => {
    process.env = stagingEnvironment();
    const request = new NextRequest("https://localhost:10000/auth/callback");

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://mirai-image-editor.onrender.com/sign-in?error=callback",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

function stagingEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    MIRAI_APP_MODE: "staging",
    MIRAI_PERSISTENCE_MODE: "disabled",
    MIRAI_AI_ENABLED: "false",
    MIRAI_AUTH_ENABLED: "true",
    MIRAI_OWNER_EMAILS: "owner@example.com",
    MIRAI_CANONICAL_URL: "https://mirai-image-editor.onrender.com",
    MIRAI_ALLOWED_ORIGINS: "https://mirai-image-editor.onrender.com",
    MIRAI_RELEASE_ID: "release-123",
    IMAGE_EDIT_PROVIDER: "fake",
    ASSET_GENERATION_PROVIDER: "fake",
    CLOUD_SPIKE_ENABLED: "false",
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key-12345",
    SUPABASE_SECRET_KEY: "sb_secret_test-key-12345",
  };
}
