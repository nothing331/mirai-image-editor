"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAllCloudDrafts } from "@/features/cloud-projects/cloud-draft-cache";

interface ExportStatus { id: string; status: "pending" | "running" | "complete" | "failed"; downloadUrl: string | null; expiresAt: string | null }

export function AccountSettings({ displayName: initialName, email, usage }: {
  displayName: string; email: string; usage: { usedBytes: number; limitBytes: number | null; activeProjects: number; projectLimit: number | null; ai: import("@/shared/cloud-ai").AiUsage };
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [requestingExport, setRequestingExport] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const check = async () => {
      try {
        const response = await fetch("/api/account/export", { cache: "no-store" });
        if (!response.ok) throw new Error("Export status could not be loaded.");
        const body = await response.json() as { export: ExportStatus | null };
        if (cancelled) return;
        setExportStatus(body.export);
        if (body.export?.status === "pending" || body.export?.status === "running") timer = window.setTimeout(check, 5000);
      } catch { if (!cancelled) setExportError("Export status is unavailable. Refresh to retry."); }
    };
    void check();
    return () => { cancelled = true; if (timer !== null) window.clearTimeout(timer); };
  }, [requestingExport]);

  async function saveName(event: React.FormEvent) {
    event.preventDefault();
    setSavingName(true); setNameError(null);
    try {
      const response = await fetch("/api/account/profile", { method: "PATCH",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name }) });
      const body = await response.json() as { displayName?: string; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Display name could not be saved.");
      setName(body.displayName ?? name);
    } catch (cause) { setNameError(cause instanceof Error ? cause.message : "Display name could not be saved."); }
    finally { setSavingName(false); }
  }

  async function requestExport() {
    setRequestingExport(true); setExportError(null);
    try {
      const response = await fetch("/api/account/export", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Export could not be requested.");
      setExportStatus({ id: "", status: "pending", downloadUrl: null, expiresAt: null });
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : "Export could not be requested."); }
    finally { setRequestingExport(false); }
  }

  async function requestDeletion() {
    if (deleteText !== "DELETE") return;
    setDeleting(true); setDeleteError(null);
    try {
      const response = await fetch("/api/account/deletion", { method: "POST" });
      const body = await response.json() as { receipt?: string; error?: string };
      if (!response.ok || !body.receipt) throw new Error(body.error ?? "Account deletion could not be started.");
      await clearAllCloudDrafts().catch(() => {});
      router.push(`/account-deletion?receipt=${encodeURIComponent(body.receipt)}`);
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : "Account deletion could not be started."); setDeleting(false); }
  }

  return <div className="mx-auto max-w-4xl border-x border-line">
    <div className="border-b border-line px-6 py-10 sm:px-10"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Private workspace / account</p><h1 className="mt-3 text-4xl font-bold tracking-tight">Settings</h1></div>
    <section className="border-b border-line px-6 py-7 sm:px-10"><h2 className="text-lg font-bold">Profile</h2><p className="mt-2 text-xs text-muted">Signed in as {email}</p><form onSubmit={(event) => void saveName(event)} className="mt-5 flex flex-wrap items-end gap-3"><label className="min-w-48 flex-1 text-xs">Display name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} className="mt-2 min-h-11 w-full border border-line bg-[#e8e5dc] px-3 text-sm focus-visible:outline-2 focus-visible:outline-acid" /></label><button disabled={savingName} className="min-h-11 border border-ink bg-acid px-5 text-xs font-bold disabled:opacity-50">{savingName ? "Saving…" : "Save name"}</button></form>{nameError && <p role="alert" className="mt-3 text-xs text-accent">{nameError}</p>}</section>
    <section className="border-b border-line px-6 py-7 sm:px-10"><h2 className="text-lg font-bold">Usage</h2><dl className="mt-4 grid gap-4 sm:grid-cols-2"><div className="border-t border-line pt-3"><dt className="font-mono text-[10px] uppercase text-muted">Private storage</dt><dd className="mt-2 text-xl font-bold">{(usage.usedBytes / 1024 / 1024).toFixed(1)} MiB{usage.limitBytes === null ? " · Unlimited" : ` / ${(usage.limitBytes / 1024 / 1024).toFixed(0)} MiB`}</dd></div><div className="border-t border-line pt-3"><dt className="font-mono text-[10px] uppercase text-muted">Active projects</dt><dd className="mt-2 text-xl font-bold">{usage.activeProjects}{usage.projectLimit === null ? " · Unlimited" : ` / ${usage.projectLimit}`}</dd></div></dl><p className="mt-4 text-xs leading-5 text-muted">Trashed projects still use storage until permanent deletion finishes. {usage.ai.unlimited ? "Unlimited AI previews for your admin account. Service availability still applies." : `${Math.max(0, usage.ai.granted - usage.ai.spent - usage.ai.pending)} of ${usage.ai.granted} welcome AI credits remain across all projects. Each generated preview uses 1 credit. Local edits and export use no credits. Credits are granted once and do not reset monthly.`}{usage.ai.pending ? ` ${usage.ai.pending} requests pending.` : ""}</p></section>
    <section className="border-b border-line px-6 py-7 sm:px-10"><h2 className="text-lg font-bold">Export your data</h2><p className="mt-2 text-xs leading-5 text-muted">Prepare a private archive of your profile, projects, saved versions, operations, and original files. The download expires after seven days.</p><button type="button" disabled={requestingExport || exportStatus?.status === "pending" || exportStatus?.status === "running"} onClick={() => void requestExport()} className="mt-4 min-h-11 border border-ink px-4 text-xs font-bold hover:bg-ink hover:text-paper disabled:opacity-50">{requestingExport ? "Requesting…" : "Prepare data export"}</button>{exportStatus && <p role="status" className="mt-3 text-xs">{exportStatus.status === "complete" ? exportStatus.downloadUrl ? "Archive ready." : "The last archive expired." : exportStatus.status === "failed" ? "Export failed. Request a new archive." : "Preparing your archive…"}</p>}{exportStatus?.downloadUrl && <a href={exportStatus.downloadUrl} className="mt-3 inline-block text-xs font-bold underline underline-offset-4">Download private archive</a>}{exportError && <p role="alert" className="mt-3 text-xs text-accent">{exportError}</p>}</section>
    <section className="px-6 py-7 sm:px-10"><h2 className="text-lg font-bold text-accent">Delete account</h2><p className="mt-2 text-xs leading-5 text-muted">Sign out and sign in again first. Deletion immediately blocks access and queues permanent removal of your projects, originals, versions, and account. Previously issued short-lived image links may work until they expire.</p><label className="mt-4 block text-xs">Type DELETE to confirm<input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} className="mt-2 min-h-11 w-full max-w-xs border border-line bg-[#e8e5dc] px-3 text-sm focus-visible:outline-2 focus-visible:outline-acid" /></label><button type="button" disabled={deleting || deleteText !== "DELETE"} onClick={() => void requestDeletion()} className="mt-4 min-h-11 border border-accent bg-[#ffd5cc] px-4 text-xs font-bold text-accent hover:bg-accent hover:text-paper disabled:opacity-50">{deleting ? "Starting deletion…" : "Delete my account"}</button>{deleteError && <p role="alert" className="mt-3 text-xs text-accent">{deleteError}</p>}</section>
  </div>;
}
