import { execFileSync, spawnSync } from "node:child_process";

const status = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.116.0", "status", "-o", "json"], { encoding: "utf8" }));
const env = {
  ...process.env,
  E2E_INVITATION_MODE: "1",
  E2E_PORT: "3101",
  MIRAI_APP_MODE: "local",
  MIRAI_INVITATION_MODE: "true",
  MIRAI_AUTH_ENABLED: "true",
  MIRAI_AI_ENABLED: "false",
  MIRAI_OWNER_EMAILS: "owner@example.test",
  MIRAI_CANONICAL_URL: "http://127.0.0.1:3101",
  MIRAI_ALLOWED_ORIGINS: "http://127.0.0.1:3101,http://localhost:3101",
  IMAGE_EDIT_PROVIDER: "fake",
  ASSET_GENERATION_PROVIDER: "fake",
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
};
delete env.OPENAI_API_KEY;
const build = spawnSync("npm", ["run", "build"], { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
const result = spawnSync("npx", ["playwright", "test", "e2e/invitation-mode.spec.ts", "e2e/landing.spec.ts", "--workers=1"], { env, stdio: "inherit" });
process.exit(result.status ?? 1);
