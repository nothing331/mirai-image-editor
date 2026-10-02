import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { getCloudProject } from "@/server/cloud-projects/cloud-projects";
import { CloudProjectError } from "@/server/cloud-projects/cloud-projects";
import { aiUsageSchema } from "@/shared/cloud-ai";

export const AI_RESULT_BUCKET = "mirai-ai-results";
export type AiWorkflow = "remove" | "replace" | "restyle" | "transform" | "extend" | "extend-analysis" | "creation";
export interface AiAttempt {
  id: string; owner_id: string; project_id: string | null; input_version_id: string | null;
  creation_session_id: string | null; executor_id: string; workflow: AiWorkflow; digest: string;
  status: "running" | "unknown" | "ready" | "failed" | "accepted" | "discarded" | "expired" | "cleaning";
  result_key: string; expires_at: string; lease_until: string; accepted_project_id: string | null;
}
export interface StoredAiResult {
  response: Record<string, unknown>;
  acceptance?: {
    maskBase64: string; maskWidth: number; maskHeight: number;
    width: number; height: number; parameters: Record<string, unknown>;
  };
}
export type AiStage = "replace-plan" | "transform-plan" | "transform-fidelity" | "extend-analysis" | "image";

export function aiError(message: string): never {
  if (/not found|not eligible|revoked/.test(message)) throw new CloudProjectError("not-found", "This AI request is unavailable.");
  if (/key reused/.test(message)) throw new CloudProjectError("conflict", "This request reference was already used for different inputs.");
  if (/hourly rate limit/.test(message)) throw new CloudProjectError("quota", "Too many AI requests in the last hour. Wait before generating again; local edits remain available.");
  if (/project allowance/.test(message)) throw new CloudProjectError("quota", "The five-project limit has been reached. Trash a project before creating another.");
  if (/allowance|budget/.test(message)) throw new CloudProjectError("quota", /storage/.test(message) ? "Storage allowance reached. Discard unused previews or free storage before trying again." : /planning/.test(message) ? "The beta scene-analysis allowance has been reached." : /global/.test(message) ? "AI is temporarily unavailable because the beta budget has been reached." : "You have used your welcome AI credits. Local edits and export remain available.");
  if (/busy|lease|fenced/.test(message)) throw new CloudProjectError("conflict", "An AI request is still processing or awaiting recovery. Check its status before generating again.");
  if (/disabled/.test(message)) throw new CloudProjectError("unavailable", "AI is currently unavailable. Local edits and export remain available.");
  throw new CloudProjectError("unavailable", "The AI request could not be saved. Check its status before trying again.");
}

export async function aiUsage(ownerId: string) {
  const { data, error } = await createAdminSupabaseClient().rpc("mirai_ai_usage", { target_owner: ownerId });
  if (error) aiError(error.message);
  return aiUsageSchema.parse(data);
}

export async function ownedAttempt(ownerId: string, requestId: string): Promise<AiAttempt> {
  const { data, error } = await createAdminSupabaseClient().from("ai_attempts").select("*").eq("id", requestId).eq("owner_id", ownerId).maybeSingle();
  if (error) aiError(error.message);
  if (!data) aiError("attempt not found");
  const attempt = data as AiAttempt;
  if (attempt.project_id) await getCloudProject(ownerId, attempt.project_id);
  return attempt;
}

export async function readAiResult(attempt: AiAttempt): Promise<StoredAiResult> {
  if (!["ready", "accepted"].includes(attempt.status) || Date.parse(attempt.expires_at) <= Date.now()) {
    const unlimited = (await aiUsage(attempt.owner_id).catch(() => null))?.unlimited;
    throw new CloudProjectError("conflict", attempt.status === "failed" ? unlimited ? "This generation failed. Start a new generation to try again." : "This generation failed and its credit was restored. Start a new generation to try again." : ["running", "unknown"].includes(attempt.status) ? unlimited ? "This AI request is still processing or has an unknown outcome. Check this request before generating again." : "This AI request is still processing or has an unknown outcome. Its credit is pending; generating again will not recover it." : "This temporary AI result has expired or was discarded.");
  }
  const { data, error } = await createAdminSupabaseClient().storage.from(AI_RESULT_BUCKET).download(attempt.result_key);
  if (error || !data) aiError("result download failed");
  return JSON.parse(await data.text()) as StoredAiResult;
}

/** Only confirmed pre-execution rejections can release provider spending; transport failures remain uncertain. */
export function confirmedProviderRejection(error: unknown): boolean {
  const status = error && typeof error === "object" && "diagnostics" in error
    ? (error.diagnostics as { status?: number } | undefined)?.status : undefined;
  return status !== undefined && [400, 401, 403, 404, 422, 429].includes(status);
}

/** Persist numeric provider usage only; diagnostic accounting never includes prompts or image data. */
export function numericProviderUsage(usage: unknown): Record<string, number> {
  const safe: Record<string, number> = {};
  function visit(value: unknown, prefix: string, depth: number) {
    if (!value || typeof value !== "object" || depth > 3) return;
    for (const [key, item] of Object.entries(value)) {
      if (!/^[a-zA-Z0-9_]{1,64}$/.test(key) || Object.keys(safe).length >= 40) continue;
      const name = prefix ? `${prefix}.${key}` : key;
      if (typeof item === "number" && Number.isFinite(item) && item >= 0) safe[name] = item;
      else if (item && typeof item === "object") visit(item, name, depth + 1);
    }
  }
  visit(usage, "", 0);
  return safe;
}

export function stageBudget(stage: AiStage, real: boolean): number {
  if (!real) return 0;
  const raw = stage === "image" ? process.env.MIRAI_AI_IMAGE_STAGE_MICROUSD : process.env.MIRAI_AI_TEXT_STAGE_MICROUSD;
  const cost = Number(raw);
  if (!Number.isSafeInteger(cost) || cost <= 0) aiError("global AI budget missing");
  return cost;
}

function stageConfiguration(stage: AiStage, workflow: AiWorkflow, real: boolean) {
  const model = stage !== "image"
    ? stage === "extend-analysis" ? process.env.OPENAI_EXTEND_PLANNER_MODEL ?? "gpt-5.6-luna" : process.env.OPENAI_EDIT_PLANNER_MODEL ?? "gpt-5-nano-2025-08-07"
    : workflow === "creation" ? process.env.OPENAI_ASSET_GENERATION_MODEL ?? "gpt-image-2"
      : workflow === "extend" ? process.env.OPENAI_EXTEND_IMAGE_MODEL ?? "gpt-image-2" : process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
  return { version: 1, provider: real ? "openai" : "fake", model: real ? model : "fake",
    quality: stage === "image" ? ["creation", "extend"].includes(workflow) ? "low" : process.env.OPENAI_IMAGE_QUALITY ?? "medium" : null,
    timeoutMs: 60_000, automaticRetries: 0, maxOutputTokens: stage === "image" ? null : 4096,
    spendingPolicy: "stage-ceiling-v1", ceilingMicrousd: stageBudget(stage, real) };
}

export class PaidAttempt {
  constructor(readonly attempt: AiAttempt, private readonly real: boolean) {}
  async stage<T>(stage: AiStage, work: () => Promise<T>): Promise<T> {
    const client = createAdminSupabaseClient();
    const started = await client.rpc("mirai_start_ai_stage", { target_owner: this.attempt.owner_id, target_id: this.attempt.id, target_stage: stage, target_cost: stageBudget(stage, this.real), target_configuration: stageConfiguration(stage, this.attempt.workflow, this.real) });
    if (started.error) aiError(started.error.message);
    let value: T;
    try { value = await work(); }
    catch (cause) {
      const completed = cause && typeof cause === "object" && "diagnostics" in cause && (cause.diagnostics as { providerCompleted?: boolean } | undefined)?.providerCompleted;
      const status = !this.real || confirmedProviderRejection(cause) ? "failed" : completed ? "succeeded" : "unknown";
      const correlation = cause && typeof cause === "object" && "diagnostics" in cause ? (cause.diagnostics as { providerRequestId?: unknown } | undefined)?.providerRequestId : null;
      const settled = await client.rpc("mirai_finish_ai_stage", { target_owner: this.attempt.owner_id, target_id: this.attempt.id, target_ordinal: started.data, target_status: status, target_provider: typeof correlation === "string" ? correlation.slice(0, 200) : null });
      if (settled.error) aiError(settled.error.message);
      const unlimited = (await aiUsage(this.attempt.owner_id).catch(() => null))?.unlimited;
      throw new CloudProjectError("unavailable", status === "unknown" ? unlimited ? "The provider outcome is unknown. Check this request before trying again." : "The provider outcome is unknown. Your credit is pending; check this request before trying again." : unlimited ? "The generation failed. Start a new generation to try again." : "The generation failed. Your AI credit will be restored.");
    }
    const providerRequestId = value && typeof value === "object" && "providerRequestId" in value ? String(value.providerRequestId) : null;
    const settled = await client.rpc("mirai_finish_ai_stage", { target_owner: this.attempt.owner_id, target_id: this.attempt.id, target_ordinal: started.data, target_status: "succeeded", target_provider: providerRequestId, target_usage: numericProviderUsage(value && typeof value === "object" && "usage" in value ? value.usage : undefined) });
    if (settled.error) aiError(settled.error.message);
    return value;
  }
}

/** Reserves before any provider call and persists a private result before acknowledging success. */
export async function runAiAttempt(input: {
  ownerId: string; requestId: string; projectId?: string; inputVersionId?: string; sessionId?: string;
  workflow: AiWorkflow; payload: unknown; stages: AiStage[]; real: boolean;
}, execute: (attempt: PaidAttempt) => Promise<StoredAiResult>): Promise<Record<string, unknown>> {
  const client = createAdminSupabaseClient();
  const digest = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");
  const existing = await client.from("ai_attempts").select("*").eq("id", input.requestId).eq("owner_id", input.ownerId).maybeSingle();
  if (existing.error) aiError(existing.error.message);
  if (existing.data) {
    const attempt = await ownedAttempt(input.ownerId, input.requestId);
    if (attempt.digest !== digest || attempt.workflow !== input.workflow || attempt.project_id !== (input.projectId ?? null)
      || attempt.input_version_id !== (input.inputVersionId ?? null) || attempt.creation_session_id !== (input.sessionId ?? null)) aiError("AI request key reused");
    return (await readAiResult(attempt)).response;
  }
  const executorId = crypto.randomUUID();
  const admitted = await client.rpc("mirai_admit_ai", { target_owner: input.ownerId, target_id: input.requestId,
    target_project: input.projectId ?? null, target_input: input.inputVersionId ?? null, target_session: input.sessionId ?? null,
    target_executor: executorId, target_workflow: input.workflow, target_digest: digest, target_budget: input.stages.reduce((sum, stage) => sum + stageBudget(stage, input.real), 0) });
  if (admitted.error) aiError(admitted.error.message);
  const attempt = admitted.data as AiAttempt;
  if (attempt.executor_id !== executorId) return (await readAiResult(attempt)).response;
  try {
    const result = await execute(new PaidAttempt(attempt, input.real));
    result.response.requestId = attempt.id;
    const bytes = Buffer.from(JSON.stringify(result));
    if (bytes.length > (input.workflow === "extend-analysis" ? 65536 : 41943040)) throw new CloudProjectError("invalid", "The AI result exceeds the supported storage envelope.");
    const stored = await client.storage.from(AI_RESULT_BUCKET).upload(attempt.result_key, bytes, { contentType: "application/json", upsert: false });
    if (stored.error) aiError("result storage failed");
    const finished = await client.rpc("mirai_finish_ai", { target_owner: input.ownerId, target_id: attempt.id, target_status: "ready", target_bytes: bytes.length });
    if (finished.error) aiError(finished.error.message);
    return result.response;
  } catch (cause) {
    const finished = await client.rpc("mirai_finish_ai", { target_owner: input.ownerId, target_id: attempt.id, target_status: "failed", target_bytes: 0 });
    if (!finished.error) await cleanupAiResult(attempt.id);
    throw cause;
  }
}

export async function createAiSession(ownerId: string) {
  const { data, error } = await createAdminSupabaseClient().rpc("mirai_create_ai_session", { target_owner: ownerId });
  if (error) aiError(error.message);
  return { id: data as string };
}

export async function discardAiAttempt(ownerId: string, requestId: string) {
  const attempt = await ownedAttempt(ownerId, requestId);
  if (attempt.status !== "ready") return;
  const changed = await createAdminSupabaseClient().from("ai_attempts").update({ status: "discarded", expires_at: new Date().toISOString() })
    .eq("id", requestId).eq("owner_id", ownerId).eq("status", "ready");
  if (changed.error) aiError(changed.error.message);
  await cleanupAiResult(requestId);
}

export const attemptIdSchema = z.uuid();

/** Best-effort physical deletion; maintenance retries before the database releases byte accounting. */
async function cleanupAiResult(requestId: string) {
  try {
    const client = createAdminSupabaseClient();
    const claimed = await client.rpc("mirai_claim_ai_cleanup", { target_id: requestId });
    if (claimed.error || !claimed.data) return;
    const removed = await client.storage.from(AI_RESULT_BUCKET).remove([claimed.data]);
    if (!removed.error) await client.rpc("mirai_finish_ai_cleanup", { target_id: requestId });
  } catch { /* Retain the reservation until maintenance confirms physical deletion. */ }
}
