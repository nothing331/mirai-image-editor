"use client";

import Link from "next/link";
import { Download, History, LoaderCircle, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { exportVersion } from "@/features/editor/image-data";
import { getCurrentVersion, useEditorStore } from "@/features/editor/store";
import { CanvasFrame } from "@/features/editor/workspace/CanvasFrame";
import { EditorInspector } from "@/features/editor/workspace/EditorInspector";
import { ToolRail } from "@/features/editor/workspace/ToolRail";
import type { WorkspaceWorkflow } from "@/features/editor/workspace/workspace-types";
import { deriveWorkspacePhase } from "@/features/editor/workspace/workspace-phase";
import type { GeometryEditType } from "@/features/editor/types";
import { cn } from "@/lib/utils";
import { loadCloudHistory, loadCloudVersion, saveCloudEdit, selectCloudVersion, type CloudVersionSummary } from "./cloud-edit-client";

export function CloudEditorWorkspace({ projectId, projectName, originalVersionId, initialCurrentVersionId, initialHeadVersionId }: {
  projectId: string; projectName: string; originalVersionId: string;
  initialCurrentVersionId: string; initialHeadVersionId: string;
}) {
  const editor = useEditorStore(useShallow((state) => ({
    currentVersionId: state.currentVersionId,
    currentVersion: getCurrentVersion(state),
    pendingAcceptance: state.pendingAcceptance,
    preview: state.preview, localDraft: state.localDraft, localDraftDirty: state.localDraftDirty,
    paintSession: state.paintSession, selectionMask: state.selectionMask,
    generativeState: state.generativeState, error: state.error,
    loadCloudProject: state.loadCloudProject, setCloudCurrentVersion: state.setCloudCurrentVersion,
    confirmPendingAcceptance: state.confirmPendingAcceptance, discardPendingAcceptance: state.discardPendingAcceptance,
    discardLocalDraft: state.discardLocalDraft, discardPreview: state.discardPreview,
    discardPaintSession: state.discardPaintSession, beginLocalDraft: state.beginLocalDraft,
    setTool: state.setTool, setError: state.setError, createPreview: state.createPreview,
    requestTransformPreview: state.requestTransformPreview,
  })));
  const [status, setStatus] = useState<"loading" | "saved" | "saving" | "failed">("loading");
  const [currentSummary, setCurrentSummary] = useState<CloudVersionSummary | null>(null);
  const [headVersionId, setHeadVersionId] = useState(initialHeadVersionId);
  const [history, setHistory] = useState<CloudVersionSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [workflow, setWorkflow] = useState<WorkspaceWorkflow>({ kind: "canvas", tool: "lasso" });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const loadCloudProject = editor.loadCloudProject;
  const setEditorError = editor.setError;
  const attempted = useRef(new Set<string>());
  const saveKeys = useRef(new Map<string, { requestKey: string; assetId: string }>());
  const phase = deriveWorkspacePhase({ hasImage: Boolean(editor.currentVersionId), preview: editor.preview,
    generativeState: editor.generativeState, selectionMask: editor.selectionMask });

  const refreshHistory = useCallback(async () => {
    const page = await loadCloudHistory(projectId);
    setHistory(page.versions);
    setNextCursor(page.nextCursor);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const original = await loadCloudVersion(projectId, originalVersionId);
        const current = initialCurrentVersionId === originalVersionId
          ? original : await loadCloudVersion(projectId, initialCurrentVersionId);
        const page = await loadCloudHistory(projectId);
        if (cancelled) return;
        loadCloudProject({ id: projectId, name: projectName, original: original.image, current: current.image });
        setCurrentSummary(current.summary);
        setHistory(page.versions);
        setNextCursor(page.nextCursor);
        setStatus("saved");
      } catch (error) {
        if (!cancelled) { setStatus("failed"); setEditorError(error instanceof Error ? error.message : "The project could not be opened."); }
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, projectName, originalVersionId, initialCurrentVersionId, loadCloudProject, setEditorError]);

  const attemptSave = useCallback(async () => {
    const pending = useEditorStore.getState().pendingAcceptance;
    if (!pending || status === "saving") return;
    const operationId = pending.operation.id;
    const replaceFuture = pending.input.id !== headVersionId;
    if (replaceFuture && !window.confirm("This new edit will replace the redo versions after the current image. Continue?")) {
      setStatus("failed");
      editor.setError("The pending edit is still available. Save it to replace redo history, or discard it.");
      return;
    }
    let keys = saveKeys.current.get(operationId);
    if (!keys) {
      keys = { requestKey: crypto.randomUUID(), assetId: crypto.randomUUID() };
      saveKeys.current.set(operationId, keys);
    }
    setStatus("saving");
    editor.setError(null);
    try {
      const { receipt } = await saveCloudEdit(projectId, pending, keys, replaceFuture);
      if (useEditorStore.getState().pendingAcceptance?.operation.id !== operationId) return;
      if (receipt.output_version_id !== pending.output.id) throw new Error("Save receipt refers to another image version.");
      editor.confirmPendingAcceptance();
      saveKeys.current.delete(operationId);
      setHeadVersionId(receipt.output_version_id);
      setStatus("saved");
      try {
        const loaded = await loadCloudVersion(projectId, receipt.output_version_id);
        setCurrentSummary(loaded.summary);
        await refreshHistory();
      } catch {
        editor.setError("The edit was saved. Reload the project to refresh its history controls.");
      }
    } catch (error) {
      setStatus("failed");
      editor.setError(error instanceof Error ? error.message : "The edit could not be saved. Retry without changing the pending image.");
    }
  }, [projectId, headVersionId, status, editor, refreshHistory]);

  useEffect(() => {
    const operationId = editor.pendingAcceptance?.operation.id;
    if (!operationId || attempted.current.has(operationId)) return;
    attempted.current.add(operationId);
    void attemptSave();
  }, [editor.pendingAcceptance, attemptSave]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      const state = useEditorStore.getState();
      if (state.pendingAcceptance || state.preview || state.localDraftDirty || state.paintSession) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  const changeWorkflow = (next: WorkspaceWorkflow) => {
    if (editor.pendingAcceptance || status === "saving") return;
    if (editor.localDraftDirty && !window.confirm("Discard the unfinished local edit?")) return;
    if (editor.localDraft) editor.discardLocalDraft();
    if (editor.paintSession && (next.kind !== "canvas" || (next.tool !== "brush" && next.tool !== "eraser"))) {
      editor.setError("Apply or discard pending paint first."); return;
    }
    if (next.kind === "canvas") editor.setTool(next.tool);
    else if (next.kind === "size-position") editor.beginLocalDraft("crop");
    else if (next.kind === "text") editor.beginLocalDraft("text");
    else if (next.kind === "watermark") editor.beginLocalDraft("watermark");
    setWorkflow(next);
    setInspectorCollapsed(next.kind === "canvas" && next.tool === "pan");
  };

  const selectGeometry = (type: GeometryEditType) => {
    if (editor.pendingAcceptance) return;
    if (editor.localDraftDirty && !window.confirm("Discard the unfinished local edit?")) return;
    editor.beginLocalDraft(type);
  };

  const selectSavedVersion = useCallback(async (versionId: string) => {
    const state = useEditorStore.getState();
    if (state.pendingAcceptance || status === "saving") {
      editor.setError("Save or discard the pending edit before changing history."); return;
    }
    if ((state.preview || state.localDraftDirty || state.paintSession) && !window.confirm("Discard unfinished work and open this saved version?")) return;
    setHistoryBusy(true);
    editor.setError(null);
    try {
      const loaded = await loadCloudVersion(projectId, versionId);
      const { pointer } = await selectCloudVersion(projectId, versionId);
      if (state.preview) state.discardPreview();
      if (state.localDraft) state.discardLocalDraft();
      if (state.paintSession) state.discardPaintSession();
      editor.setCloudCurrentVersion(loaded.image);
      setCurrentSummary(loaded.summary);
      setHeadVersionId(pointer.headVersionId);
      setStatus("saved");
    } catch (error) {
      editor.setError(error instanceof Error ? error.message : "The selected version could not be opened.");
    } finally { setHistoryBusy(false); }
  }, [projectId, status, editor]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input,textarea,select,[contenteditable='true']")) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      const targetId = event.shiftKey ? currentSummary?.nextVersionId : currentSummary?.parentVersionId;
      if (targetId) void selectSavedVersion(targetId);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [currentSummary, selectSavedVersion]);

  const loadOlder = async () => {
    if (nextCursor === null || historyBusy) return;
    setHistoryBusy(true);
    try {
      const page = await loadCloudHistory(projectId, nextCursor);
      setHistory((current) => [...current, ...page.versions]);
      setNextCursor(page.nextCursor);
    } catch (error) { editor.setError(error instanceof Error ? error.message : "Older history could not be loaded."); }
    finally { setHistoryBusy(false); }
  };

  const busy = status === "saving" || status === "loading" || historyBusy;
  return <section className="grid h-[calc(100dvh-56px)] min-h-[440px] grid-rows-[56px_minmax(0,1fr)] bg-[#cfcdc5] text-ink" aria-label="Cloud editor">
    <header className="flex min-w-0 items-center gap-2 border-b border-line bg-paper px-3">
      <Link href="/projects" className="shrink-0 font-mono text-[9px] uppercase text-muted underline underline-offset-4 hover:text-ink">← Projects</Link>
      <h1 className="min-w-0 flex-1 truncate text-sm font-bold" title={projectName}>{projectName}</h1>
      <span role="status" aria-live="polite" className={cn("hidden shrink-0 font-mono text-[9px] uppercase sm:inline", status === "failed" ? "text-accent" : "text-muted")}>{status === "loading" ? "Opening" : status === "saving" ? "Saving…" : status === "failed" ? "Save needs attention" : "Saved to cloud"}</span>
      {editor.pendingAcceptance && <>
        <button type="button" className="h-8 bg-ink px-2 text-[10px] font-bold text-paper disabled:opacity-40" disabled={busy} onClick={() => void attemptSave()}>Retry save</button>
        <button type="button" className="h-8 px-2 text-[10px] text-muted hover:text-accent" disabled={busy} onClick={() => { editor.discardPendingAcceptance(); setStatus("saved"); }}>Discard edit</button>
      </>}
      <button type="button" title="Monochrome" aria-label="Preview monochrome edit" className="hidden h-8 px-2 font-mono text-[9px] uppercase hover:bg-white/70 disabled:opacity-35 sm:block" disabled={busy || Boolean(editor.pendingAcceptance || editor.preview || editor.localDraft || editor.paintSession)} onClick={() => void editor.requestTransformPreview({ presetId: "monochrome", presetVersion: 1, userPrompt: "", preservationMode: "faithful" })}>Monochrome</button>
      <button type="button" aria-label="Undo" title="Undo" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || !currentSummary?.parentVersionId || Boolean(editor.pendingAcceptance)} onClick={() => currentSummary?.parentVersionId && void selectSavedVersion(currentSummary.parentVersionId)}><Undo2 className="size-4" /></button>
      <button type="button" aria-label="Redo" title="Redo" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || !currentSummary?.nextVersionId || Boolean(editor.pendingAcceptance)} onClick={() => currentSummary?.nextVersionId && void selectSavedVersion(currentSummary.nextVersionId)}><Redo2 className="size-4" /></button>
      <button type="button" aria-label="Go to original" title="Go to original" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || currentSummary?.id === originalVersionId || Boolean(editor.pendingAcceptance)} onClick={() => void selectSavedVersion(originalVersionId)}><RotateCcw className="size-4" /></button>
      <button type="button" aria-label="Export current image" title="Export current image" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || !editor.currentVersion} onClick={() => editor.currentVersion && exportVersion(editor.currentVersion, "image/png")}><Download className="size-4" /></button>
      <button type="button" aria-label="History" aria-expanded={historyOpen} className="flex h-8 items-center gap-1 px-2 font-mono text-[9px] uppercase hover:bg-white/70" onClick={() => setHistoryOpen((open) => !open)}><History className="size-4" /><span className="hidden sm:inline">History</span></button>
    </header>
    <div className={cn("grid min-h-0 min-w-0", historyOpen ? "lg:grid-cols-[minmax(0,1fr)_280px]" : "grid-cols-1")}>
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[256px_minmax(0,1fr)] md:grid-rows-1">
        <aside className="order-2 grid min-h-0 bg-paper md:order-1 md:grid-cols-[48px_minmax(0,1fr)]" aria-label="Editor tools">
          <ToolRail collapsed={inspectorCollapsed} disabled={busy || Boolean(editor.pendingAcceptance || editor.preview)} generationDisabled localOnly workflow={workflow} onGenerateAsset={() => {}} onSelectWorkflow={changeWorkflow} onToggleInspector={() => setInspectorCollapsed((value) => !value)} />
          {!inspectorCollapsed && <div className={cn("min-h-0 border-t border-line md:border-t-0", editor.pendingAcceptance && "pointer-events-none opacity-50")}>
            <EditorInspector localOnly phase={phase} providerCapabilities={null} workflow={workflow} onSelectGeometryEdit={selectGeometry}
              onGenerate={() => editor.createPreview()} onGenerateTransform={async () => false} onPlanExtend={async () => false}
              onGenerateExtend={async () => false} extendPreviewAdjustmentOpen={false}
              onReturnToExtendComparison={() => {}} onRetry={async () => false} onOpenDiagnostics={() => {}} />
          </div>}
        </aside>
        <CanvasFrame cloudMode busyAction={status === "loading" ? "open" : null} onUpload={() => {}} onGenerateAsset={() => {}}
          extendSelected={false} extendPreviewAdjustmentOpen={false} onAdjustTransform={() => {}} onAdjustExtend={() => {}} />
      </div>
      {historyOpen && <aside className="absolute inset-x-2 bottom-2 top-28 z-40 flex flex-col border border-line bg-paper shadow-xl lg:static lg:shadow-none" aria-label="Project history">
        <div className="flex items-center justify-between border-b border-line p-3"><strong className="text-xs">Saved history</strong><button type="button" className="font-mono text-[9px] uppercase lg:hidden" onClick={() => setHistoryOpen(false)}>Close</button></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {history.map((version) => <button key={version.id} type="button" className={cn("mb-1 flex w-full flex-col gap-1 border p-3 text-left text-xs hover:border-ink focus-visible:outline-2 focus-visible:outline-accent", version.id === currentSummary?.id ? "border-ink bg-[#edf5c4]" : "border-line")} onClick={() => void selectSavedVersion(version.id)} disabled={busy || Boolean(editor.pendingAcceptance)}>
            <span className="font-bold">{version.kind === "original" ? "Original" : `${version.operationType ?? "Edit"} · version ${version.sequence + 1}`}</span>
            <span className="font-mono text-[9px] text-muted">{version.width} × {version.height} px · {new Date(version.createdAt).toLocaleString()}</span>
            {version.id === currentSummary?.id && <span className="font-mono text-[8px] uppercase text-ink">Current</span>}
          </button>)}
          {nextCursor !== null && <button type="button" className="h-9 w-full border border-line font-mono text-[9px] uppercase hover:border-ink disabled:opacity-40" disabled={historyBusy} onClick={() => void loadOlder()}>{historyBusy ? <LoaderCircle className="mx-auto size-4 animate-spin" /> : "Load older versions"}</button>}
        </div>
      </aside>}
    </div>
    {editor.error && <div role="alert" className="absolute bottom-3 left-3 right-3 z-50 max-w-xl border border-accent bg-paper p-3 text-xs text-accent shadow-lg">{editor.error}</div>}
  </section>;
}
