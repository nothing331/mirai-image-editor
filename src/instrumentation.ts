export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { readRuntimeEnvironment } = await import("@/server/config/runtime-environment");
  readRuntimeEnvironment();
}
