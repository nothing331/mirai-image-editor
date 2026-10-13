import sharp from "sharp";
import type { AssetGenerationResponse } from "@/shared/asset-generation";
import { buildRefinementInstruction, type PreviewRefinement } from "@/shared/preview-refinement";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import { prepareReferenceImages } from "@/server/ai/reference-images";
import { assertConversationProvider, PreviewConversationError, type PreviewConversation } from "@/server/ai/preview-conversation";
import { assetGenerationCapabilities, createAssetGenerator } from "./provider-factory";
import type { AssetGeneratorRequest, AssetGeneratorResult } from "./contracts";

export async function refineCreationPreview(parent: { response: Record<string, unknown>; conversation?: PreviewConversation }, refinement: PreviewRefinement,
  scope: { projectId: string; requestId: string }, diagnostics?: ImageEditDiagnosticSink,
  generate: (request: AssetGeneratorRequest) => Promise<AssetGeneratorResult> = (request) => createAssetGenerator().generate(request, diagnostics)) {
  const conversation = parent.conversation;
  const capabilities = assetGenerationCapabilities();
  if (!conversation?.creation || !Array.isArray(parent.response.candidates)) throw new PreviewConversationError("This result does not support refinement. Create a new image first.");
  assertConversationProvider(conversation, capabilities.provider, capabilities.model);
  const prior = parent.response as unknown as AssetGenerationResponse;
  const target = Buffer.from(prior.candidates[0].candidateBase64, "base64");
  const prompt = buildRefinementInstruction(refinement.prompt);
  const result = await generate({ mode: "image", prompt, inputImagePng: target, previousResponseId: conversation.responseId ?? undefined,
    referenceImages: await prepareReferenceImages(conversation.references), refinementPrompt: refinement.prompt,
    count: 1, width: conversation.width, height: conversation.height, quality: "low", matteColor: null, colors: [] });
  if (result.candidates.length !== 1) throw new PreviewConversationError("The image provider returned an invalid refinement.");
  const png = result.candidates[0].png;
  const metadata = await sharp(png, { limitInputPixels: 4_194_304 }).metadata();
  if (metadata.format !== "png" || metadata.width !== conversation.width || metadata.height !== conversation.height) throw new PreviewConversationError("The refinement did not preserve the image dimensions. Your previous preview is still available.");
  const refinementPrompts = [...conversation.refinementPrompts, refinement.prompt];
  const response: AssetGenerationResponse = { ...prior, ...scope, creation: conversation.creation, providerRequestId: result.providerRequestId,
    prompt, width: conversation.width, height: conversation.height, canRefine: true, refinementPrompts, candidates: [{ id: scope.requestId, candidateBase64: Buffer.from(png).toString("base64"), width: conversation.width, height: conversation.height }],
    warnings: [], imageGenerationAttempted: true };
  return { response, conversation: { ...conversation, responseId: result.conversationResponseId ?? null, refinementPrompts } };
}
