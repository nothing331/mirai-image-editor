import { z } from "zod";

export const previewRefinementSchema = z.object({
  parentRequestId: z.uuid(),
  prompt: z.string().trim().min(1, "Describe how to refine the preview.").max(2000, "Keep the refinement under 2,000 characters."),
}).strict();
export type PreviewRefinement = z.infer<typeof previewRefinementSchema>;

export interface PreviewRefinementMetadata {
  canRefine?: boolean;
  refinementPrompts?: string[];
}

export function buildRefinementInstruction(prompt: string): string {
  return `Refine the supplied MAIN IMAGE, which is the latest preview the user is reviewing. Apply this follow-up change: ${prompt}\nKeep previous successful changes and all unrelated content, composition, subjects, and dimensions unless this follow-up explicitly changes them. Earlier images in the conversation are context, not the current edit target. Keep the original reference numbers and their roles.`;
}
