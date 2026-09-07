import { z } from "zod";

const applicationModes = ["local", "ci", "staging", "beta"] as const;
const persistenceModes = ["local", "disabled"] as const;
const cloudModes = new Set<ApplicationMode>(["staging", "beta"]);

export type ApplicationMode = (typeof applicationModes)[number];
export type PersistenceMode = (typeof persistenceModes)[number];

export interface RuntimeEnvironment {
  mode: ApplicationMode;
  persistence: PersistenceMode;
  canonicalUrl: URL | null;
  allowedOrigins: string[];
  aiEnabled: boolean;
  imageEditProvider: string;
  assetGenerationProvider: string;
  releaseId: string;
  limits: {
    maxSourceEdge: number;
    maxSourcePixels: number;
    heavyRequestConcurrency: number;
    requestTimeoutMs: number;
    readinessTimeoutMs: number;
  };
  supabase: {
    url: URL;
    publishableKey: string;
  } | null;
}

export class RuntimeEnvironmentError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Unsafe Mirai runtime configuration:\n- ${issues.join("\n- ")}`);
    this.name = "RuntimeEnvironmentError";
    this.issues = issues;
  }
}

export function readRuntimeEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RuntimeEnvironment {
  const issues: string[] = [];
  const mode = parseChoice("MIRAI_APP_MODE", environment.MIRAI_APP_MODE ?? "local", applicationModes, issues);
  const persistence = parseChoice(
    "MIRAI_PERSISTENCE_MODE",
    environment.MIRAI_PERSISTENCE_MODE ?? (cloudModes.has(mode) ? "disabled" : "local"),
    persistenceModes,
    issues,
  );
  const canonicalUrl = parseOptionalUrl("MIRAI_CANONICAL_URL", environment.MIRAI_CANONICAL_URL, issues);
  const allowedOrigins = parseOrigins(environment.MIRAI_ALLOWED_ORIGINS, issues);
  const aiEnabled = parseBoolean("MIRAI_AI_ENABLED", environment.MIRAI_AI_ENABLED ?? "false", issues);
  const imageEditProvider = environment.IMAGE_EDIT_PROVIDER ?? "fake";
  const assetGenerationProvider = environment.ASSET_GENERATION_PROVIDER ?? "fake";
  const releaseId = environment.MIRAI_RELEASE_ID ?? environment.RENDER_GIT_COMMIT ?? environment.GITHUB_SHA ?? "local";
  const limits = {
    maxSourceEdge: parseInteger("MIRAI_MAX_SOURCE_EDGE", environment.MIRAI_MAX_SOURCE_EDGE ?? "2048", 1, 2_048, issues),
    maxSourcePixels: parseInteger("MIRAI_MAX_SOURCE_PIXELS", environment.MIRAI_MAX_SOURCE_PIXELS ?? "4194304", 1, 4_194_304, issues),
    heavyRequestConcurrency: parseInteger("MIRAI_HEAVY_REQUEST_CONCURRENCY", environment.MIRAI_HEAVY_REQUEST_CONCURRENCY ?? "1", 1, 1, issues),
    requestTimeoutMs: parseInteger("MIRAI_REQUEST_TIMEOUT_MS", environment.MIRAI_REQUEST_TIMEOUT_MS ?? "60000", 1_000, 60_000, issues),
    readinessTimeoutMs: parseInteger("MIRAI_READINESS_TIMEOUT_MS", environment.MIRAI_READINESS_TIMEOUT_MS ?? "3000", 250, 4_000, issues),
  };
  const supabaseUrl = parseOptionalUrl("NEXT_PUBLIC_SUPABASE_URL", environment.NEXT_PUBLIC_SUPABASE_URL, issues);
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

  if (environment.NEXT_PUBLIC_SUPABASE_SECRET_KEY || environment.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    issues.push("Supabase privileged keys must never use a NEXT_PUBLIC_ variable name");
  }

  if (cloudModes.has(mode)) {
    if (persistence !== "disabled") {
      issues.push("MIRAI_PERSISTENCE_MODE must be disabled until cloud project persistence is implemented");
    }
    if (!canonicalUrl || canonicalUrl.protocol !== "https:") {
      issues.push("MIRAI_CANONICAL_URL must be an absolute HTTPS URL in cloud modes");
    }
    if (allowedOrigins.length === 0) {
      issues.push("MIRAI_ALLOWED_ORIGINS must contain at least the canonical origin in cloud modes");
    } else if (canonicalUrl && !allowedOrigins.includes(canonicalUrl.origin)) {
      issues.push("MIRAI_ALLOWED_ORIGINS must include the MIRAI_CANONICAL_URL origin");
    }
    if (aiEnabled) issues.push("MIRAI_AI_ENABLED must remain false during Wave A");
    if (imageEditProvider !== "fake" || assetGenerationProvider !== "fake") {
      issues.push("IMAGE_EDIT_PROVIDER and ASSET_GENERATION_PROVIDER must both be fake during Wave A");
    }
    if (environment.OPENAI_API_KEY) {
      issues.push("OPENAI_API_KEY must not be installed in a Wave A cloud environment");
    }
    if (environment.CLOUD_SPIKE_ENABLED === "true") {
      issues.push("CLOUD_SPIKE_ENABLED must be false after P01");
    }
    if (!supabaseUrl || supabaseUrl.protocol !== "https:") {
      issues.push("NEXT_PUBLIC_SUPABASE_URL must be an absolute HTTPS URL in cloud modes");
    }
    if (publishableKey.length < 20) {
      issues.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required in cloud modes");
    }
    if (releaseId === "local") {
      issues.push("MIRAI_RELEASE_ID or the hosting provider release identifier is required in cloud modes");
    }
  }

  if (issues.length > 0) throw new RuntimeEnvironmentError(issues);

  return {
    mode,
    persistence,
    canonicalUrl,
    allowedOrigins,
    aiEnabled,
    imageEditProvider,
    assetGenerationProvider,
    releaseId,
    limits,
    supabase: supabaseUrl && publishableKey ? { url: supabaseUrl, publishableKey } : null,
  };
}

export function isCloudMode(mode: ApplicationMode): boolean {
  return cloudModes.has(mode);
}

function parseChoice<const Choice extends readonly string[]>(
  name: string,
  value: string,
  choices: Choice,
  issues: string[],
): Choice[number] {
  const parsed = z.enum(choices).safeParse(value);
  if (parsed.success) return parsed.data;
  issues.push(`${name} must be one of: ${choices.join(", ")}`);
  return choices[0];
}

function parseBoolean(name: string, value: string, issues: string[]): boolean {
  if (value === "true") return true;
  if (value === "false") return false;
  issues.push(`${name} must be true or false`);
  return false;
}

function parseInteger(
  name: string,
  value: string,
  minimum: number,
  maximum: number,
  issues: string[],
): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum) return parsed;
  issues.push(`${name} must be an integer from ${minimum} through ${maximum}`);
  return minimum;
}

function parseOptionalUrl(name: string, value: string | undefined, issues: string[]): URL | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("invalid protocol");
    return parsed;
  } catch {
    issues.push(`${name} must be an absolute HTTP or HTTPS URL`);
    return null;
  }
}

function parseOrigins(value: string | undefined, issues: string[]): string[] {
  if (!value) return [];
  const origins = new Set<string>();
  for (const candidate of value.split(",").map((part) => part.trim()).filter(Boolean)) {
    if (candidate === "*") {
      issues.push("MIRAI_ALLOWED_ORIGINS cannot contain a wildcard");
      continue;
    }
    try {
      const url = new URL(candidate);
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== candidate) {
        throw new Error("not an origin");
      }
      origins.add(url.origin);
    } catch {
      issues.push("MIRAI_ALLOWED_ORIGINS must contain comma-separated URL origins");
    }
  }
  return [...origins];
}
