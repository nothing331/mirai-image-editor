import { selectionIntentSchema, type SelectionIntent } from "@/shared/selection-intent";
import type { EditPlan } from "@/shared/edit-plan";
import type { ImageEditDiagnosticSink } from "@/shared/request-diagnostics";
import { buildPlannerInstruction, preparePlannerImages } from "./intent-planner";
import type { EditIntentPlanner, EditIntentPlannerRequest, EditIntentPlannerResult } from "./intent-planner";

/** Produces deterministic structured plans so the complete pipeline is testable without paid calls. */
export class FakeEditIntentPlanner implements EditIntentPlanner {
  async plan(request: EditIntentPlannerRequest, diagnostics?: ImageEditDiagnosticSink): Promise<EditIntentPlannerResult> {
    const instruction = buildPlannerInstruction();
    const images = await preparePlannerImages(request);
    const plan = fakePlan(request.prompt);
    const intent = request.automatic ? fakeSelectionIntent(request.prompt, Boolean(request.referenceImages?.length), plan) : undefined;
    const providerRequestId = `fake-planner-${crypto.randomUUID()}`;
    await diagnostics?.event("planner-preparation", "Prepared deterministic fake-planner inputs.");
    await diagnostics?.artifact("planner-context.png", images.contextPng, "image/png");
    await diagnostics?.artifact("planner-selection-detail.png", images.detailPng, "image/png");
    await diagnostics?.metadata({ plannerInstruction: instruction, editPlan: plan, configuration: { plannerModel: "fake-intent-planner" } });
    await diagnostics?.beginProviderCall("intent-planner", "fake", "fake-intent-planner");
    await diagnostics?.event("planner-call", "Calling the deterministic fake edit-intent planner.");
    await diagnostics?.artifact("edit-plan.json", jsonBytes(plan), "application/json");
    await diagnostics?.artifact("planner-response.json", jsonBytes({ providerRequestId, plan }), "application/json");
    await diagnostics?.completeProviderCall("intent-planner", providerRequestId);
    await diagnostics?.event("planner-response", "Validated the deterministic fake edit plan.", {
      representation: plan.representation,
      confidence: plan.confidence,
    });
    return { plan, providerRequestId, intent };
  }
}

function fakePlan(prompt: string): EditPlan {
  const surfaceGraphic = /\b(flag|logo|badge|emblem|decal|marking|text|symbol)\b/i.test(prompt);
  return surfaceGraphic ? {
    target: "the existing selected surface",
    representation: "surface_graphic",
    integration: "Apply the requested graphic flush to the selected surface, following its perspective, curvature, lighting, texture, and occlusion.",
    constraints: ["keep the graphic entirely inside the selected surface", "preserve the underlying object's geometry"],
    exclusions: ["flagpole", "cloth", "freestanding sign", "invented support structure"],
    confidence: "high",
    rationale: "The requested content is conventionally represented as a surface graphic when placed on an existing object.",
  } : {
    target: "the selected scene region",
    representation: "scene_content",
    integration: "Integrate the requested content naturally into the selected region using the surrounding scene as physical context.",
    constraints: ["match the scene perspective, scale, lighting, and occlusion"],
    exclusions: ["unrequested supports", "unrelated objects"],
    confidence: "medium",
    rationale: "The short instruction does not identify a more specific physical representation.",
  };
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

/** Test-only vocabulary; real routing always uses the visual model's validated result. */
function fakeSelectionIntent(prompt: string, references: boolean, plan: EditPlan): SelectionIntent {
  const named: Record<string, string> = { red: "#ff0000", blue: "#0000ff", green: "#008000", black: "#000000", white: "#ffffff", yellow: "#ffff00" };
  const color = prompt.match(/#[0-9a-f]{6}\b/i)?.[0] ?? named[prompt.match(/\b(red|blue|green|black|white|yellow)\b/i)?.[0].toLowerCase() ?? ""];
  const operation = /\b(remove|erase|delete)\b/i.test(prompt) ? "remove" : /\b(replace|add|insert|put)\b/i.test(prompt) ? "replace" : color && !references && !/\b(material|pattern|wood|quilt|texture|only|stripe)\b/i.test(prompt) ? "recolor" : "restyle";
  return selectionIntentSchema.parse({ operation, color: operation === "recolor" ? color : null, plan });
}
