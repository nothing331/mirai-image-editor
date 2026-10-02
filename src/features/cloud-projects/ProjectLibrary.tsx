"use client";

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
    <div className="flex flex-wrap gap-3 border-b border-line px-6 py-4 sm:px-10">
      <label className="min-w-40 flex-1 text-xs"><span className="sr-only">Search projects</span><input value={query} onChange={(event) => { setQuery(event.target.value); setShown(PAGE_SIZE); }} placeholder="Search project names" className="min-h-11 w-full border border-line bg-[#e8e5dc] px-3 text-sm outline-none focus-visible:outline-2 focus-visible:outline-acid" /></label>
      <label className="flex items-center gap-2 font-mono text-[10px] uppercase text-muted">Sort <select value={sort} onChange={(event) => setSort(event.target.value as "recent" | "name")} className="min-h-11 border border-line bg-[#e8e5dc] px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-acid"><option value="recent">Recently updated</option><option value="name">Name</option></select></label>
    </div>
    {visible.length === 0 ? <div className="border-b border-line px-6 py-16 text-center text-sm text-muted">No projects match that search.</div>
      : <ul className="grid gap-px border-b border-line bg-line sm:grid-cols-2">{visible.slice(0, shown).map((project) => <li key={project.id} className="min-w-0 bg-paper">
        <Link href={`/projects/${project.id}`} className="group block focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-acid">
          <div className="relative grid h-44 place-items-center overflow-hidden bg-[#e8e5dc]"><span className="absolute font-mono text-[10px] uppercase text-muted">Preview unavailable</span><Image unoptimized src={`/api/cloud-projects/${project.id}/thumbnail`} width={480} height={320} alt="" className="relative max-h-full w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; }} /><span className="absolute bottom-2 left-2 bg-paper px-2 py-1 font-mono text-[9px] uppercase opacity-90">{project.width} × {project.height} px</span></div>
          <div className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><strong className="block truncate text-lg tracking-tight" title={project.name}>{project.name}</strong><span className="mt-1 block truncate font-mono text-[9px] uppercase text-muted">Updated {new Date(project.updatedAt).toLocaleDateString()}</span></div><span aria-hidden="true" className="text-lg group-hover:translate-x-1">↗</span></div>
        </Link>
        <div className="flex flex-wrap items-center gap-5 border-t border-line px-4 py-1"><button type="button" onClick={() => { setRenaming(project); setName(project.name); setError(null); }} className="min-h-10 text-xs underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-acid">Rename project</button><ProjectLifecycleAction projectId={project.id} action="trash" name={project.name} /></div>
      </li>)}</ul>}
    {shown < visible.length && <div className="border-b border-line p-5 text-center"><button type="button" onClick={() => setShown((current) => current + PAGE_SIZE)} className="min-h-10 border border-ink px-5 text-xs font-bold hover:bg-ink hover:text-paper">Load more projects</button></div>}
    {renaming && <div className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4"><form onSubmit={(event) => void rename(event)} role="dialog" aria-modal="true" aria-labelledby="rename-title" className="w-full max-w-sm border border-ink bg-paper p-5 shadow-[6px_6px_0_#d8f441]"><h2 id="rename-title" className="text-lg font-bold">Rename project</h2><label className="mt-4 block text-xs" htmlFor="rename-name">Project name</label><input id="rename-name" autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} className="mt-2 min-h-11 w-full border border-line bg-[#e8e5dc] px-3 text-sm focus-visible:outline-2 focus-visible:outline-acid" />{error && <p role="alert" className="mt-3 text-xs text-accent">{error}</p>}<div className="mt-5 flex justify-end gap-3"><button type="button" onClick={() => setRenaming(null)} disabled={busy} className="min-h-10 px-3 text-xs underline">Cancel</button><button type="submit" disabled={busy} className="min-h-10 bg-acid px-4 text-xs font-bold disabled:opacity-50">{busy ? "Saving…" : "Save name"}</button></div></form></div>}
  </>;
}
