"use client";

import { ArrowUpRight, PencilLine, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type { CloudProject } from "@/server/cloud-projects/cloud-projects";
import { ProjectLifecycleAction } from "./ProjectLifecycleAction";

const PAGE_SIZE = 4;

export function ProjectLibrary({ initialProjects }: { initialProjects: CloudProject[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [renaming, setRenaming] = useState<CloudProject | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visible = useMemo(() => projects.filter((project) => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
      : b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)), [projects, query, sort]);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!renaming || busy) return;
    const nextName = name.trim();
    if (!nextName || nextName.length > 80) { setError("Use a project name between 1 and 80 characters."); return; }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/cloud-projects/${encodeURIComponent(renaming.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nextName }),
      });
      const body = await response.json() as { project?: CloudProject; error?: string };
      if (!response.ok || !body.project) throw new Error(body.error ?? "The project could not be renamed.");
      setProjects((current) => current.map((project) => project.id === renaming.id ? body.project! : project));
      setQuery("");
      setShown(PAGE_SIZE);
      setRenaming(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The project could not be renamed."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="mb-7 flex flex-wrap items-center gap-3">
      <label className="relative min-w-40 flex-1"><span className="sr-only">Search projects</span><Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted" aria-hidden="true" /><input value={query} onChange={(event) => { setQuery(event.target.value); setShown(PAGE_SIZE); }} placeholder="Search project names" className="workspace-field pl-10" /></label>
      <label className="flex items-center gap-2 text-xs text-muted">Sort <select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "name")} className="workspace-field w-auto"><option value="recent">Recently updated</option><option value="name">Name</option></select></label>
    </div>
    {visible.length === 0 ? <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center"><Search className="mx-auto size-6 text-muted" aria-hidden="true" /><p className="mt-4 text-sm text-muted">No projects match that search.</p><button type="button" onClick={() => setQuery("")} className="workspace-quiet-action mt-5">Clear search</button></div>
      : <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{visible.slice(0, shown).map((project) => <li key={project.id} className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper transition-colors hover:border-ink/40">
        <Link href={`/projects/${project.id}`} className="group block focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ink">
          <div className="relative grid aspect-[4/3] place-items-center overflow-hidden border-b border-line bg-surface"><span className="absolute text-xs text-muted">Preview unavailable</span><Image unoptimized src={`/api/cloud-projects/${project.id}/thumbnail`} width={480} height={360} alt="" className="relative h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /><span className="absolute bottom-3 left-3 rounded bg-paper/90 px-2 py-1 font-mono text-[9px] text-muted">{project.width} × {project.height} px</span></div>
          <div className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><strong className="block truncate text-base font-semibold tracking-tight" title={project.name}>{project.name}</strong><span className="mt-1.5 block truncate text-xs text-muted">Updated {new Date(project.updatedAt).toLocaleDateString()}</span></div><ArrowUpRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" /></div>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-1 border-t border-line px-2 py-1"><button type="button" onClick={() => { setRenaming(project); setName(project.name); setError(null); }} className="flex min-h-10 items-center gap-2 px-2 text-xs text-muted hover:bg-surface hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"><PencilLine className="size-3.5" aria-hidden="true" />Rename project</button><ProjectLifecycleAction projectId={project.id} action="trash" name={project.name} /></div>
      </li>)}</ul>}
    {shown < visible.length && <div className="pt-8 text-center"><button type="button" onClick={() => setShown((current) => current + PAGE_SIZE)} className="workspace-quiet-action">Load more projects</button></div>}
    {renaming && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-sm"><form onSubmit={(event) => void rename(event)} role="dialog" aria-modal="true" aria-labelledby="rename-title" className="editor-dialog w-full max-w-sm rounded-xl border border-line bg-paper p-6 shadow-2xl"><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">Project details</p><h2 id="rename-title" className="mt-2 text-xl font-semibold tracking-tight">Rename project</h2><label className="mt-5 block text-xs font-semibold" htmlFor="rename-name">Project name</label><input id="rename-name" autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className="workspace-field mt-2" />{error && <p role="alert" className="mt-3 text-xs text-accent">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setRenaming(null)} disabled={busy} className="workspace-quiet-action">Cancel</button><button type="submit" disabled={busy} className="workspace-action">{busy ? "Saving…" : "Save name"}</button></div></form></div>}
  </>;
}
