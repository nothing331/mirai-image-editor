import { configuredImageConversationModel } from "./openai-image-conversation";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { AssetCreationRequest } from "@/shared/asset-generation";
import type { EditBoundaryPolicy } from "@/shared/edit-boundary";
import type { ReferenceImage } from "@/shared/reference-images";

export interface PreviewConversation {
  responseId: string | null;
  automatic?: boolean;
  provider: "fake" | "openai";
  imageModel: string;
  languageModel: string;
  width: number;
  height: number;
  references: ReferenceImage[];
  refinementPrompts: string[];
  creation?: Extract<AssetCreationRequest, { mode: "image" }>;
  edit?: {
    operation: "recolor" | "remove" | "replace" | "restyle";
    boundaryPolicy: EditBoundaryPolicy;
    prompt: string;
    sourceBase64: string;
    selectionMaskBase64: string;
    providerMaskBase64: string;
  };
}

export class PreviewConversationError extends Error {}
interface LocalPreviewRecord { scope: string; expiresAt: number; conversation: PreviewConversation; response: Record<string, unknown> }
const lifetimeMs = 24 * 60 * 60 * 1000;

function localDirectory() { return process.env.MIRAI_LOCAL_CONVERSATION_DIR ?? path.join(process.cwd(), ".local-edit", "conversations"); }
function recordPath(scope: string, requestId: string) { return path.join(localDirectory(), `${createHash("sha256").update(`${scope}\n${requestId}`).digest("hex")}.json`); }

/** Private local recovery; cloud conversations live in the existing owner-scoped temporary result. */
export async function saveLocalPreview(scope: string, requestId: string, conversation: PreviewConversation, response: object) {
  const directory = localDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = recordPath(scope, requestId);
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  const encoded = JSON.stringify({ scope, expiresAt: Date.now() + lifetimeMs, conversation, response });
  if (Buffer.byteLength(encoded) > 41_943_040) throw new PreviewConversationError("This preview is too large to retain for refinement.");
  await writeFile(temporary, encoded, { mode: 0o600 });
  await rename(temporary, filename);
  // Retain recent standalone snapshots; each contains its original intent and input pixels.
  const records = await Promise.all((await readdir(/* turbopackIgnore: true */ directory)).filter((name) => name.endsWith(".json")).map(async (name) => {
    try { const record = JSON.parse(await readFile(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ directory, name), "utf8")) as LocalPreviewRecord; return { name, expiresAt: record.expiresAt }; }
    catch { return { name, expiresAt: 0 }; }
  }));
  records.sort((a, b) => b.expiresAt - a.expiresAt);
  await Promise.all(records.filter((record, index) => record.expiresAt <= Date.now() || index >= 10).map((record) => unlink(/* turbopackIgnore: true */ path.join(/* turbopackIgnore: true */ directory, record.name)).catch(() => {})));
}

export async function readLocalPreview(scope: string, requestId: string): Promise<LocalPreviewRecord> {
  try {
    const record = JSON.parse(await readFile(/* turbopackIgnore: true */ recordPath(scope, requestId), "utf8")) as LocalPreviewRecord;
    if (record.scope !== scope || record.expiresAt <= Date.now() || !record.conversation) throw new Error("Unavailable.");
    return record;
  } catch { throw new PreviewConversationError("This preview's refinement context is unavailable or expired. Generate a new preview to start another conversation."); }
}

export function assertConversationProvider(conversation: PreviewConversation, provider: "fake" | "openai", imageModel: string) {
  if (conversation.provider !== provider || conversation.imageModel !== imageModel || conversation.languageModel !== configuredImageConversationModel() || provider === "openai" && conversation.edit?.operation !== "recolor" && !conversation.responseId) {
    throw new PreviewConversationError("The AI configuration changed or this preview has no conversation context. Generate a new preview before refining.");
  }
}

/** Mirrors browser protected compositing so the next target is exactly the image the user reviewed. */
export async function visibleEditPreview(candidate: Uint8Array, edit: NonNullable<PreviewConversation["edit"]>, width: number, height: number): Promise<Uint8Array> {
  if (edit.boundaryPolicy === "review" || edit.operation === "recolor") return candidate;
  const source = await sharp(Buffer.from(edit.sourceBase64, "base64")).ensureAlpha().raw().toBuffer();
  const proposal = await sharp(candidate).ensureAlpha().raw().toBuffer();
  const mask = await sharp(Buffer.from(edit.providerMaskBase64, "base64")).ensureAlpha().raw().toBuffer();
  if ([source.length, proposal.length, mask.length].some((length) => length !== width * height * 4)) throw new PreviewConversationError("The preview no longer matches its original image dimensions.");
  const result = Buffer.from(source);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const amount = mask[pixel * 4 + 3] / 255;
    for (let channel = 0; channel < 4; channel++) result[pixel * 4 + channel] = Math.round(proposal[pixel * 4 + channel] * amount + source[pixel * 4 + channel] * (1 - amount));
  }
  return new Uint8Array(await sharp(result, { raw: { width, height, channels: 4 } }).png().toBuffer());
}
