"use client";

import Link from "next/link";
import { discardCloudAiPreview } from "./cloud-ai-client";
import { CloudAiBalance, CloudAiRecovery, useCloudAiUsage } from "./CloudAiStatus";
import { useRouter } from "next/navigation";
import { Download, History, LoaderCircle, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { getCurrentVersion, useEditorStore } from "@/features/editor/store";
import { CanvasFrame } from "@/features/editor/workspace/CanvasFrame";
import { EditorInspector } from "@/features/editor/workspace/EditorInspector";
import { ToolRail } from "@/features/editor/workspace/ToolRail";
import type { WorkspaceWorkflow } from "@/features/editor/workspace/workspace-types";
import { deriveWorkspacePhase } from "@/features/editor/workspace/workspace-phase";
import type { GeometryEditType, LocalEditDraft } from "@/features/editor/types";
import { cn } from "@/lib/utils";
import { loadCloudHistory, loadCloudVersion, saveCloudEdit, selectCloudVersion, type CloudVersionSummary } from "./cloud-edit-client";
import { CloudExportDialog } from "./CloudExportDialog";
import { CloudPendingWorkDialog } from "./CloudPendingWorkDialog";
import { activateCloudDraftAccount, clearCloudDraft, loadCloudDraft, saveCloudDraft, type CloudDraftSnapshot } from "./cloud-draft-cache";

type PendingDecision =
  | { kind: "navigate"; href: string }
  | { kind: "workflow"; workflow: WorkspaceWorkflow }
  | { kind: "geometry"; editType: GeometryEditType }
  | { kind: "version"; versionId: string };

export function CloudEditorWorkspace({ ownerId, projectId, projectName, originalVersionId, initialCurrentVersionId, initialHeadVersionId }: {
  ownerId: string; projectId: string; projectName: string; originalVersionId: string;
  initialCurrentVersionId: string; initialHeadVersionId: string;
}) {
  const router = useRouter();
  const ai = useCloudAiUsage();
  const [extendPreviewAdjustmentOpen, setExtendPreviewAdjustmentOpen] = useState(false);
  const editor = useEditorStore(useShallow((state) => ({
    currentVersionId: state.currentVersionId,
    currentVersion: getCurrentVersion(state),
    pendingAcceptance: state.pendingAcceptance,
    preview: state.preview, localDraft: state.localDraft, localDraftDirty: state.localDraftDirty,
    paintSession: state.paintSession, selectionMask: state.selectionMask,
    generativeState: state.generativeState, extendState: state.extendState, error: state.error,
    loadCloudProject: state.loadCloudProject, setCloudCurrentVersion: state.setCloudCurrentVersion,
    restoreCloudDraft: state.restoreCloudDraft,
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
  const [exportOpen, setExportOpen] = useState(false);
  const [draftOffer, setDraftOffer] = useState<CloudDraftSnapshot | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"stored" | "unavailable" | null>(null);
  const [workflow, setWorkflow] = useState<WorkspaceWorkflow>({ kind: "canvas", tool: "lasso" });
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
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
        try {
          await activateCloudDraftAccount(ownerId);
          const saved = await loadCloudDraft(ownerId, projectId, current.summary.id);
          if (!cancelled) { setDraftOffer(saved); setDraftReady(!saved); }
        } catch { if (!cancelled) { setDraftStatus("unavailable"); setDraftReady(true); } }
      } catch (error) {
        if (!cancelled) { setStatus("failed"); setEditorError(error instanceof Error ? error.message : "The project could not be opened."); }
      }
    })();
    return () => { cancelled = true; };
  }, [ownerId, projectId, projectName, originalVersionId, initialCurrentVersionId, loadCloudProject, setEditorError]);

  const persistDraft = useCallback(async () => {
    const state = useEditorStore.getState();
    if (state.acceptanceMode !== "cloud" || state.projectId !== projectId || !state.currentVersionId) return false;
    const hasSelection = state.selectionMask?.data.some((alpha) => alpha !== 0) ?? false;
    if (!state.localDraftDirty && !state.paintSession && !state.preview && !state.pendingAcceptance && !hasSelection) {
      await clearCloudDraft(ownerId, projectId).catch(() => {});
      setDraftStatus(null);
      return true;
    }
    const pending = state.pendingAcceptance;
    const snapshot: CloudDraftSnapshot = {
      schema: 1, ownerId, projectId, inputVersionId: state.currentVersionId, savedAt: Date.now(),
      localDraft: state.localDraftDirty ? state.localDraft : null, paintSession: state.paintSession,
      selectionMask: state.selectionMask, preview: state.preview, pendingAcceptance: pending,
      overlayAssets: state.overlayAssets, commitKeys: pending ? saveKeys.current.get(pending.operation.id) ?? null : null,
    };
    try { await saveCloudDraft(snapshot); setDraftStatus("stored"); return true; }
    catch { setDraftStatus("unavailable"); return false; }
  }, [ownerId, projectId]);

  useEffect(() => {
    if (!draftReady || status === "loading") return;
    let timer: number | null = null;
    const unsubscribe = useEditorStore.subscribe(() => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void persistDraft(); }, 800);
    });
    return () => { unsubscribe(); if (timer !== null) window.clearTimeout(timer); void persistDraft(); };
  }, [draftReady, persistDraft, status]);

  useEffect(() => {
    const guard = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const destination = new URL(anchor.href);
      if (destination.origin !== window.location.origin || destination.pathname === window.location.pathname) return;
      const state = useEditorStore.getState();
      if (state.projectId !== projectId || state.acceptanceMode !== "cloud") return;
      if (status === "saving") {
        event.preventDefault();
        state.setError("Finish or retry the pending save before leaving this project.");
        return;
      }
      if (!state.pendingAcceptance && !state.localDraftDirty && !state.paintSession && !state.preview
        && !(state.selectionMask?.data.some((alpha) => alpha !== 0))) return;
      event.preventDefault();
      setDecisionError(null);
      setPendingDecision({ kind: "navigate", href: `${destination.pathname}${destination.search}${destination.hash}` });
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [projectId, status]);

  const attemptSave = useCallback(async (allowRedoReplacement = false): Promise<boolean> => {
    const pending = useEditorStore.getState().pendingAcceptance;
    if (!pending || status === "saving") return false;
    const operationId = pending.operation.id;
    const replaceFuture = pending.input.id !== headVersionId;
    if (replaceFuture && !allowRedoReplacement && !window.confirm("This new edit will replace the redo versions after the current image. Continue?")) {
      setStatus("failed");
      editor.setError("The pending edit is still available. Save it to replace redo history, or discard it.");
      return false;
    }
    let keys = saveKeys.current.get(operationId);
    if (!keys) {
      keys = { requestKey: crypto.randomUUID(), assetId: crypto.randomUUID() };
      saveKeys.current.set(operationId, keys);
    }
    const state = useEditorStore.getState();
    try {
      await saveCloudDraft({ schema: 1, ownerId, projectId, inputVersionId: pending.input.id, savedAt: Date.now(),
        localDraft: null, paintSession: null, selectionMask: state.selectionMask, preview: state.preview,
        pendingAcceptance: pending, overlayAssets: state.overlayAssets, commitKeys: keys });
      setDraftStatus("stored");
    } catch { setDraftStatus("unavailable"); }
    setStatus("saving");
    editor.setError(null);
    try {
      const { receipt } = await saveCloudEdit(projectId, pending, keys, replaceFuture);
      if (useEditorStore.getState().pendingAcceptance?.operation.id !== operationId) return false;
      if (receipt.output_version_id !== pending.output.id) throw new Error("Save receipt refers to another image version.");
      editor.confirmPendingAcceptance();
      window.dispatchEvent(new CustomEvent("mirai-ai-usage-updated"));
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
      return true;
    } catch (error) {
      setStatus("failed");
      editor.setError(error instanceof Error ? error.message : "The edit could not be saved. Retry without changing the pending image.");
      return false;
    }
  }, [ownerId, projectId, headVersionId, status, editor, refreshHistory]);

  useEffect(() => {
    const operationId = editor.pendingAcceptance?.operation.id;
    if (!operationId || attempted.current.has(operationId)) return;
    attempted.current.add(operationId);
    void attemptSave();
  }, [editor.pendingAcceptance, attemptSave]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      const state = useEditorStore.getState();
      if (state.pendingAcceptance || state.preview || state.localDraftDirty || state.paintSession
        || state.selectionMask?.data.some((alpha) => alpha !== 0)) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  const performWorkflow = (next: WorkspaceWorkflow) => {
    if (editor.localDraft) editor.discardLocalDraft();
    if (next.kind === "canvas") editor.setTool(next.tool);
    else if (next.kind === "size-position") editor.beginLocalDraft("crop");
    else if (next.kind === "text") editor.beginLocalDraft("text");
    else if (next.kind === "watermark") editor.beginLocalDraft("watermark");
    setWorkflow(next);
    setInspectorCollapsed(next.kind === "canvas" && next.tool === "pan");
  };

  const changeWorkflow = (next: WorkspaceWorkflow) => {
    if (editor.pendingAcceptance || status === "saving") return;
    if (next.kind === workflow.kind && (next.kind !== "canvas" || (workflow.kind === "canvas" && next.tool === workflow.tool))) return;
    if (editor.paintSession && (next.kind !== "canvas" || (next.tool !== "brush" && next.tool !== "eraser"))) {
      setDecisionError(null);
      setPendingDecision({ kind: "workflow", workflow: next });
      return;
    }
    if (editor.localDraftDirty) {
      setDecisionError(null);
      setPendingDecision({ kind: "workflow", workflow: next });
      return;
    }
    performWorkflow(next);
  };

  const selectGeometry = (type: GeometryEditType) => {
    if (editor.pendingAcceptance) return;
    if (editor.localDraft?.type === type) return;
    if (editor.localDraftDirty) {
      setDecisionError(null);
      setPendingDecision({ kind: "geometry", editType: type });
      return;
    }
    editor.beginLocalDraft(type);
  };

  const openSavedVersion = useCallback(async (versionId: string) => {
    const state = useEditorStore.getState();
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
  }, [projectId, editor]);

  const selectSavedVersion = useCallback((versionId: string) => {
    if (status === "saving") return;
    const state = useEditorStore.getState();
    if (state.pendingAcceptance || state.preview || state.localDraftDirty || state.paintSession
      || state.selectionMask?.data.some((alpha) => alpha !== 0)) {
      setDecisionError(null);
      setPendingDecision({ kind: "version", versionId });
      return;
    }
    void openSavedVersion(versionId);
  }, [status, openSavedVersion]);

  const finishDecision = (decision: PendingDecision) => {
    setPendingDecision(null);
    setDecisionError(null);
    if (decision.kind === "navigate") router.push(decision.href);
    else if (decision.kind === "workflow") performWorkflow(decision.workflow);
    else if (decision.kind === "geometry") editor.beginLocalDraft(decision.editType);
    else void openSavedVersion(decision.versionId);
  };

  const saveAndContinue = async () => {
    const decision = pendingDecision;
    if (!decision || decisionBusy) return;
    setDecisionBusy(true);
    setDecisionError(null);
    const state = useEditorStore.getState();
    const draft = state.localDraft;
    const canCommitDraft = Boolean(draft && state.localDraftDirty && canSaveDraft(draft, getCurrentVersion(state)));
    const canCommit = Boolean(state.pendingAcceptance || canCommitDraft || state.paintSession || state.preview);
    try {
      if (canCommit && !state.pendingAcceptance) {
        const accepted = canCommitDraft ? state.applyLocalDraft()
          : state.paintSession ? state.commitPaintSession() : state.acceptPreview();
        if (!accepted) {
          setDecisionError(useEditorStore.getState().error ?? "This edit could not be prepared. Keep editing and try again.");
          return;
        }
        const operationId = useEditorStore.getState().pendingAcceptance?.operation.id;
        if (operationId) attempted.current.add(operationId);
      }
      if (canCommit) {
        if (!await attemptSave(true)) {
          setDecisionError(useEditorStore.getState().error ?? "The cloud save did not finish. Your edit is still here; retry the save.");
          return;
        }
      } else if (decision.kind !== "navigate") {
        setDecisionError("Finish this edit before changing views. Your work is still on the canvas.");
        return;
      } else if (!await persistDraft()) {
        setDecisionError("This browser could not store your draft. Your work is still on the canvas; keep editing and try again.");
        return;
      }
      finishDecision(decision);
    } finally { setDecisionBusy(false); }
  };

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

  function discardPreview() {
    const state = useEditorStore.getState();
    const preview = state.preview;
    state.discardPreview();
    if (preview?.method === "generative" && "diagnosticRequestId" in preview.parameters) {
      void discardCloudAiPreview(preview.parameters.diagnosticRequestId).catch(() => state.setError("The preview was removed on this device. Server cleanup is unavailable; it will expire automatically."));
    }
  }

  const busy = status === "saving" || status === "loading" || historyBusy || editor.generativeState.status === "processing" || editor.extendState.status === "generating" || editor.extendState.status === "analyzing";
  const decisionDraft = editor.localDraft;
  const decisionCanSaveEdit = Boolean(editor.pendingAcceptance || editor.paintSession || editor.preview
    || (decisionDraft && editor.localDraftDirty && canSaveDraft(decisionDraft, editor.currentVersion)));
  const decisionDestination = pendingDecision?.kind === "navigate" ? "leave this project"
    : pendingDecision?.kind === "version" ? "open another saved version" : "switch tools";
  const decisionActionTarget = pendingDecision?.kind === "navigate" ? "leave"
    : pendingDecision?.kind === "version" ? "open version" : "switch tools";
  const cloudStatusLabel = status === "loading" ? "Opening" : status === "saving" ? "Saving…"
    : status === "failed" ? "Save needs attention" : draftStatus === "unavailable" ? "Draft cache unavailable"
      : draftStatus === "stored" ? "Draft on device" : "Cloud saved";
  return <section className="grid h-[calc(100dvh-56px)] min-h-[440px] grid-rows-[56px_minmax(0,1fr)] bg-[#cfcdc5] text-ink" aria-label="Cloud editor">
    {draftOffer && <div className="absolute left-1/2 top-20 z-50 w-[min(90vw,420px)] -translate-x-1/2 border border-ink bg-paper p-4 shadow-[5px_5px_0_#d8f441]" role="dialog" aria-label="Stored browser draft"><strong className="text-sm">Draft stored on this device</strong><p className="mt-2 text-xs leading-5 text-muted">This draft matches the current saved version. It has not been saved to the cloud.</p><div className="mt-4 flex gap-3"><button type="button" className="min-h-10 bg-acid px-3 text-xs font-bold" onClick={() => { if (draftOffer.pendingAcceptance && draftOffer.commitKeys) saveKeys.current.set(draftOffer.pendingAcceptance.operation.id, draftOffer.commitKeys); if (!editor.restoreCloudDraft(draftOffer)) editor.setError("The stored draft no longer matches this image."); if (draftOffer.localDraft) setWorkflow(draftOffer.localDraft.type === "text" ? { kind: "text" } : draftOffer.localDraft.type === "watermark" ? { kind: "watermark" } : { kind: "size-position" }); else if (draftOffer.paintSession) setWorkflow({ kind: "canvas", tool: "brush" }); setDraftOffer(null); setDraftReady(true); }}>Restore draft</button><button type="button" className="min-h-10 px-3 text-xs underline" onClick={() => { void clearCloudDraft(ownerId, projectId); setDraftOffer(null); setDraftReady(true); }}>Discard draft</button></div></div>}
    <header className="flex min-w-0 items-center gap-2 border-b border-line bg-paper px-3">
      <Link href="/projects" className="shrink-0 font-mono text-[9px] uppercase text-muted underline underline-offset-4 hover:text-ink">← Projects</Link>
      <h1 className="min-w-0 flex-1 truncate text-sm font-bold" title={projectName}>{projectName}</h1>
      <span role="status" aria-live="polite" className={cn("hidden shrink-0 font-mono text-[9px] uppercase sm:inline", status === "failed" ? "text-accent" : "text-muted")}>{status === "loading" ? "Opening" : status === "saving" ? "Saving…" : status === "failed" ? "Save needs attention" : "Saved to cloud"}</span>
      {draftStatus === "stored" && <span className="hidden font-mono text-[9px] uppercase text-muted lg:inline">Draft on device</span>}
      {draftStatus === "unavailable" && <span className="hidden font-mono text-[9px] uppercase text-accent lg:inline">Draft cache unavailable</span>}
      {editor.pendingAcceptance && <>
        <button type="button" className="h-8 bg-ink px-2 text-[10px] font-bold text-paper disabled:opacity-40" disabled={busy} onClick={() => void attemptSave()}>Retry save</button>
        <button type="button" className="h-8 px-2 text-[10px] text-muted hover:text-accent" disabled={busy} onClick={() => { editor.discardPendingAcceptance(); setStatus("saved"); }}>Discard edit</button>
      </>}
      <button type="button" title="Monochrome" aria-label="Preview monochrome edit" className="hidden h-8 px-2 font-mono text-[9px] uppercase hover:bg-white/70 disabled:opacity-35 sm:block" disabled={busy || Boolean(editor.pendingAcceptance || editor.preview || editor.localDraft || editor.paintSession)} onClick={() => void editor.requestTransformPreview({ presetId: "monochrome", presetVersion: 1, userPrompt: "", preservationMode: "faithful" })}>Monochrome</button>
      <button type="button" aria-label="Undo" title="Undo" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || !currentSummary?.parentVersionId || Boolean(editor.pendingAcceptance)} onClick={() => currentSummary?.parentVersionId && void selectSavedVersion(currentSummary.parentVersionId)}><Undo2 className="size-4" /></button>
      <button type="button" aria-label="Redo" title="Redo" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || !currentSummary?.nextVersionId || Boolean(editor.pendingAcceptance)} onClick={() => currentSummary?.nextVersionId && void selectSavedVersion(currentSummary.nextVersionId)}><Redo2 className="size-4" /></button>
      <button type="button" aria-label="Go to original" title="Go to original" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || currentSummary?.id === originalVersionId || Boolean(editor.pendingAcceptance)} onClick={() => void selectSavedVersion(originalVersionId)}><RotateCcw className="size-4" /></button>
      <button type="button" aria-label="Export accepted image" title="Export accepted image" className="grid size-8 place-items-center hover:bg-white/70 disabled:opacity-30" disabled={busy || !editor.currentVersion || Boolean(editor.pendingAcceptance)} onClick={() => setExportOpen(true)}><Download className="size-4" /></button>
      <button type="button" aria-label="History" aria-expanded={historyOpen} className="flex h-8 items-center gap-1 px-2 font-mono text-[9px] uppercase hover:bg-white/70" onClick={() => setHistoryOpen((open) => !open)}><History className="size-4" /><span className="hidden sm:inline">History</span></button>
    </header>
    <div className={cn("grid min-h-0 min-w-0", historyOpen ? "lg:grid-cols-[minmax(0,1fr)_280px]" : "grid-cols-1")}>
      <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[256px_minmax(0,1fr)] md:grid-rows-1">
        <aside className="order-2 grid min-h-0 bg-paper md:order-1 md:grid-cols-[48px_minmax(0,1fr)]" aria-label="Editor tools">
          <ToolRail collapsed={inspectorCollapsed} disabled={busy || Boolean(editor.pendingAcceptance || editor.preview)} generationDisabled={busy || !ai.available} workflow={workflow} onGenerateAsset={() => {
            const state = useEditorStore.getState();
            if (state.pendingAcceptance || state.localDraftDirty || state.paintSession || state.preview || state.selectionMask?.data.some((alpha) => alpha > 0)) setPendingDecision({ kind: "navigate", href: "/projects/new?create=ai" });
            else router.push("/projects/new?create=ai");
          }} onSelectWorkflow={changeWorkflow} onToggleInspector={() => setInspectorCollapsed((value) => !value)} />
          {!inspectorCollapsed && <div className={cn("grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] border-t border-line md:border-t-0", editor.pendingAcceptance && "pointer-events-none opacity-50")}>
            <CloudAiBalance usage={ai.usage} error={ai.error} />
            <CloudAiRecovery projectId={projectId} currentVersionId={editor.currentVersionId} hasDraft={Boolean(editor.preview || editor.pendingAcceptance || editor.localDraftDirty || editor.paintSession)} />
            <EditorInspector cloudCredits aiUnavailable={!ai.available} phase={phase} providerCapabilities={null} workflow={workflow} onSelectGeometryEdit={selectGeometry}
              onGenerate={() => { const state = useEditorStore.getState(); if (state.editType === "recolor") state.createPreview(); else if (ai.available) void state.requestGenerativePreview(); }}
              onGenerateTransform={async (input) => { if ((input.presetId === "monochrome" && !input.userPrompt.trim()) || ai.available) return editor.requestTransformPreview(input); return false; }}
              onPlanExtend={(input) => { const state = useEditorStore.getState(); return ai.available || Boolean(state.currentVersionId && state.extendAnalysisCache[state.currentVersionId]) ? state.planExtend(input) : Promise.resolve(false); }}
              onGenerateExtend={() => ai.available ? useEditorStore.getState().generateExtend() : Promise.resolve(false)} extendPreviewAdjustmentOpen={extendPreviewAdjustmentOpen}
              onReturnToExtendComparison={() => setExtendPreviewAdjustmentOpen(false)} onRetry={() => useEditorStore.getState().retryGenerativePreview()} onOpenDiagnostics={() => {}} />
          </div>}
        </aside>
        <CanvasFrame cloudMode cloudStatusLabel={cloudStatusLabel} busyAction={status === "loading" ? "open" : null} onUpload={() => {}} onGenerateAsset={() => {}}
          onDiscardPreview={discardPreview} extendSelected={workflow.kind === "extend"} extendPreviewAdjustmentOpen={extendPreviewAdjustmentOpen} onAdjustTransform={() => { discardPreview(); setWorkflow({ kind: "transform" }); }} onAdjustExtend={() => { setWorkflow({ kind: "extend" }); setExtendPreviewAdjustmentOpen(true); }} />
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
    {exportOpen && editor.currentVersion && <CloudExportDialog projectId={projectId} projectName={projectName} version={editor.currentVersion} onClose={() => setExportOpen(false)} />}
    {pendingDecision && <CloudPendingWorkDialog destination={decisionDestination} actionTarget={decisionActionTarget} deviceDraft={!decisionCanSaveEdit}
      blocked={!decisionCanSaveEdit && pendingDecision.kind !== "navigate"}
      retry={Boolean(editor.pendingAcceptance)}
      replacesRedo={Boolean(editor.pendingAcceptance ? editor.pendingAcceptance.input.id !== headVersionId : editor.currentVersionId && editor.currentVersionId !== headVersionId)}
      busy={decisionBusy} error={decisionError}
      onSave={() => void saveAndContinue()} onStay={() => { setPendingDecision(null); setDecisionError(null); }} />}
  </section>;
}

function canSaveDraft(draft: LocalEditDraft, version: { id: string; width: number; height: number } | null | undefined) {
  if (!version || draft.inputVersionId !== version.id) return false;
  if (draft.type === "crop") {
    const { x, y, width, height } = draft.parameters.sourceRect;
    if (x === 0 && y === 0 && width === version.width && height === version.height) return false;
  }
  if (draft.type === "resize" && draft.parameters.width === version.width && draft.parameters.height === version.height) return false;
  if (draft.type === "text") return draft.parameters.content.trim().length > 0;
  if (draft.type === "watermark") return draft.parameters.source === "text"
    ? draft.parameters.content.trim().length > 0 : Boolean(draft.parameters.overlayAssetId);
  return true;
}
