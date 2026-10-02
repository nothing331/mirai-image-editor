import { execFileSync, spawnSync } from "node:child_process";
const status = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.116.0", "status", "-o", "json"], { encoding: "utf8" }));
const env = { ...process.env, E2E_CLOUD_AI: "1", E2E_CLOUD: "1", E2E_PORT: "3100", MIRAI_APP_MODE: "local", MIRAI_AUTH_ENABLED: "true", MIRAI_AI_ENABLED: "true", MIRAI_OWNER_EMAILS: "owner@example.test", MIRAI_ALLOWED_ORIGINS: "http://127.0.0.1:3100,http://localhost:3100", IMAGE_EDIT_PROVIDER: "fake", ASSET_GENERATION_PROVIDER: "fake", NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: status.SECRET_KEY };
const build = spawnSync("npm", ["run", "build"], { env, stdio: "inherit" });
if (build.status) process.exit(build.status);
const result = spawnSync("npx", ["playwright", "test", "e2e/cloud-ai.spec.ts", "e2e/cloud-editor.spec.ts", "--workers=1"], { env, stdio: "inherit" });
process.exit(result.status ?? 1);
