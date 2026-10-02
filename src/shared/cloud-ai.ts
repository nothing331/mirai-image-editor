import { z } from "zod";
import { assetCreationRequestSchema } from "./asset-generation";
import { extendPresets } from "./extend-presets";
import { transformPresets } from "./transform-presets";

export const aiUsageSchema = z.object({ unlimited: z.boolean().default(false), granted: z.number().int().nonnegative(), spent: z.number().int().nonnegative(), pending: z.number().int().nonnegative(), enabled: z.boolean() });
export type AiUsage = z.infer<typeof aiUsageSchema>;
export const cloudAiEditSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(), inputVersionId: z.uuid(),
  operation: z.enum(["remove", "replace", "restyle", "transform"]),
  boundaryPolicy: z.enum(["review", "protected"]), prompt: z.string().trim().max(2000),
  selectionMaskBase64: z.string().max(6_000_000).optional(),
  providerMaskBase64: z.string().max(6_000_000).optional(),
  presetId: z.enum(transformPresets.map((preset) => preset.id)).nullable().optional(),
  presetVersion: z.literal(1).nullable().optional(),
  preservationMode: z.enum(["faithful", "balanced", "imaginative"]).optional(),
}).strict();
export type CloudAiEdit = z.infer<typeof cloudAiEditSchema>;
export const cloudExtendSchema = z.object({
  requestId: z.uuid(), projectId: z.uuid(), inputVersionId: z.uuid(),
  presetId: z.enum(extendPresets.map((preset) => preset.id)), presetVersion: z.literal(1),
  strategy: z.enum(["smart", "preserve-all"]), userPrompt: z.string().trim().max(2000),
  plan: z.unknown().optional(),
}).strict();
export type CloudExtend = z.infer<typeof cloudExtendSchema>;
export const cloudCreationSchema = z.object({ requestId: z.uuid(), sessionId: z.uuid(), creation: assetCreationRequestSchema }).strict();
