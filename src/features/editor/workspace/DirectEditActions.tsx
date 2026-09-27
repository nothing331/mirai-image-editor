"use client";

import { Check, X } from "lucide-react";
import { getCurrentVersion, useEditorStore } from "../store";
import type { LocalEditDraft } from "../types";

const editNames: Record<LocalEditDraft["type"], string> = {
  crop: "crop", resize: "resize", rotate: "rotation", flip: "flip", text: "text", watermark: "watermark",
};

export function DirectEditActions({ draft }: { draft: LocalEditDraft }) {
  const version = useEditorStore(getCurrentVersion);
  const pendingAcceptance = useEditorStore((state) => state.pendingAcceptance);
  const applyLocalDraft = useEditorStore((state) => state.applyLocalDraft);
  const discardLocalDraft = useEditorStore((state) => state.discardLocalDraft);
  const canSave = Boolean(version && draft.inputVersionId === version.id && changesOutput(draft, version)
    && (draft.type !== "text" || draft.parameters.content.trim().length > 0)
    && (draft.type !== "watermark" || (draft.parameters.source === "text"
      ? draft.parameters.content.trim().length > 0 : Boolean(draft.parameters.overlayAssetId))));
  const name = editNames[draft.type];

  return <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-line bg-paper p-3">
    <button type="button" data-testid="save-direct-edit" className="flex h-10 items-center justify-center gap-2 bg-acid px-3 text-xs font-bold text-ink outline-none hover:bg-ink hover:text-acid focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-35" disabled={!canSave || Boolean(pendingAcceptance)} onClick={applyLocalDraft}><Check className="size-4" />Save {name}</button>
    <button type="button" data-testid="discard-direct-edit" className="flex h-10 items-center justify-center gap-1 px-2 font-mono text-[9px] uppercase text-muted outline-none hover:bg-[#e8e5dc] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-35" disabled={Boolean(pendingAcceptance)} onClick={discardLocalDraft}><X className="size-3.5" />Discard</button>
  </div>;
}

function changesOutput(draft: LocalEditDraft, version: { width: number; height: number }) {
  if (draft.type === "crop") {
    const { x, y, width, height } = draft.parameters.sourceRect;
    return x !== 0 || y !== 0 || width !== version.width || height !== version.height;
  }
  if (draft.type === "resize") return draft.parameters.width !== version.width || draft.parameters.height !== version.height;
  return true;
}
