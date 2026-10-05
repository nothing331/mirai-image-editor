"use client";

import { Check, CornerDownLeft, X } from "lucide-react";
import { useEffect } from "react";

export function PendingLocalEditDialog({ editName, saveDisabled, onSave, onDiscard, onStay }: {
  editName: string;
  saveDisabled: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onStay: () => void;
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onStay();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onStay]);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onStay(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="pending-edit-title" aria-describedby="pending-edit-description" className="editor-dialog w-full max-w-sm overflow-hidden rounded-xl bg-paper shadow-2xl ring-1 ring-ink/20">
        <div className="border-b border-line px-5 py-4">
          <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted">Unsaved direct edit</span>
          <h2 id="pending-edit-title" className="mt-1 text-lg font-bold tracking-[-.035em]">Save your {editName}?</h2>
          <p id="pending-edit-description" className="mt-2 text-xs leading-relaxed text-muted">The change is visible on the canvas but is not in image history yet. Save it before switching tools, or discard it.</p>
        </div>
        <div className="grid gap-2 p-3 sm:grid-cols-2">
          <button type="button" data-testid="save-local-edit" autoFocus disabled={saveDisabled} className="flex h-10 items-center justify-center gap-2 bg-acid px-3 text-xs font-bold text-ink outline-none hover:bg-ink hover:text-acid focus-visible:ring-2 focus-visible:ring-ink/30 disabled:pointer-events-none disabled:opacity-35" onClick={onSave}><Check className="size-4" />Save edit</button>
          <button type="button" data-testid="discard-local-edit" className="flex h-10 items-center justify-center gap-2 bg-surface px-3 text-xs font-bold text-ink outline-none hover:bg-[#ffd5cc] focus-visible:ring-2 focus-visible:ring-ink/30" onClick={onDiscard}><X className="size-4" />Discard changes</button>
          <button type="button" className="flex h-9 items-center justify-center gap-2 font-mono text-[11px] uppercase text-muted outline-none hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 sm:col-span-2" onClick={onStay}><CornerDownLeft className="size-3.5" />Keep editing</button>
        </div>
      </section>
    </div>
  );
}
