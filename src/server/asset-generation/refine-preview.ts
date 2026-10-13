import sharp from "sharp";
import type { AssetGenerationResponse } from "@/shared/asset-generation";
import { buildRefinementInstruction, type PreviewRefinement } from "@/shared/preview-refinement";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import { prepareReferenceImages } from "@/server/ai/reference-images";
import { referenceImageInstruction, type ReferenceImage } from "@/shared/reference-images";
import { assertConversationProvider, PreviewConversationError, type PreviewConversation } from "@/server/ai/preview-conversation";
import { assetGenerationCapabilities, createAssetGenerator } from "./provider-factory";
import type { AssetGeneratorRequest, AssetGeneratorResult } from "./contracts";

export async function refineCreationPreview(parent: { response: Record<string, unknown>; conversation?: PreviewConversation }, refinement: PreviewRefinement,
  scope: { projectId: string; requestId: string }, diagnostics?: ImageEditDiagnosticSink,
  generate: (request: AssetGeneratorRequest) => Promise<AssetGeneratorResult> = (request) => createAssetGenerator().generate(request, diagnostics),
  nextReferences?: ReferenceImage[]) {
  const conversation = parent.conversation;
  const capabilities = assetGenerationCapabilities();
  if (!conversation?.creation || !Array.isArray(parent.response.candidates)) throw new PreviewConversationError("This result does not support refinement. Create a new image first.");
  assertConversationProvider(conversation, capabilities.provider, capabilities.model);
  const prior = parent.response as unknown as AssetGenerationResponse;
  const target = Buffer.from(prior.candidates[0].candidateBase64, "base64");
  const references = nextReferences ?? conversation.references;
  const referenceImages = await prepareReferenceImages(references);
  const prompt = [buildRefinementInstruction(refinement.prompt, nextReferences === undefined ? "original" : "current-turn"), referenceImageInstruction(references.length)].filter(Boolean).join("\n\n");
  for (const [index, reference] of referenceImages.entries()) await diagnostics?.artifact(`reference-${index + 1}.png` as import("@/shared/request-diagnostics").DiagnosticArtifactName, reference, "image/png");
  const result = await generate({ mode: "image", prompt, inputImagePng: target, previousResponseId: conversation.responseId ?? undefined,
    referenceImages, refinementPrompt: refinement.prompt,
    count: 1, width: conversation.width, height: conversation.height, quality: "low", matteColor: null, colors: [] });
  if (result.candidates.length !== 1) throw new PreviewConversationError("The image provider returned an invalid refinement.");
  const png = result.candidates[0].png;
  const metadata = await sharp(png, { limitInputPixels: 4_194_304 }).metadata();
  if (metadata.format !== "png" || metadata.width !== conversation.width || metadata.height !== conversation.height) throw new PreviewConversationError("The refinement did not preserve the image dimensions. Your previous preview is still available.");
  const refinementPrompts = [...conversation.refinementPrompts, refinement.prompt];
  const creation = { ...conversation.creation, references };
  const response: AssetGenerationResponse = { ...prior, ...scope, creation, providerRequestId: result.providerRequestId,
    prompt, width: conversation.width, height: conversation.height, canRefine: true, refinementPrompts, candidates: [{ id: scope.requestId, candidateBase64: Buffer.from(png).toString("base64"), width: conversation.width, height: conversation.height }],
    warnings: [], imageGenerationAttempted: true };
  return { response, conversation: { ...conversation, creation, references, responseId: result.conversationResponseId ?? null, refinementPrompts } };
}
