import sharp from "sharp";
import type { PreviewRefinement } from "@/shared/preview-refinement";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import { prepareReferenceImages } from "./reference-images";
import { analyzeCandidate } from "./candidate-analysis";
import { configuredProviderName, createImageEditProvider } from "./provider-factory";
import { assertConversationProvider, PreviewConversationError, visibleEditPreview, type PreviewConversation } from "./preview-conversation";
import type { ImageEditRequest, ProviderCandidate, ProviderScenario } from "./contracts";

export async function refineSelectionPreview(parent: { response: Record<string, unknown>; conversation?: PreviewConversation }, refinement: PreviewRefinement,
  scope: { projectId: string; requestId: string }, diagnostics?: ImageEditDiagnosticSink, scenario?: ProviderScenario,
  generate: (request: ImageEditRequest) => Promise<ProviderCandidate> = (request) => createImageEditProvider().edit(request, diagnostics)) {
  const conversation = parent.conversation;
  if (!conversation?.edit || conversation.edit.operation === "recolor" || typeof parent.response.candidateBase64 !== "string") throw new PreviewConversationError("This preview does not support refinement. Generate a new Replace or Restyle preview first.");
  const provider = configuredProviderName();
  const model = provider === "openai" ? process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2" : "fake-image-editor";
  assertConversationProvider(conversation, provider, model);
  const edit = conversation.edit;
  if (edit.operation === "recolor") throw new PreviewConversationError("A recolor refinement needs prompt interpretation.");
  const candidate = Buffer.from(parent.response.candidateBase64, "base64");
  await diagnostics?.requestMetadata?.({ operation: conversation.automatic ? "selection" : edit.operation, boundaryPolicy: edit.boundaryPolicy, userPrompt: refinement.prompt,
    sourceDimensions: { width: conversation.width, height: conversation.height } });
  await diagnostics?.artifact("source-input.png", Buffer.from(edit.sourceBase64, "base64"), "image/png");
  await diagnostics?.artifact("selection-mask.png", Buffer.from(edit.selectionMaskBase64, "base64"), "image/png");
  const mainImage = await visibleEditPreview(candidate, edit, conversation.width, conversation.height);
  const providerMask = Buffer.from(edit.providerMaskBase64, "base64");
  const result = await generate({ imagePng: mainImage, referenceImages: await prepareReferenceImages(conversation.references), maskPng: providerMask,
    width: conversation.width, height: conversation.height, operation: edit.operation, boundaryPolicy: edit.boundaryPolicy,
    prompt: refinement.prompt, refinementPrompt: refinement.prompt, previousResponseId: conversation.responseId ?? undefined, conversational: true, scenario });
  const metadata = await sharp(result.candidatePng, { limitInputPixels: 4_194_304 }).metadata();
  if (metadata.format !== "png" || metadata.width !== conversation.width || metadata.height !== conversation.height) throw new PreviewConversationError("The refinement did not preserve the image dimensions. Your previous preview is still available.");
  let candidateAnalysis: import("@/shared/edit-boundary").CandidateAnalysis;
  try { candidateAnalysis = (await analyzeCandidate({ sourcePng: Buffer.from(edit.sourceBase64, "base64"), candidatePng: result.candidatePng,
    selectionMaskPng: Buffer.from(edit.selectionMaskBase64, "base64"), width: conversation.width, height: conversation.height,
    operation: edit.operation })).analysis; }
  catch { candidateAnalysis = { differenceThreshold: 12, changedPixels: 0, changedPixelRatio: 0, changedInsideSelectionPixels: 0, changedInsideSelectionRatio: 0, changedOutsideSelectionPixels: 0, changedOutsideSelectionRatio: 0, changedBoundaryPixels: 0, classification: "analysis-unavailable", warnings: ["candidate-analysis-failed"] }; }
  await diagnostics?.metadata({ candidateAnalysis, previewSource: edit.boundaryPolicy === "protected" ? "protected-composite" : "full-candidate" });
  const refinementPrompts = [...conversation.refinementPrompts, refinement.prompt];
  const maskPixels = await sharp(providerMask).ensureAlpha().raw().toBuffer();
  const alpha = Buffer.alloc(conversation.width * conversation.height);
  for (let index = 0; index < alpha.length; index++) alpha[index] = maskPixels[index * 4 + 3];
  return { response: { ...scope, automatic: conversation.automatic, operation: edit.operation, method: "generative" as const, maskAlphaBase64: alpha.toString("base64"), references: conversation.references, referenceNames: conversation.references.map(image => image.name), candidateBase64: Buffer.from(result.candidatePng).toString("base64"), providerRequestId: result.providerRequestId,
    candidateAnalysis, resolvedInstruction: refinement.prompt, canRefine: true, refinementPrompts, imageGenerationAttempted: true },
    conversation: { ...conversation, responseId: result.conversationResponseId ?? null, refinementPrompts } };
}
