import { readRuntimeEnvironment, RuntimeEnvironmentError } from "./runtime-environment.ts";

try {
  const configuration = readRuntimeEnvironment();
  process.stdout.write(`Mirai ${configuration.mode} configuration is valid for release ${configuration.releaseId}.\n`);
} catch (error) {
  const message = error instanceof RuntimeEnvironmentError
    ? error.message
    : "Mirai runtime configuration could not be validated.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
