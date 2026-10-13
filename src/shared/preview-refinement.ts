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

export function buildRefinementInstruction(prompt: string, referencePolicy: "original" | "current-turn" = "original"): string {
  const references = referencePolicy === "current-turn"
    ? "Only the REFERENCE images attached to this turn are active references. Their attachment order defines the current reference numbers, replacing earlier reference numbers. If none are attached, use the MAIN IMAGE and follow-up instruction without active references."
    : "Keep the original reference numbers and their roles.";
  return `Refine the supplied MAIN IMAGE, which is the latest preview the user is reviewing. Apply this follow-up change: ${prompt}\nKeep previous successful changes and all unrelated content, composition, subjects, and dimensions unless this follow-up explicitly changes them. Earlier images in the conversation are context, not the current edit target. ${references}`;
}
