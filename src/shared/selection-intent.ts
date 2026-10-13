import { z } from "zod";
import { editPlanSchema } from "./edit-plan";

export const selectionOperations = ["recolor", "remove", "replace", "restyle"] as const;
export type SelectionOperation = typeof selectionOperations[number];

/** A simple recolor is valid only when the model supplies one concrete target color. */
export const selectionIntentSchema = z.object({
  operation: z.enum(selectionOperations),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
  plan: editPlanSchema,
}).strict().superRefine((intent, context) => {
  if ((intent.operation === "recolor") !== (intent.color !== null)) {
    context.addIssue({ code: "custom", message: "Only a simple recolor may specify a target color." });
  }
});
export type SelectionIntent = z.infer<typeof selectionIntentSchema>;
