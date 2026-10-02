"use client";
import { useCallback, useEffect, useState } from "react";
import type { AiUsage } from "@/shared/cloud-ai";
import { cloudAiJson, discardCloudAiPreview, fetchAiUsage, recoverCloudAiPreview } from "./cloud-ai-client";
import { getCurrentVersion, useEditorStore } from "@/features/editor/store";

export function useCloudAiUsage() {
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try { setUsage(await fetchAiUsage()); setError(null); }
    catch { setUsage(null); setError("AI availability could not be checked. Refresh to retry."); }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const updated = () => { void refresh(); };
    window.addEventListener("mirai-ai-usage-updated", updated);
    return () => { clearTimeout(timer); window.removeEventListener("mirai-ai-usage-updated", updated); };
  }, [refresh]);
  const remaining = usage ? Math.max(0, usage.granted - usage.spent - usage.pending) : 0;
  return { usage, error, remaining, available: Boolean(usage?.enabled && (usage.unlimited || remaining > 0) && usage.pending === 0), refresh };
}

export function CloudAiBalance({ usage, error }: { usage: AiUsage | null; error: string | null }) {
  return <div className="border-b border-line px-3 py-2 text-[10px] leading-5 text-muted" role="status">
    {error ?? (usage ? <><strong className="text-ink">{usage.unlimited ? "Unlimited AI · admin account" : `${Math.max(0, usage.granted - usage.spent - usage.pending)} of ${usage.granted} AI credits remaining`}</strong>{usage.pending > 0 && <span> · {usage.pending} pending</span>}<br />{!usage.enabled ? "AI is currently unavailable. Local edits and export remain available." : usage.unlimited ? "No account allowance. Service availability still applies." : "Each generated preview uses 1 credit. Local edits use no credits."}</> : "Checking AI availability…")}
  </div>;
}
interface RecoverableAttempt { id: string; status: string; workflow: string; input_version_id: string }
export function CloudAiRecovery({ projectId, currentVersionId, hasDraft, unlimited = false }: { projectId: string; currentVersionId: string | null; hasDraft: boolean; unlimited?: boolean }) {
  const [attempts, setAttempts] = useState<RecoverableAttempt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try { const result = await cloudAiJson<{ attempts: RecoverableAttempt[] }>(await fetch(`/api/ai/attempts?projectId=${projectId}`, { cache: "no-store" })); setAttempts(result.attempts); setError(null); return result.attempts; }
    catch { setError("Request recovery is unavailable. Refresh to retry."); }
  }, [projectId]);
  useEffect(() => {
    let cancelled = false;
    let timer: number;
    const check = async () => {
      if (cancelled) return;
      const current = await refresh();
      if (!cancelled && current?.some((attempt) => attempt.status === "running")) timer = window.setTimeout(check, 10_000);
    };
    timer = window.setTimeout(() => { void check(); }, 0);
    const updated = () => { clearTimeout(timer); void check(); };
    window.addEventListener("mirai-ai-usage-updated", updated);
    return () => { cancelled = true; clearTimeout(timer); window.removeEventListener("mirai-ai-usage-updated", updated); };
  }, [refresh]);
  // Only poll when an attempt is unfinished. Terminal states stay quiet until another action.
  const active = attempts.filter((attempt) => attempt.status === "running" || attempt.status === "unknown");
  const ready = attempts.filter((attempt) => attempt.status === "ready");
  async function recover(id: string) {
    const state = useEditorStore.getState();
    const source = getCurrentVersion(state);
    if (!source || state.preview || state.pendingAcceptance || state.localDraftDirty || state.paintSession) return;
    setBusy(true); setError(null);
    try {
      const preview = await recoverCloudAiPreview(id, source);
      state.restoreCloudAiPreview(preview);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The preview could not be recovered."); }
    finally { setBusy(false); }
  }
  if (!attempts.length && !error) return null;
  return <div className="border-b border-line bg-paper px-3 py-2 text-[10px] leading-5" aria-label="AI request recovery">
    {active.map((attempt) => <p key={attempt.id} role="status">{attempt.status === "unknown" ? "Provider outcome unknown" : "AI request processing"}{!unlimited && " · credit pending"}<span className="block font-mono text-muted">Reference: {attempt.id.slice(0, 8)}</span></p>)}
    {ready.map((attempt) => <div key={attempt.id} className="flex flex-wrap items-center gap-2"><span>Saved {attempt.workflow} preview</span><button type="button" disabled={busy || hasDraft || attempt.input_version_id !== currentVersionId} onClick={() => void recover(attempt.id)} className="border border-line px-2 hover:border-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">Review result</button><button type="button" disabled={busy || hasDraft} onClick={() => { setBusy(true); void discardCloudAiPreview(attempt.id).then(refresh).catch(() => setError("The preview could not be discarded.")).finally(() => setBusy(false)); }} className="text-muted underline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40">Discard result</button></div>)}
    {error && <p role="alert" className="text-accent">{error}</p>}
  </div>;
}
