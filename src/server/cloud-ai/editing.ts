import "server-only";
import sharp from "sharp";
import { readCloudVersionBytes } from "@/server/cloud-projects/cloud-edit-history";
import { getCloudProject, CloudProjectError } from "@/server/cloud-projects/cloud-projects";
import { analyzeCandidate } from "@/server/ai/candidate-analysis";
import { configuredProviderName, createEditIntentPlanner, createImageEditProvider, createTransformPlanner, createTransformValidator, createExtendPlanner, createExtendProvider } from "@/server/ai/provider-factory";
import { buildTransformInstruction } from "@/server/ai/transform-instruction";
import { buildExtendInstruction } from "@/server/ai/extend-instruction";
import { blocksTransformAcceptance, unavailableTransformFidelityAssessment } from "@/shared/transform-fidelity";
import { cloudAiEditSchema, cloudExtendSchema, type CloudExtend } from "@/shared/cloud-ai";
import { getExtendPreset } from "@/shared/extend-presets";
import { extendSceneAnalysisSchema, solveSmartReframe } from "@/shared/extend-plan";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { runAiAttempt, ownedAttempt, readAiResult, type StoredAiResult, type PaidAttempt, aiError } from "./attempts";

const MAX_PIXELS = 4_194_304;
async function aiSourceInfo(ownerId: string, projectId: string, versionId: string) {
  await getCloudProject(ownerId, projectId);
  const { data, error } = await createAdminSupabaseClient().from("cloud_project_versions").select("width,height")
    .eq("id", versionId).eq("project_id", projectId).eq("owner_id", ownerId).eq("active", true).single();
  if (error || !data) aiError("current version not found");
  validateAiDimensions(data.width, data.height);
  return { width: data.width as number, height: data.height as number };
}
export async function aiSource(ownerId: string, projectId: string, versionId: string) {
  const png = await readCloudVersionBytes(ownerId, projectId, versionId);
  const { data, info } = await sharp(png, { limitInputPixels: MAX_PIXELS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  validateAiDimensions(info.width, info.height);
  return { png, pixels: data, width: info.width, height: info.height };
}
export function validateAiDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048 || width * height > MAX_PIXELS) {
    throw new CloudProjectError("invalid", "AI output must fit within 2,048 pixels per edge and 4 megapixels.");
  }
}
export function decodeAiMask(encoded: string | undefined, width: number, height: number): Buffer {
  const mask = Buffer.from(encoded ?? "", "base64");
  if (!encoded || mask.length !== width * height || mask.toString("base64") !== encoded || !mask.some((alpha) => alpha > 0)) {
    throw new CloudProjectError("invalid", "Use a non-empty mask matching the source image.");
  }
  return mask;
}
async function maskPng(alpha: Uint8Array, width: number, height: number) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let index = 0; index < alpha.length; index++) rgba[index * 4 + 3] = alpha[index];
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer());
}

export async function generateCloudEdit(ownerId: string, raw: unknown) {
  const input = cloudAiEditSchema.parse(raw);
  if (input.operation !== "remove" && !input.prompt && !input.presetId) throw new CloudProjectError("invalid", "Describe the requested change.");
  if (input.operation === "transform" && (input.boundaryPolicy !== "review" || !input.preservationMode)) throw new CloudProjectError("invalid", "Transform requires complete-image review and a preservation mode.");
  const source = await aiSourceInfo(ownerId, input.projectId, input.inputVersionId);
  const full = Buffer.alloc(source.width * source.height, 255);
  const selection = input.operation === "transform" ? full : decodeAiMask(input.selectionMaskBase64, source.width, source.height);
  const mask = input.operation === "transform" ? full : decodeAiMask(input.providerMaskBase64, source.width, source.height);
  const transform = { presetId: input.presetId ?? null, presetVersion: input.presetVersion ?? null, userPrompt: input.prompt, preservationMode: input.preservationMode ?? "faithful" as const };
  if (input.operation === "transform") buildTransformInstruction(transform);
  return runAiAttempt({ ownerId, requestId: input.requestId, projectId: input.projectId, inputVersionId: input.inputVersionId,
    workflow: input.operation, payload: input, real: configuredProviderName() === "openai",
    stages: input.operation === "transform" ? ["transform-plan", "image", "transform-fidelity"] : input.operation === "replace" ? ["replace-plan", "image"] : ["image"],
  }, async (attempt) => {
    const source = await aiSource(ownerId, input.projectId, input.inputVersionId);
    const selectionMaskPng = await maskPng(selection, source.width, source.height);
    const providerMaskPng = await maskPng(mask, source.width, source.height);
    const plan = input.operation === "replace" ? (await attempt.stage("replace-plan", () => createEditIntentPlanner().plan({ imagePng: source.png, selectionMaskPng, width: source.width, height: source.height, prompt: input.prompt }))).plan : undefined;
    const transformPlan = input.operation === "transform" ? (await attempt.stage("transform-plan", () => createTransformPlanner().plan({ imagePng: source.png, width: source.width, height: source.height }))).plan : undefined;
    const instruction = transformPlan ? buildTransformInstruction({ ...transform, plan: transformPlan }) : input.prompt;
    const result = await attempt.stage("image", () => createImageEditProvider().edit({ imagePng: source.png, maskPng: input.operation === "transform" ? undefined : providerMaskPng, width: source.width, height: source.height, operation: input.operation, boundaryPolicy: input.boundaryPolicy, prompt: instruction, plan }));
    const candidate = await sharp(result.candidatePng, { limitInputPixels: MAX_PIXELS }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (candidate.info.width !== source.width || candidate.info.height !== source.height) throw new CloudProjectError("invalid", "The provider candidate dimensions do not match the source.");
    let candidateAnalysis;
    try { candidateAnalysis = (await analyzeCandidate({ sourcePng: source.png, candidatePng: result.candidatePng, selectionMaskPng, width: source.width, height: source.height, operation: input.operation })).analysis; }
    catch { candidateAnalysis = { differenceThreshold: 12, changedPixels: 0, changedPixelRatio: 0, changedInsideSelectionPixels: 0, changedInsideSelectionRatio: 0, changedOutsideSelectionPixels: 0, changedOutsideSelectionRatio: 0, changedBoundaryPixels: 0, classification: "analysis-unavailable", warnings: ["candidate-analysis-failed"] }; }
    let assessment = null;
    if (transformPlan) {
      try { assessment = (await attempt.stage("transform-fidelity", () => createTransformValidator().validate({ sourcePng: source.png, candidatePng: result.candidatePng, width: source.width, height: source.height, plan: transformPlan, preservationMode: transform.preservationMode, changedPixelRatio: candidateAnalysis.changedPixelRatio }))).assessment; }
      catch { assessment = unavailableTransformFidelityAssessment(); }
    }
    const parameters: Record<string, unknown> = input.operation === "transform"
      ? { ...transform, resolvedInstruction: instruction, providerRequestId: result.providerRequestId, diagnosticRequestId: input.requestId, candidateAnalysis, transformFidelityAssessment: assessment }
      : { prompt: input.prompt, providerRequestId: result.providerRequestId, diagnosticRequestId: input.requestId, boundaryPolicy: input.boundaryPolicy, candidateAnalysis };
    return {
      response: { candidateBase64: Buffer.from(result.candidatePng).toString("base64"), providerRequestId: result.providerRequestId, candidateAnalysis, transformFidelityAssessment: assessment, resolvedInstruction: instruction, imageGenerationAttempted: true, projectId: input.projectId },
      acceptance: { maskBase64: mask.toString("base64"), maskWidth: source.width, maskHeight: source.height, width: source.width, height: source.height, parameters },
    };
  });
}

function analysisVersion() { return `scene-v1-solver-v2:${configuredProviderName()}:${process.env.OPENAI_EXTEND_PLANNER_MODEL ?? "gpt-5.6-luna"}`; }
async function cachedAnalysis(ownerId: string, input: CloudExtend) {
  const { data, error } = await createAdminSupabaseClient().from("ai_extend_analysis").select("analysis")
    .eq("owner_id", ownerId).eq("project_id", input.projectId).eq("input_version_id", input.inputVersionId).eq("cache_version", analysisVersion()).maybeSingle();
  if (error) aiError(error.message);
  return data ? extendSceneAnalysisSchema.parse(data.analysis) : null;
}
export async function planCloudExtend(ownerId: string, raw: unknown) {
  const input = cloudExtendSchema.parse(raw);
  const source = await aiSourceInfo(ownerId, input.projectId, input.inputVersionId);
  let analysis = await cachedAnalysis(ownerId, input);
  if (!analysis) {
    const response = await runAiAttempt({ ownerId, requestId: input.requestId, projectId: input.projectId, inputVersionId: input.inputVersionId, workflow: "extend-analysis", payload: { inputVersionId: input.inputVersionId, cacheVersion: analysisVersion() }, real: configuredProviderName() === "openai", stages: ["extend-analysis"] }, async (attempt: PaidAttempt) => {
      const source = await aiSource(ownerId, input.projectId, input.inputVersionId);
      const result = await attempt.stage("extend-analysis", () => createExtendPlanner().analyze({ imagePng: source.png, width: source.width, height: source.height }));
      const saved = await createAdminSupabaseClient().from("ai_extend_analysis").upsert({ owner_id: ownerId, project_id: input.projectId, input_version_id: input.inputVersionId, cache_version: analysisVersion(), analysis: extendSceneAnalysisSchema.parse(result.analysis) }, { onConflict: "owner_id,project_id,input_version_id,cache_version", ignoreDuplicates: true });
      if (saved.error) aiError(saved.error.message);
      return { response: { analysis: result.analysis } };
    });
    analysis = extendSceneAnalysisSchema.parse(response.analysis);
    const saved = await createAdminSupabaseClient().from("ai_extend_analysis").upsert({ owner_id: ownerId, project_id: input.projectId, input_version_id: input.inputVersionId, cache_version: analysisVersion(), analysis }, { onConflict: "owner_id,project_id,input_version_id,cache_version", ignoreDuplicates: true });
    if (saved.error) aiError(saved.error.message);
  }
  const preset = getExtendPreset(input.presetId, input.presetVersion)!;
  const plan = solveSmartReframe({ width: source.width, height: source.height, presetId: input.presetId, presetVersion: input.presetVersion, ratio: preset.ratio, strategy: input.strategy, analysis });
  validateAiDimensions(plan.outputWidth, plan.outputHeight);
  return { analysis, plan };
}
export async function generateCloudExtend(ownerId: string, raw: unknown) {
  const input = cloudExtendSchema.parse(raw);
  const source = await aiSourceInfo(ownerId, input.projectId, input.inputVersionId);
  const analysis = await cachedAnalysis(ownerId, input);
  if (!analysis) throw new CloudProjectError("invalid", "Plan this frame before generating.");
  const preset = getExtendPreset(input.presetId, input.presetVersion)!;
  const plan = solveSmartReframe({ width: source.width, height: source.height, presetId: input.presetId, presetVersion: input.presetVersion, ratio: preset.ratio, strategy: input.strategy, analysis });
  if (JSON.stringify(plan) !== JSON.stringify(input.plan)) throw new CloudProjectError("invalid", "The Extend plan has changed. Plan the frame again.");
  validateAiDimensions(plan.outputWidth, plan.outputHeight);
  return runAiAttempt({ ownerId, requestId: input.requestId, projectId: input.projectId, inputVersionId: input.inputVersionId, workflow: "extend", payload: input, real: configuredProviderName() === "openai", stages: ["image"] }, async (attempt) => {
    const source = await aiSource(ownerId, input.projectId, input.inputVersionId);
    const instruction = buildExtendInstruction(plan, analysis, input.userPrompt);
    const result = await attempt.stage("image", () => createExtendProvider().extend({ sourcePng: source.png, plan, instruction }));
    const metadata = await sharp(result.candidatePng, { limitInputPixels: MAX_PIXELS }).metadata();
    if (metadata.width !== plan.outputWidth || metadata.height !== plan.outputHeight) throw new CloudProjectError("invalid", "The Extend candidate dimensions do not match the planned frame.");
    const candidateBase64 = Buffer.from(result.candidatePng).toString("base64");
    return { response: { candidateBase64, providerRequestId: result.providerRequestId, resolvedInstruction: instruction, width: plan.outputWidth, height: plan.outputHeight, quality: "low" },
      acceptance: { maskBase64: Buffer.alloc(source.width * source.height, 255).toString("base64"), maskWidth: source.width, maskHeight: source.height, width: plan.outputWidth, height: plan.outputHeight,
        parameters: { presetId: input.presetId, presetVersion: input.presetVersion, strategy: input.strategy, userPrompt: input.userPrompt, plan, analysis, resolvedInstruction: instruction, providerRequestId: result.providerRequestId, diagnosticRequestId: input.requestId } } };
  });
}

/** Accept only the stored provider result and server-owned fidelity evidence, never client assertions. */
export async function prepareAiAcceptance(ownerId: string, projectId: string, inputVersionId: string, operation: { type: string; parameters: Record<string, unknown> }) {
  const requestId = operation.parameters.diagnosticRequestId;
  if (typeof requestId !== "string") throw new CloudProjectError("invalid", "A stored AI result reference is required.");
  const attempt = await ownedAttempt(ownerId, requestId);
  if (attempt.project_id !== projectId || attempt.input_version_id !== inputVersionId || attempt.workflow !== operation.type) throw new CloudProjectError("invalid", "This AI preview belongs to another edit.");
  const result: StoredAiResult = await readAiResult(attempt);
  const acceptance = result.acceptance;
  if (!acceptance) throw new CloudProjectError("invalid", "This request has no editable candidate.");
  const parameters = acceptance.parameters;
  if (operation.type === "transform" && blocksTransformAcceptance(parameters.preservationMode as "faithful" | "balanced" | "imaginative", parameters.transformFidelityAssessment as import("@/shared/transform-fidelity").TransformFidelityAssessment)) throw new CloudProjectError("invalid", "This Transform proposal does not meet the selected preservation level. Generate a new preview or choose Imaginative mode.");
  let png = Buffer.from(String(result.response.candidateBase64), "base64");
  const mask = Buffer.from(acceptance.maskBase64, "base64");
  if (parameters.boundaryPolicy === "protected") {
    const source = await aiSource(ownerId, projectId, inputVersionId);
    const candidate = await sharp(png).ensureAlpha().raw().toBuffer();
    const composite = new Uint8ClampedArray(source.pixels);
    for (let pixel = 0; pixel < mask.length; pixel++) {
      const amount = mask[pixel] / 255;
      for (let channel = 0; channel < 4; channel++) composite[pixel * 4 + channel] = Math.round(candidate[pixel * 4 + channel] * amount + source.pixels[pixel * 4 + channel] * (1 - amount));
    }
    png = await sharp(composite, { raw: { width: source.width, height: source.height, channels: 4 } }).png().toBuffer();
  }
  return { outputDataUrl: `data:image/png;base64,${png.toString("base64")}`, maskAlphaBase64: mask.toString("base64"), maskWidth: acceptance.maskWidth, maskHeight: acceptance.maskHeight, width: acceptance.width, height: acceptance.height, parameters };
}
