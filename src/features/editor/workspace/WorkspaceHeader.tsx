"use client";

import { Activity, Copy, Download, FolderOpen, ImagePlus, LoaderCircle, MoreHorizontal, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import Image from "next/image";
import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { exportVersion } from "../image-data";
import type { SavedProjectSummary } from "../project-client";
import { getCurrentVersion, useEditorStore } from "../store";
import type { BusyAction, ExportFormat } from "./workspace-types";

const iconButton = "grid size-9 shrink-0 place-items-center rounded-md text-muted outline-none hover:bg-white/70 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-30";

export function WorkspaceHeader({
  busyAction,
  savedProjects,
  exportFormat,
  onExportFormatChange,
  onUpload,
  onOpen,
  onSave,
  onOpenDiagnostics,
}: {
  busyAction: BusyAction;
  savedProjects: SavedProjectSummary[];
  exportFormat: ExportFormat;
  onExportFormatChange: (format: ExportFormat) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpen: (projectId: string) => void;
  onSave: () => void;
  onOpenDiagnostics: () => void;
}) {
  const currentVersion = useEditorStore(getCurrentVersion);
  const projectId = useEditorStore((state) => state.projectId);
  const projectName = useEditorStore((state) => state.projectName);
  const lastRequestId = useEditorStore((state) => state.lastRequestId);
  const setProjectName = useEditorStore((state) => state.setProjectName);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const reset = useEditorStore((state) => state.reset);
  const canUndo = useEditorStore((state) => state.canUndo());
  const canRedo = useEditorStore((state) => state.canRedo());
  const disabled = busyAction !== null;

  return (
    <header className="grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-line bg-paper px-2 sm:gap-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <MiraiMark />
        <div className="mr-1 hidden min-w-0 sm:block">
          <h1 className="truncate text-xl font-extrabold uppercase leading-[.8] tracking-[-.06em]">MIRAI</h1>
          <p className="mt-1.5 hidden whitespace-nowrap font-mono text-[8px] uppercase tracking-[.12em] text-muted xl:block">IMAGE STUDIO</p>
        </div>
        <label className={cn(iconButton, "cursor-pointer focus-within:ring-2 focus-within:ring-ink")} title={currentVersion ? "Replace image" : "Choose image"}>
          <ImagePlus className="size-4" />
          <span className="sr-only">{currentVersion ? "Replace image" : "Choose image"}</span>
          <input data-testid="file-input" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={onUpload} disabled={disabled} />
        </label>
        <label className="relative hidden min-w-0 items-center md:flex" title="Open saved project">
          <FolderOpen className="pointer-events-none absolute left-2 size-3.5 text-muted" />
          <select aria-label="Open saved project" className="h-9 w-32 rounded-md min-w-0 appearance-none bg-surface pl-7 pr-2 text-[11px] outline-none hover:bg-white/70 focus:ring-2 focus:ring-ink/30 lg:w-36" value="" disabled={disabled} onChange={(event) => onOpen(event.target.value)}>
            <option value="">Open project…</option>
            {savedProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex min-w-0 items-center justify-center gap-1.5">
        <input aria-label="Project name" className="h-9 w-24 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-center text-xs font-semibold outline-none hover:border-line focus:border-ink/30 sm:w-40" value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={!currentVersion || disabled} />
        <button type="button" aria-label="Save" className="flex h-9 items-center gap-1.5 rounded-md border border-line bg-paper px-3 text-[11px] font-bold text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-30" disabled={!currentVersion || disabled} onClick={onSave}>
          {busyAction === "save" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          <span className="hidden sm:inline">Save</span>
        </button>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-1">
        <div className="mr-1 hidden items-center border-r border-line pr-2 lg:flex">
          <button type="button" data-testid="undo" aria-label="Undo" title="Undo (⌘Z)" className={iconButton} disabled={!canUndo || disabled} onClick={undo}><Undo2 className="size-4" /></button>
          <button type="button" data-testid="redo" aria-label="Redo" title="Redo (⇧⌘Z)" className={iconButton} disabled={!canRedo || disabled} onClick={redo}><Redo2 className="size-4" /></button>
        </div>
        {projectId && <IdChip label="Project" value={projectId} className="hidden xl:flex" />}
        {lastRequestId && <IdChip label="Request" value={lastRequestId} className="hidden 2xl:flex" />}
        <button type="button" aria-label="Diagnostics" title="Diagnostics" className={iconButton} disabled={!projectId} onClick={onOpenDiagnostics}><Activity className="size-4" /></button>
        <select aria-label="Export format" className="hidden h-9 rounded-md bg-transparent px-1 font-mono text-[9px] text-muted outline-none hover:bg-white/70 focus:ring-2 focus:ring-ink/30 sm:block" value={exportFormat} disabled={!currentVersion} onChange={(event) => onExportFormatChange(event.target.value as ExportFormat)}>
          <option value="image/png">PNG</option>
          <option value="image/jpeg">JPEG</option>
        </select>
        <button type="button" aria-label="Export current image" title="Export current image" className="flex h-9 shrink-0 items-center gap-2 rounded-md bg-ink px-2.5 text-[11px] font-bold text-paper outline-none hover:bg-acid hover:text-ink focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30 sm:px-3" disabled={!currentVersion} onClick={() => currentVersion && exportVersion(currentVersion, exportFormat)}><Download className="size-3.5" /><span className="hidden sm:inline">Export</span></button>
        <details className="group relative">
          <summary className={cn(iconButton, "cursor-pointer list-none [&::-webkit-details-marker]:hidden")} aria-label="More editor actions" title="More editor actions"><MoreHorizontal className="size-4" /></summary>
          <div className="absolute right-0 top-10 z-40 grid w-48 rounded-lg border border-line bg-paper p-1 shadow-[0_12px_35px_rgba(0,0,0,.22)] ring-1 ring-ink/15">
            <button type="button" className="flex h-9 items-center gap-2 rounded-md px-3 text-left text-xs hover:bg-white/70 disabled:opacity-35 lg:hidden" disabled={!canUndo} onClick={undo}><Undo2 className="size-3.5" />Undo</button>
            <button type="button" className="flex h-9 items-center gap-2 rounded-md px-3 text-left text-xs hover:bg-white/70 disabled:opacity-35 lg:hidden" disabled={!canRedo} onClick={redo}><Redo2 className="size-3.5" />Redo</button>
            <button type="button" className="flex h-9 items-center gap-2 rounded-md px-3 text-left text-xs hover:bg-[#ffd5cc] disabled:opacity-35" disabled={!currentVersion} onClick={reset}><RotateCcw className="size-3.5" />Reset to original</button>
          </div>
        </details>
      </div>
    </header>
  );
}

function MiraiMark() {
  return (
    <span className="grid size-9 shrink-0 place-items-center overflow-hidden" aria-hidden="true">
      <Image src="/icon.png" loading="eager" width={40} height={40} className="size-9 max-w-none scale-[1.45] object-contain" alt="" />
    </span>
  );
}

function IdChip({ label, value, className }: { label: string; value: string; className?: string }) {
  const compact = `${value.slice(0, 6)}…`;
  return (
    <button type="button" className={cn("group min-w-0 items-center gap-1 bg-surface px-2 py-1.5 font-mono hover:bg-white/70", className)} title={`Copy ${label.toLowerCase()} ID: ${value}`} onClick={() => void navigator.clipboard.writeText(value)}>
      <span className="text-[8px] uppercase text-muted">{label}</span><code className="text-[8px] text-ink">{compact}</code><Copy className="size-2.5 opacity-40 group-hover:opacity-100" />
    </button>
  );
}
