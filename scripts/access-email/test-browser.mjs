import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const statusArgs = ["--yes", "supabase@2.116.0", "status", "-o", "json"];
if (process.env.MIRAI_TEST_SUPABASE_DIR) statusArgs.push("--workdir", process.env.MIRAI_TEST_SUPABASE_DIR);
const status = JSON.parse(execFileSync("npx", statusArgs, { encoding: "utf8" }));
if (!["localhost", "127.0.0.1"].includes(new URL(status.API_URL).hostname)) throw new Error("Email browser tests require disposable local Supabase.");
const directory = mkdtempSync(join(tmpdir(), "mirai-email-browser-"));
const log = join(directory, "emails.jsonl");
const response = join(directory, "response.txt");
writeFileSync(log, ""); writeFileSync(response, "200");
const env = { ...process.env, E2E_ACCESS_EMAIL: "1", E2E_PORT: "3120", MIRAI_APP_MODE: "local", MIRAI_PERSISTENCE_MODE: "disabled",
  MIRAI_AUTH_ENABLED: "true", MIRAI_EMAIL_ENABLED: "true", MIRAI_EMAIL_FROM: "hello@example.test", RESEND_API_KEY: "local-email-test-key",
  MIRAI_AI_ENABLED: "false", MIRAI_INVITATION_MODE: "false", MIRAI_OWNER_EMAILS: "owner@example.test",
  MIRAI_CANONICAL_URL: "http://127.0.0.1:3120", MIRAI_ALLOWED_ORIGINS: "http://127.0.0.1:3120",
  IMAGE_EDIT_PROVIDER: "fake", ASSET_GENERATION_PROVIDER: "fake", NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY, SUPABASE_SECRET_KEY: status.SECRET_KEY,
  ACCESS_EMAIL_TEST_LOG: log, ACCESS_EMAIL_TEST_RESPONSE: response,
  NODE_OPTIONS: `--import=${resolve("scripts/access-email/fake-resend.mjs")}` };
delete env.OPENAI_API_KEY;
try {
  const build = spawnSync("npm", ["run", "build"], { env, stdio: "inherit" });
  if (build.status) process.exitCode = build.status;
  else process.exitCode = spawnSync("npx", ["playwright", "test", "e2e/access-email.spec.ts", "--workers=1"], { env, stdio: "inherit" }).status ?? 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
