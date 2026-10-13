import { configuredImageConversationModel, generateConversationImage } from "@/server/ai/openai-image-conversation";
import { ImageProviderError } from "@/server/ai/contracts";
import OpenAI from "openai";
import type { ImageEditDiagnosticSink, RequestDiagnosticError } from "@/shared/request-diagnostics";
import type { AssetGenerator, AssetGeneratorRequest, AssetGeneratorResult } from "./contracts";
import { AssetGenerationProviderError } from "./contracts";

/** Keeps OpenAI generation endpoints and credentials behind the app-owned asset generator contract. */
export class OpenAIAssetGenerator implements AssetGenerator {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly model = "gpt-image-2") {
    this.client = new OpenAI({ apiKey, maxRetries: 0, timeout: 60_000 });
  }

  async generate(request: AssetGeneratorRequest, diagnostics?: ImageEditDiagnosticSink): Promise<AssetGeneratorResult> {
    let providerCompleted = false;
    try {
      await diagnostics?.beginProviderCall("asset-generator", "openai", this.model);
      await diagnostics?.event("provider-call", "Calling the OpenAI image generation provider.", { candidateCount: request.count });
      if (request.mode === "image") {
        await diagnostics?.metadata({ providerInstruction: request.prompt, configuration: { transport: "responses", conversationModel: configuredImageConversationModel(), imageModel: this.model, quality: request.quality, maxOutputTokens: 4096, maxToolCalls: 1 } });
        if (request.inputImagePng) await diagnostics?.artifact("provider-input.png", request.inputImagePng, "image/png");
        const result = await generateConversationImage(this.client, { prompt: request.prompt, imageModel: this.model, quality: request.quality, size: `${request.width}x${request.height}`, mainImage: request.inputImagePng, references: request.referenceImages, previousResponseId: request.previousResponseId });
        providerCompleted = true;
        await diagnostics?.artifact("provider-response.json", new TextEncoder().encode(JSON.stringify({ providerRequestId: result.providerRequestId, responseId: result.conversationResponseId, usage: result.usage })), "application/json");
        await diagnostics?.completeProviderCall("asset-generator", result.providerRequestId, flattenUsage(result.usage));
        return { ...result, candidates: [{ ordinal: 0, png: result.candidatePng }] };
      }
      const size = `${request.width}x${request.height}` as OpenAI.Images.ImageGenerateParams["size"];
      const options = {
        model: this.model,
        prompt: request.prompt,
        n: 1 as const,
        size,
        quality: request.quality,
        output_format: "png" as const,
      };
      const call = this.client.images.generate(options);
      const { data: response, request_id: providerRequestId } = await call.withResponse();
      providerCompleted = true;
      const candidates = (response.data ?? []).flatMap((candidate, ordinal) => candidate.b64_json
        ? [{ ordinal, png: new Uint8Array(Buffer.from(candidate.b64_json, "base64")) }]
        : []);
      if (candidates.length !== request.count) {
        throw new AssetGenerationProviderError(`OpenAI returned ${candidates.length} of ${request.count} requested candidates.`, true, { providerRequestId });
      }
      await diagnostics?.artifact("provider-response.json", new TextEncoder().encode(JSON.stringify({
        providerRequestId,
        created: response.created,
        usage: response.usage,
        quality: response.quality,
        size: response.size,
        candidateCount: candidates.length,
      }, null, 2)), "application/json");
      await diagnostics?.completeProviderCall("asset-generator", providerRequestId, flattenUsage(response.usage));
      return { usage: response.usage, candidates, providerRequestId: providerRequestId ?? `openai-unreported-${crypto.randomUUID()}` };
    } catch (error) {
      const providerError = error instanceof AssetGenerationProviderError ? error : error instanceof ImageProviderError ? new AssetGenerationProviderError(error.message, error.retryable, error.diagnostics) : new AssetGenerationProviderError(
        error instanceof Error ? error.message : "OpenAI asset generation failed.",
        isRetryableStatus(error instanceof OpenAI.APIError ? error.status : undefined),
        error instanceof OpenAI.APIError ? {
          providerRequestId: error.requestID,
          status: error.status,
          code: error.code ?? undefined,
          type: error.type,
        } : undefined,
      );
      await diagnostics?.failProviderCall("asset-generator", toDiagnosticError(providerError), providerError.retryable, providerError.diagnostics?.providerRequestId);
      if (providerCompleted) Object.assign(providerError, { diagnostics: { ...providerError.diagnostics, providerCompleted: true } });
      throw providerError;
    }
  }
}

function flattenUsage(usage: unknown): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  if (!usage || typeof usage !== "object") return result;
  for (const [key, value] of Object.entries(usage)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") result[key] = value;
  }
  return result;
}

function isRetryableStatus(status: number | undefined): boolean {
  return status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
}

function toDiagnosticError(error: AssetGenerationProviderError): RequestDiagnosticError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    providerStatus: error.diagnostics?.status,
    providerCode: error.diagnostics?.code,
    providerType: error.diagnostics?.type,
  };
}
