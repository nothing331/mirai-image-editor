import "server-only";
import sharp from "sharp";
import { getCloudProject } from "@/server/cloud-projects/cloud-projects";
import { cloudCreationSchema } from "@/shared/cloud-ai";
import { configuredAssetGenerationProvider, assetGenerationCapabilities, createAssetGenerator } from "@/server/asset-generation/provider-factory";
import { buildAssetGenerationPrompt, buildImageGenerationPrompt, chooseMatteColor } from "@/server/asset-generation/prompt-builder";
import { normalizeAssetCandidate } from "@/server/asset-generation/candidate-normalizer";
import { resolveImageFormat } from "@/server/asset-generation/creation-presets";
import { reserveOriginalUpload, uploadOriginalBytes, finalizeOriginalUpload } from "@/server/assets/original-assets";
import { createAdminSupabaseClient } from "@/server/supabase/admin-client";
import { runAiAttempt, ownedAttempt, readAiResult, aiError } from "./attempts";
import { validateAiDimensions } from "./editing";

export async function generateCloudOriginal(ownerId: string, raw: unknown) {
  const input = cloudCreationSchema.parse(raw);
  const creation = input.creation;
  const dimensions = creation.mode === "image" ? resolveImageFormat(creation.format) : { width: 1024, height: 1024 };
  validateAiDimensions(dimensions.width, dimensions.height);
  const colors = creation.mode === "mark" && creation.brief.colorMode === "custom" ? creation.brief.colors : [];
  const matteColor = creation.mode === "mark" ? chooseMatteColor(colors) : null;
  const prompt = creation.mode === "mark" ? buildAssetGenerationPrompt(creation.brief, matteColor!) : buildImageGenerationPrompt(creation.prompt, creation.treatment, resolveImageFormat(creation.format));
  return runAiAttempt({ ownerId, requestId: input.requestId, sessionId: input.sessionId, workflow: "creation", payload: input, stages: ["image"], real: configuredAssetGenerationProvider() === "openai" }, async (attempt) => {
    const result = await attempt.stage("image", () => createAssetGenerator().generate({ mode: creation.mode, prompt, count: 1, ...dimensions, quality: "low", matteColor, colors }));
    if (result.candidates.length !== 1) aiError("invalid candidate count");
    const png = result.candidates[0].png;
    const normalized = creation.mode === "mark" ? await normalizeAssetCandidate(png, matteColor!) : { png, ...(await sharp(png, { limitInputPixels: 4_194_304 }).metadata()), transparency: undefined };
    if (!normalized.width || !normalized.height) aiError("invalid candidate dimensions");
    validateAiDimensions(normalized.width, normalized.height);
    if (normalized.width !== dimensions.width || normalized.height !== dimensions.height) aiError("invalid candidate dimensions");
    const capabilities = assetGenerationCapabilities();
    return { response: { creation, projectId: input.sessionId, requestId: input.requestId, provider: capabilities.provider, providerRequestId: result.providerRequestId, model: capabilities.model, quality: "low", mode: creation.mode, format: creation.format, ...dimensions, prompt, candidates: [{ id: input.requestId, candidateBase64: Buffer.from(normalized.png).toString("base64"), width: normalized.width, height: normalized.height, ...(normalized.transparency ? { transparency: normalized.transparency } : {}) }], warnings: normalized.transparency && normalized.transparency.status !== "clean" ? ["This mark may need a background cleanup pass."] : [], imageGenerationAttempted: true } };
  });
}

export async function attachCloudOriginal(ownerId: string, requestId: string, name: string) {
  const attempt = await ownedAttempt(ownerId, requestId);
  if (attempt.workflow !== "creation") aiError("creation result not found");
  const client = createAdminSupabaseClient();
  const session = await client.from("ai_creation_sessions").select("project_id").eq("id", attempt.creation_session_id).eq("owner_id", ownerId).single();
  if (session.error) aiError(session.error.message);
  if (session.data.project_id) {
    await getCloudProject(ownerId, session.data.project_id);
    return { id: session.data.project_id as string };
  }
  const result = await readAiResult(attempt);
  const candidates = result.response.candidates as Array<{ candidateBase64: string }>;
  const png = Buffer.from(candidates[0].candidateBase64, "base64");
  const upload = await reserveOriginalUpload(ownerId, { requestKey: attempt.id, originalName: "generated-original.png", mediaType: "image/png", bytes: png.length });
  if (upload.state !== "ready") {
    await uploadOriginalBytes(ownerId, upload.id, new Request("https://mirai.invalid/internal-upload", { method: "PUT", headers: { "Content-Type": "image/png", "Content-Length": String(png.length) }, body: png }));
    await finalizeOriginalUpload(ownerId, upload.id);
  }
  const project = await client.rpc("mirai_use_ai_original", { target_owner: ownerId, target_attempt: attempt.id, target_upload: upload.id, target_name: name });
  if (project.error) aiError(project.error.message);
  return { id: project.data as string };
}
