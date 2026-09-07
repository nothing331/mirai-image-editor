import { readRuntimeEnvironment } from "./runtime-environment.ts";

const configuration = readRuntimeEnvironment();
process.stdout.write(`Mirai ${configuration.mode} configuration is valid for release ${configuration.releaseId}.\n`);
