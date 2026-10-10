"use client";

import { Check, LoaderCircle } from "lucide-react";
import { useEffect } from "react";

export function CloudPendingWorkDialog({ destination, actionTarget, deviceDraft, blocked, retry, replacesRedo, busy, error, onSave, onStay }: {
  destination: string;
  actionTarget: string;
  deviceDraft: boolean;
  blocked: boolean;
  retry: boolean;
  replacesRedo: boolean;
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onStay: () => void;
}) {
  useEffect(() => {
    const stayOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || busy) return;
      event.preventDefault();
      onStay();
    };
    window.addEventListener("keydown", stayOnEscape);
    return () => window.removeEventListener("keydown", stayOnEscape);
  }, [busy, onStay]);

  const title = blocked ? "Finish this edit first" : retry ? "Finish saving your edit" : deviceDraft ? "Keep your unfinished work" : "Save your edit first";
  const description = blocked
    ? `This work cannot be saved as an image edit yet. Keep editing before you ${destination}.`
    : retry
      ? `Your edit has not been confirmed by the cloud. Retry the save before you ${destination}.`
      : deviceDraft
        ? `This work is not an accepted image edit yet. Keep it as a draft on this device before you ${destination}. It will be offered when you reopen this saved version.`
        : `Your change is visible on the canvas but is not saved to the cloud. Save it before you ${destination}.`;
  const action = `${retry ? "Retry save" : deviceDraft ? "Keep draft" : "Save edit"} and ${actionTarget}`;

  return <div className="fixed inset-0 z-[100] grid place-items-center bg-ink/60 p-4" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onStay(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="cloud-pending-title" aria-describedby="cloud-pending-description" className="editor-dialog w-full max-w-md rounded-xl border border-line bg-paper shadow-2xl">
      <div className="border-b border-line px-5 py-4">
        <span className="font-mono text-[9px] uppercase tracking-[.14em] text-muted">Unfinished work</span>
        <h2 id="cloud-pending-title" className="mt-1 text-lg font-bold tracking-[-.035em]">{title}</h2>
        <p id="cloud-pending-description" className="mt-2 text-xs leading-5 text-muted">{description}</p>
        {replacesRedo && !deviceDraft && !blocked && <p className="mt-3 border-l-2 border-accent bg-[#ffd5cc] p-3 text-xs leading-5 text-[#8f1d10]">Saving this edit will replace the redo versions after your current image.</p>}
      </div>
      {error && <p role="alert" className="mx-5 mt-4 border-l-2 border-accent bg-[#ffd5cc] p-3 text-xs leading-5 text-[#8f1d10]">{error}</p>}
      <div className="grid gap-2 p-4 sm:grid-cols-[1fr_auto]">
        {!blocked && <button type="button" data-testid="save-and-continue" autoFocus disabled={busy} className="flex min-h-11 items-center justify-center gap-2 bg-acid px-4 text-xs font-bold text-ink outline-none hover:bg-ink hover:text-acid focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-50" onClick={onSave}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{busy ? "Saving…" : action}
        </button>}
        <button type="button" autoFocus={blocked} disabled={busy} className="min-h-11 px-4 text-xs font-bold text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50" onClick={onStay}>Keep editing</button>
      </div>
    </section>
  </div>;
}
