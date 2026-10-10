"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProjectLifecycleAction({ projectId, action, name }: {
  projectId: string; action: "trash" | "restore" | "purge"; name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = { trash: "Move to trash", restore: "Restore", purge: "Delete permanently" };
  async function run() {
    if (action !== "restore" && !window.confirm(action === "trash"
      ? `Move “${name}” to trash? It can be restored for 30 days.`
      : `Delete “${name}” permanently? Its private files will be removed by maintenance and cannot be restored.`)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/cloud-projects/${encodeURIComponent(projectId)}/lifecycle`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "The project action failed.");
      }
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The project action failed."); }
    finally { setBusy(false); }
  }
  return <span className="inline-flex flex-col"><button type="button" disabled={busy} onClick={() => void run()} className={`min-h-10 px-2 text-left text-xs hover:bg-surface focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-40 ${action === "purge" ? "text-accent" : "text-muted hover:text-ink"}`}>{busy ? "Working…" : labels[action]}</button>{error && <span role="alert" className="pb-2 text-xs text-accent">{error}</span>}</span>;
}
