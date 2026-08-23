import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
const serverCommand = process.env.E2E_PORT ? `npm run start -- --port ${port}` : `npm run dev -- --port ${port}`;

export default defineConfig({
  testDir: "./e2e",
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  webServer: { command: serverCommand, port, reuseExistingServer: false, env: { ...process.env, IMAGE_EDIT_PROVIDER: "fake", ASSET_GENERATION_PROVIDER: "fake" } },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["clipboard-read", "clipboard-write"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
