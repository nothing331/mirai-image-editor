// @vitest-environment node
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { reserveOriginalUpload, uploadOriginalBytes, finalizeOriginalUpload } from "@/server/assets/original-assets";
import { createCloudProject } from "@/server/cloud-projects/cloud-projects";
import { commitCloudEdit, readCloudVersionBytes, listCloudHistory, selectCloudVersion } from "@/server/cloud-projects/cloud-edit-history";
import { generateCloudEdit, generateCloudExtend, planCloudExtend, prepareAiAcceptance } from "./editing";
import { aiUsage, createAiSession, ownedAttempt, runAiAttempt, discardAiAttempt, AI_RESULT_BUCKET } from "./attempts";
import { attachCloudOriginal, generateCloudOriginal } from "./creation";
import * as providers from "@/server/ai/provider-factory";
import { unavailableTransformFidelityAssessment } from "@/shared/transform-fidelity";

const enabled = process.env.MIRAI_AI_INTEGRATION === "1";
describe.runIf(enabled)("Wave D cloud AI with actual Postgres and private Storage", () => {
  let ownerId: string;
  let foreignId: string;
  beforeAll(async () => {
    const status = JSON.parse(execFileSync("npx", ["--yes", "supabase@2.116.0", "status", "-o", "json"], { encoding: "utf8" })) as Record<string, string>;
    process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = status.PUBLISHABLE_KEY;
    process.env.SUPABASE_SECRET_KEY = status.SECRET_KEY;
    process.env.IMAGE_EDIT_PROVIDER = "fake";
    process.env.ASSET_GENERATION_PROVIDER = "fake";
    const admin = createAdminSupabaseClient();
    expect((await admin.from("ai_control").update({ enabled: true }).eq("id", true)).error).toBeNull();
    ownerId = randomUUID(); foreignId = randomUUID();
    for (const id of [ownerId, foreignId]) {
      expect((await admin.auth.admin.createUser({ id, email: `${id}@example.test`, email_confirm: true })).error).toBeNull();
      expect((await admin.from("profiles").update({ status: "active" }).eq("id", id)).error).toBeNull();
      expect((await admin.from("account_allowance_grants").insert({ account_id: id, allowance_key: "initial-ai-images", granted_quantity: 25, granted_by: id })).error).toBeNull();
    }
  }, 60_000);

  async function fixture() {
    const source = await sharp({ create: { width: 32, height: 24, channels: 4, background: "#dc6a48" } }).png().toBuffer();
    const upload = await reserveOriginalUpload(ownerId, { requestKey: randomUUID(), originalName: "source.png", mediaType: "image/png", bytes: source.length });
    await uploadOriginalBytes(ownerId, upload.id, new Request("https://example.test", { method: "PUT", headers: { "content-length": String(source.length) }, body: source }));
    await finalizeOriginalUpload(ownerId, upload.id);
    const project = await createCloudProject(ownerId, upload.id, "AI fixture");
    return { project, source };
  }
  async function editFixture() {
    const { project, source } = await fixture();
    const mask = Buffer.alloc(32 * 24); mask[0] = 255;
    return { project, source, input: { requestId: randomUUID(), projectId: project.id, inputVersionId: project.currentVersionId, operation: "replace" as const, prompt: "Replace this detail with a compass", boundaryPolicy: "review" as const, selectionMaskBase64: mask.toString("base64"), providerMaskBase64: mask.toString("base64") } };
  }
  function commit(projectId: string, versionId: string, resultId: string, type: string) {
    const outputVersionId = randomUUID();
    return { projectId, command: { requestKey: randomUUID(), assetId: randomUUID(), inputVersionId: versionId, outputVersionId, replaceFuture: false, outputDataUrl: "data:image/png;base64,AAAA", maskAlphaBase64: "AAAA", maskWidth: 1, maskHeight: 1,
      operation: { id: randomUUID(), inputVersionId: versionId, outputVersionId, maskId: randomUUID(), type, method: "generative", status: "accepted", parameters: { diagnosticRequestId: resultId } } } };
  }

  it("retains the complete review candidate, recovers one result, and accepts exactly once", async () => {
    const { project, source, input } = await editFixture();
    const before = await aiUsage(ownerId);
    const result = await generateCloudEdit(ownerId, input);
    expect((await aiUsage(ownerId)).spent).toBe(before.spent + 1);
    const providerPixels = await sharp(Buffer.from(String(result.candidateBase64), "base64")).ensureAlpha().raw().toBuffer();
    const sourcePixels = await sharp(source).ensureAlpha().raw().toBuffer();
    expect(providerPixels.subarray(4, 8)).not.toEqual(sourcePixels.subarray(4, 8));
    expect(await generateCloudEdit(ownerId, input)).toEqual(result);
    expect((await aiUsage(ownerId)).spent).toBe(before.spent + 1);
    await expect(generateCloudEdit(ownerId, { ...input, prompt: "different" })).rejects.toThrow("different inputs");
    await expect(generateCloudEdit(foreignId, { ...input, requestId: randomUUID() })).rejects.toThrow();
    await expect(ownedAttempt(foreignId, input.requestId)).rejects.toThrow();
    const { command } = commit(project.id, project.currentVersionId, input.requestId, "replace");
    const receipt = await commitCloudEdit(ownerId, project.id, command);
    expect(await commitCloudEdit(ownerId, project.id, command)).toEqual(receipt);
    expect((await listCloudHistory(ownerId, project.id)).versions).toHaveLength(2);
    const accepted = await readCloudVersionBytes(ownerId, project.id, command.outputVersionId);
    expect(await sharp(accepted).ensureAlpha().raw().toBuffer()).toEqual(providerPixels);
    await selectCloudVersion(ownerId, project.id, project.currentVersionId);
    expect((await listCloudHistory(ownerId, project.id)).versions).toHaveLength(2);
    await selectCloudVersion(ownerId, project.id, command.outputVersionId);
    expect((await aiUsage(ownerId)).spent).toBe(before.spent + 1);
  });

  it("restores exact source pixels in protected acceptance and stores the original candidate", async () => {
    const { project, source, input } = await editFixture();
    const result = await generateCloudEdit(ownerId, { ...input, boundaryPolicy: "protected" });
    const { command } = commit(project.id, project.currentVersionId, input.requestId, "replace");
    await commitCloudEdit(ownerId, project.id, command);
    const sourcePixels = await sharp(source).ensureAlpha().raw().toBuffer();
    const accepted = await sharp(await readCloudVersionBytes(ownerId, project.id, command.outputVersionId)).ensureAlpha().raw().toBuffer();
    expect(accepted.subarray(4)).toEqual(sourcePixels.subarray(4));
    expect(accepted.subarray(0, 4)).not.toEqual(sourcePixels.subarray(0, 4));
    expect((await generateCloudEdit(ownerId, { ...input, boundaryPolicy: "protected" })).candidateBase64).toBe(result.candidateBase64);
  });

  it("meters all Transform stages and rejects forged client fidelity", async () => {
    const { project } = await fixture();
    const request = { requestId: randomUUID(), projectId: project.id, inputVersionId: project.currentVersionId, operation: "transform", boundaryPolicy: "review", prompt: "", presetId: "anime", presetVersion: 1, preservationMode: "faithful" };
    const validator = vi.spyOn(providers, "createTransformValidator").mockReturnValue({ validate: async () => ({ assessment: unavailableTransformFidelityAssessment(), providerRequestId: "fake-blocked" }) });
    try { await generateCloudEdit(ownerId, request); } finally { validator.mockRestore(); }
    const stages = await createAdminSupabaseClient().from("ai_stage_attempts").select("stage").eq("attempt_id", request.requestId).order("ordinal");
    expect(stages.data?.map((row) => row.stage)).toEqual(["transform-plan", "image", "transform-fidelity"]);
    await expect(prepareAiAcceptance(ownerId, project.id, project.currentVersionId, { type: "transform", parameters: { diagnosticRequestId: request.requestId, transformFidelityAssessment: { verdict: "pass" }, preservationMode: "imaginative" } })).rejects.toThrow("preservation level");
  });

  it("caches owned Extend analysis and rejects a tampered frozen frame before charging", async () => {
    const { project } = await fixture();
    const input = { requestId: randomUUID(), projectId: project.id, inputVersionId: project.currentVersionId, presetId: "youtube-thumbnail", presetVersion: 1, strategy: "preserve-all", userPrompt: "" };
    const before = await aiUsage(ownerId);
    const planned = await planCloudExtend(ownerId, input);
    const replanned = await planCloudExtend(ownerId, { ...input, requestId: randomUUID() });
    expect(replanned).toEqual(planned);
    expect((await aiUsage(ownerId)).spent).toBe(before.spent);
    await expect(generateCloudExtend(ownerId, { ...input, requestId: randomUUID(), plan: { ...planned.plan, seamWidth: 99 } })).rejects.toThrow("plan has changed");
    const requestId = randomUUID();
    const result = await generateCloudExtend(ownerId, { ...input, requestId, plan: planned.plan });
    const { command } = commit(project.id, project.currentVersionId, requestId, "extend");
    await commitCloudEdit(ownerId, project.id, command);
    const metadata = await sharp(await readCloudVersionBytes(ownerId, project.id, command.outputVersionId)).metadata();
    expect(metadata.width).toBe(result.width); expect(metadata.height).toBe(result.height);
    expect((await aiUsage(ownerId)).spent).toBe(before.spent + 1);
    const analysis = await createAdminSupabaseClient().from("ai_extend_analysis").select("input_version_id").eq("project_id", project.id);
    expect(analysis.data).toHaveLength(1);
  });

  it("creates one owned original with zero edits when Use image is repeated", async () => {
    const session = await createAiSession(foreignId);
    const requestId = randomUUID();
    await generateCloudOriginal(foreignId, { requestId, sessionId: session.id, creation: { mode: "image", prompt: "A landscape at sunset", treatment: "auto", format: "youtube-thumbnail" } });
    const project = await attachCloudOriginal(foreignId, requestId, "Generated original");
    expect(await attachCloudOriginal(foreignId, requestId, "Generated original")).toEqual(project);
    expect((await listCloudHistory(foreignId, project.id)).versions).toHaveLength(1);
    const operations = await createAdminSupabaseClient().from("cloud_edit_operations").select("id").eq("project_id", project.id);
    expect(operations.data).toHaveLength(0);
    expect((await aiUsage(foreignId)).spent).toBe(1);
    await expect(generateCloudOriginal(foreignId, { requestId: randomUUID(), sessionId: session.id, creation: { mode: "image", prompt: "A new landscape at sunset", treatment: "auto", format: "youtube-thumbnail" } })).rejects.toThrow("unavailable");
    expect((await aiUsage(foreignId)).spent).toBe(1);
  });

  it("restores a confirmed failed credit without history or another paid retry", async () => {
    const session = await createAiSession(foreignId);
    const before = await aiUsage(foreignId);
    const requestId = randomUUID();
    await expect(runAiAttempt({ ownerId: foreignId, requestId, sessionId: session.id, workflow: "creation", payload: {}, real: false, stages: ["image"] }, (attempt) => attempt.stage("image", async () => { throw new Error("fake failure"); }))).rejects.toThrow("credit will be restored");
    expect(await aiUsage(foreignId)).toEqual(before);
    const failed = await ownedAttempt(foreignId, requestId);
    expect(failed.status).toBe("failed");
    expect((await createAdminSupabaseClient().storage.from(AI_RESULT_BUCKET).download(failed.result_key)).error).not.toBeNull();
  });
  it("reuses one creation session and fences concurrent same-key and competing work", async () => {
    const session = await createAiSession(foreignId);
    expect(await createAiSession(foreignId)).toEqual(session);
    const requestId = randomUUID();
    let calls = 0;
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const hold = new Promise<void>((resolve) => { release = resolve; });
    const input = { ownerId: foreignId, requestId, sessionId: session.id, workflow: "creation" as const, payload: { purpose: "race" }, real: false, stages: ["image" as const] };
    const execute = async (attempt: Parameters<Parameters<typeof runAiAttempt>[1]>[0]) => {
      await attempt.stage("image", async () => { calls++; started(); await hold; return { providerRequestId: "fake-race", usage: { input_tokens: 9 } }; });
      return { response: { candidate: "bounded fixture" } };
    };
    const first = runAiAttempt(input, execute);
    await startedPromise;
    try {
      await expect(runAiAttempt(input, execute)).rejects.toThrow("still processing");
      await expect(runAiAttempt({ ...input, requestId: randomUUID() }, execute)).rejects.toThrow("still processing");
    } finally { release(); }
    const result = await first;
    expect(calls).toBe(1);
    expect(await runAiAttempt(input, execute)).toEqual(result);
    const stages = await createAdminSupabaseClient().from("ai_stage_attempts").select("usage,configuration").eq("attempt_id", requestId);
    expect(stages.data?.[0].usage).toEqual({ input_tokens: 9 });
    expect(stages.data?.[0].configuration.automaticRetries).toBe(0);
    const before = await aiUsage(foreignId);
    await discardAiAttempt(foreignId, requestId);
    expect(await aiUsage(foreignId)).toEqual(before);
    expect((await createAdminSupabaseClient().from("ai_attempts").select("storage_bytes").eq("id", requestId).single()).data?.storage_bytes).toBe(0);
    expect((await createAdminSupabaseClient().storage.from(AI_RESULT_BUCKET).download((await ownedAttempt(foreignId, requestId)).result_key)).error).not.toBeNull();
  });

  it("holds timeout outcomes, restores confirmed rejection, and retains completed provider cost", async () => {
    const admin = createAdminSupabaseClient();
    await admin.from("ai_control").update({ budget_microusd: 1000 }).eq("id", true);
    process.env.MIRAI_AI_IMAGE_STAGE_MICROUSD = "10";
    const session = await createAiSession(foreignId);
    const before = await aiUsage(foreignId);
    const committedBefore = (await admin.from("ai_control").select("committed_microusd").eq("id", true).single()).data!.committed_microusd;
    const input = { ownerId: foreignId, requestId: randomUUID(), sessionId: session.id, workflow: "creation" as const, payload: {}, real: true, stages: ["image" as const] };
    await expect(runAiAttempt(input, (attempt) => attempt.stage("image", async () => { throw { diagnostics: { status: 408, providerRequestId: "synthetic-timeout" } }; }))).rejects.toThrow("outcome is unknown");
    expect((await aiUsage(foreignId)).pending).toBe(before.pending + 1);
    expect((await ownedAttempt(foreignId, input.requestId)).status).toBe("unknown");
    expect((await admin.from("ai_stage_attempts").select("provider_request_id").eq("attempt_id", input.requestId).single()).data?.provider_request_id).toBe("synthetic-timeout");
    await admin.from("ai_attempts").update({ lease_until: new Date(0).toISOString() }).eq("id", input.requestId);
    expect((await admin.rpc("mirai_reconcile_ai", { target_id: input.requestId, target_outcome: "failed", target_bytes: 0, target_reason: "Synthetic provider confirmed failure" })).error).toBeNull();
    expect(await aiUsage(foreignId)).toEqual(before);
    await expect(runAiAttempt({ ...input, requestId: randomUUID() }, (attempt) => attempt.stage("image", async () => { throw { diagnostics: { status: 429 } }; }))).rejects.toThrow("credit will be restored");
    expect(await aiUsage(foreignId)).toEqual(before);
    await expect(runAiAttempt({ ...input, requestId: randomUUID() }, (attempt) => attempt.stage("image", async () => { throw { diagnostics: { providerCompleted: true } }; }))).rejects.toThrow("credit will be restored");
    expect(await aiUsage(foreignId)).toEqual(before);
    expect((await admin.from("ai_control").select("committed_microusd").eq("id", true).single()).data?.committed_microusd).toBe(committedBefore + 20);
    delete process.env.MIRAI_AI_IMAGE_STAGE_MICROUSD;
  });

  it("fences a provider response after revocation without writing history", async () => {
    const session = await createAiSession(foreignId);
    const admin = createAdminSupabaseClient();
    const before = await aiUsage(foreignId);
    try {
      await expect(runAiAttempt({ ownerId: foreignId, requestId: randomUUID(), sessionId: session.id, workflow: "creation", payload: {}, real: false, stages: ["image"] }, async (attempt) => {
        await attempt.stage("image", async () => {
          await admin.from("profiles").update({ status: "revoked" }).eq("id", foreignId);
          return { providerRequestId: "fake-revoked" };
        });
        return { response: { candidate: "never publicly ready" } };
      })).rejects.toThrow();
      expect(await aiUsage(foreignId)).toEqual(before);
    } finally { await admin.from("profiles").update({ status: "active" }).eq("id", foreignId); }
  });

  it("charges Remove and Restyle once each and discards them without history or refunds", async () => {
    const { project, input } = await editFixture();
    const before = await aiUsage(ownerId);
    for (const operation of ["remove", "restyle"] as const) {
      const requestId = randomUUID();
      await generateCloudEdit(ownerId, { ...input, requestId, operation });
      const stages = await createAdminSupabaseClient().from("ai_stage_attempts").select("stage").eq("attempt_id", requestId);
      expect(stages.data?.map((stage) => stage.stage)).toEqual(["image"]);
      await discardAiAttempt(ownerId, requestId);
    }
    expect((await aiUsage(ownerId)).spent).toBe(before.spent + 2);
    expect((await listCloudHistory(ownerId, project.id)).versions).toHaveLength(1);
  });

});
