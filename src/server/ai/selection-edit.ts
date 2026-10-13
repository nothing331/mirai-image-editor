import sharp from "sharp";
import { selectionIntentSchema } from "@/shared/selection-intent";
import type { EditBoundaryPolicy } from "@/shared/edit-boundary";
import type { ReferenceImage } from "@/shared/reference-images";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import { createGenerativeProviderMask } from "@/features/editor/mask";
import { recolorPixels } from "@/features/editor/recolor";
import { configuredProviderName, createEditIntentPlanner, createImageEditProvider } from "./provider-factory";
import { configuredImageConversationModel } from "./openai-image-conversation";
import { prepareReferenceImages } from "./reference-images";
import { analyzeCandidate } from "./candidate-analysis";
import { assertConversationProvider, visibleEditPreview, PreviewConversationError, type PreviewConversation } from "./preview-conversation";
import type { EditIntentPlannerRequest, EditIntentPlannerResult } from "./intent-planner";
import type { ImageEditRequest, ProviderCandidate, ProviderScenario } from "./contracts";

export interface SelectionEditInput {
  projectId: string; requestId: string; sourcePng: Uint8Array; selectionMaskPng: Uint8Array;
  width: number; height: number; prompt: string; boundaryPolicy: EditBoundaryPolicy;
  references: ReferenceImage[]; scenario?: ProviderScenario;
  parent?: { conversation: PreviewConversation; response: Record<string, unknown> };
}

/** One validated visual plan chooses the processor; no UI operation or provider mask is authoritative. */
export async function generateSelectionEdit(input: SelectionEditInput, diagnostics?: ImageEditDiagnosticSink, hooks?: {
  plan: (request: EditIntentPlannerRequest) => Promise<EditIntentPlannerResult>;
  generate: (request: ImageEditRequest) => Promise<ProviderCandidate>;
}) {
  if (!input.prompt.trim() || input.prompt.trim().length > 2000) throw new PreviewConversationError("Describe the change in under 2,000 characters.");
  const provider = configuredProviderName();
  const model = provider === "openai" ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2" : "fake-image-editor";
  const references = input.parent?.conversation.references ?? input.references;
  const preparedReferences = await prepareReferenceImages(references);
  const maskMetadata = await sharp(input.selectionMaskPng).metadata();
  if (maskMetadata.format !== "png" || maskMetadata.width !== input.width || maskMetadata.height !== input.height) throw new PreviewConversationError("The selection must match the source image dimensions.");
  const rgba = await sharp(input.selectionMaskPng).ensureAlpha().raw().toBuffer();
  const alpha = new Uint8ClampedArray(input.width * input.height);
  for (let index = 0; index < alpha.length; index++) alpha[index] = rgba[index * 4 + 3];
  if (!alpha.some(value => value > 0)) throw new PreviewConversationError("Select an area before previewing the change.");
  let target = input.sourcePng;
  if (input.parent) {
    assertConversationProvider(input.parent.conversation, provider, model);
    if (!input.parent.conversation.edit || typeof input.parent.response.candidateBase64 !== "string") throw new PreviewConversationError("This preview has no editable context.");
    target = await visibleEditPreview(Buffer.from(input.parent.response.candidateBase64, "base64"), input.parent.conversation.edit, input.width, input.height);
  }
  const planned = await (hooks?.plan ?? (request => createEditIntentPlanner().plan(request, diagnostics)))({ imagePng: target, selectionMaskPng: input.selectionMaskPng,
    referenceImages: preparedReferences, width: input.width, height: input.height, prompt: input.prompt, automatic: true });
  const intent = selectionIntentSchema.parse(planned.intent);
  const mask = createGenerativeProviderMask({ width: input.width, height: input.height, data: alpha }, intent.operation === "recolor" ? "restyle" : intent.operation);
  const providerMaskPng = await alphaPng(mask.data, input.width, input.height);
  await diagnostics?.artifact("effective-mask.png", providerMaskPng, "image/png");
  await diagnostics?.event("final-instruction", "Selected the edit processor from the validated prompt intent.", { operation: intent.operation, color: intent.color });
  for (const [index, reference] of preparedReferences.entries()) await diagnostics?.artifact(`reference-${index + 1}.png` as import("@/shared/request-diagnostics").DiagnosticArtifactName, reference, "image/png");
  let candidatePng: Uint8Array, responseId: string | null = null, providerRequestId = planned.providerRequestId;
  if (intent.operation === "recolor") {
    const pixels = new Uint8ClampedArray(await sharp(target).ensureAlpha().raw().toBuffer());
    const recolored = recolorPixels({ width: input.width, height: input.height, pixels }, { width: input.width, height: input.height, data: alpha }, intent.color!);
    candidatePng = await sharp(recolored, { raw: { width: input.width, height: input.height, channels: 4 } }).png().toBuffer();
  } else {
    const result = await (hooks?.generate ?? (request => createImageEditProvider().edit(request, diagnostics)))({ imagePng: target, referenceImages: preparedReferences,
      maskPng: providerMaskPng, width: input.width, height: input.height, operation: intent.operation, prompt: input.prompt, plan: intent.plan,
      boundaryPolicy: input.boundaryPolicy, conversational: true, refinementPrompt: input.parent ? input.prompt : undefined, scenario: input.scenario });
    candidatePng = result.candidatePng; responseId = result.conversationResponseId ?? null; providerRequestId = result.providerRequestId;
  }
  const metadata = await sharp(candidatePng).metadata();
  if (metadata.format !== "png" || metadata.width !== input.width || metadata.height !== input.height) throw new PreviewConversationError("The preview did not preserve the input dimensions.");
  let candidateAnalysis: import("@/shared/edit-boundary").CandidateAnalysis;
  try {
    const analysis = await analyzeCandidate({ sourcePng: input.sourcePng, candidatePng, selectionMaskPng: input.selectionMaskPng,
      width: input.width, height: input.height, operation: intent.operation === "recolor" ? "restyle" : intent.operation });
    candidateAnalysis = analysis.analysis;
    await diagnostics?.artifact("change-map.png", analysis.changeMapPng, "image/png");
  } catch {
    candidateAnalysis = { differenceThreshold: 12, changedPixels: 0, changedPixelRatio: 0, changedInsideSelectionPixels: 0, changedInsideSelectionRatio: 0,
      changedOutsideSelectionPixels: 0, changedOutsideSelectionRatio: 0, changedBoundaryPixels: 0, classification: "analysis-unavailable", warnings: ["candidate-analysis-failed"] };
  }
  await diagnostics?.artifact("candidate-analysis.json", new TextEncoder().encode(JSON.stringify(candidateAnalysis)), "application/json");
  await diagnostics?.event("candidate-analysis", "Measured candidate scope without changing preview pixels.", { classification: candidateAnalysis.classification });
  await diagnostics?.artifact("candidate-normalized.png", candidatePng, "image/png");
  const refinementPrompts = [...(input.parent?.conversation.refinementPrompts ?? []), ...(input.parent ? [input.prompt] : [])];
  const rootPrompt = input.parent?.conversation.edit?.prompt ?? input.prompt;
  const boundaryPolicy = intent.operation === "recolor" ? "protected" : input.boundaryPolicy;
  await diagnostics?.requestMetadata?.({ operation: "selection", boundaryPolicy, userPrompt: input.prompt, sourceDimensions: { width: input.width, height: input.height } });
  await diagnostics?.artifact("source-input.png", input.sourcePng, "image/png");
  await diagnostics?.artifact("selection-mask.png", input.selectionMaskPng, "image/png");
  await diagnostics?.metadata({ candidateAnalysis, previewSource: boundaryPolicy === "protected" ? "protected-composite" : "full-candidate" });
  const conversation: PreviewConversation = { automatic: true, provider, imageModel: model, languageModel: configuredImageConversationModel(), responseId, width: input.width, height: input.height,
    references, refinementPrompts, edit: { operation: intent.operation, prompt: rootPrompt, boundaryPolicy, sourceBase64: Buffer.from(input.sourcePng).toString("base64"),
      selectionMaskBase64: Buffer.from(input.selectionMaskPng).toString("base64"), providerMaskBase64: Buffer.from(providerMaskPng).toString("base64") } };
  const parameters = intent.operation === "recolor" ? { color: intent.color!, prompt: rootPrompt, diagnosticRequestId: input.requestId, automatic: true, canRefine: true, refinementPrompts,
    referenceNames: references.map(image => image.name) } : { prompt: rootPrompt, diagnosticRequestId: input.requestId, providerRequestId, boundaryPolicy, candidateAnalysis,
    automatic: true, canRefine: true, refinementPrompts, referenceNames: references.map(image => image.name) };
  return { conversation, response: { projectId: input.projectId, requestId: input.requestId, automatic: true, operation: intent.operation, method: intent.operation === "recolor" ? "local" as const : "generative" as const,
    parameters, color: intent.color, maskAlphaBase64: Buffer.from(mask.data).toString("base64"), references, referenceNames: references.map(image => image.name), candidateBase64: Buffer.from(candidatePng).toString("base64"),
    providerRequestId, candidateAnalysis, resolvedInstruction: input.prompt, canRefine: true, refinementPrompts, imageGenerationAttempted: intent.operation !== "recolor" },
    acceptance: { maskBase64: Buffer.from(mask.data).toString("base64"), maskWidth: input.width, maskHeight: input.height, width: input.width, height: input.height, parameters } };
}

export async function alphaPng(alpha: Uint8Array | Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let index = 0; index < alpha.length; index++) rgba[index * 4 + 3] = alpha[index];
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer());
}
