"use client";

import { StudioIllustration } from "@/shared/ui/StudioIllustration";
import Link from "next/link";
import { AssetGenerationDialog } from "@/features/asset-generation/AssetGenerationDialog";
import { CloudAiBalance, useCloudAiUsage } from "./CloudAiStatus";
import { cloudAiJson } from "./cloud-ai-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ImagePlus, Sparkles } from "lucide-react";

type PendingUpload = { uploadId: string; name: string; originalName: string; stage: "finalizing" | "attaching" };
type Phase = "idle" | "reserving" | "uploading" | "finalizing" | "saving";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "This step failed. Try again.");
  return body as T;
}

export function NewProjectForm({ ownerId, unlimited = false }: { ownerId: string; unlimited?: boolean }) {
  const router = useRouter();
  const ai = useCloudAiUsage();
  const [aiSessionId, setAiSessionId] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiStarting, setAiStarting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [entry, setEntry] = useState<"choose" | "upload">("choose");
  const [entryReady, setEntryReady] = useState(false);
  const key = `mirai-p05-pending-${ownerId}`;

  const openAiCreation = useCallback(async () => {
    if (aiStarting || pending || phase !== "idle") return;
    setAiStarting(true);
    try {
      const sessionId = (await cloudAiJson<{ id: string }>(await fetch("/api/ai/sessions", { method: "POST" }))).id;
      sessionStorage.setItem(`mirai-ai-session-${ownerId}`, sessionId);
      setAiSessionId(sessionId); setAiOpen(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "AI creation is unavailable."); }
    finally { setAiStarting(false); }
  }, [aiStarting, ownerId, pending, phase]);
  const autoOpened = useRef(false);
  useEffect(() => {
    if (!entryReady || autoOpened.current || new URLSearchParams(window.location.search).get("create") !== "ai" || (!ai.available && !aiSessionId) || pending || phase !== "idle") return;
    const timer = window.setTimeout(() => { autoOpened.current = true; void openAiCreation(); }, 0);
    return () => window.clearTimeout(timer);
  }, [entryReady, ai.available, aiSessionId, pending, phase, openAiCreation]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const previousSession = sessionStorage.getItem(`mirai-ai-session-${ownerId}`);
      if (previousSession) setAiSessionId(previousSession);
      const raw = sessionStorage.getItem(key);
      try {
        const saved = raw ? JSON.parse(raw) as PendingUpload : null;
        if (saved && typeof saved.uploadId === "string" && typeof saved.name === "string" &&
            (saved.stage === "finalizing" || saved.stage === "attaching")) {
          setPending(saved); setName(saved.name); setEntry("upload");
        }
      } catch { sessionStorage.removeItem(key); }
      setEntryReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, ownerId]);

  async function attach(uploadId: string, projectName: string) {
    setPhase("saving");
    const result = await readResponse<{ project: { id: string } }>(await fetch("/api/cloud-projects", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId, name: projectName }),
    }));
    sessionStorage.removeItem(key);
    router.push(`/projects/${result.project.id}`);
  }

  async function finalize(uploadId: string, projectName: string, originalName: string) {
    setPhase("finalizing");
    await readResponse(await fetch(`/api/original-uploads/${uploadId}/finalize`, { method: "POST" }));
    const saved: PendingUpload = { uploadId, name: projectName, originalName, stage: "attaching" };
    sessionStorage.setItem(key, JSON.stringify(saved));
    setPending(saved);
    await attach(uploadId, projectName);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "idle") return;
    setError(null);
    const projectName = name.trim();
    if (!projectName || projectName.length > 80) { setError("Use a project name between 1 and 80 characters."); return; }
    if (pending) {
      if (projectName !== pending.name) { setError("Finish saving the pending upload with its original project name."); return; }
      try {
        if (pending.stage === "finalizing") await finalize(pending.uploadId, pending.name, pending.originalName);
        else await attach(pending.uploadId, pending.name);
      }
      catch (cause) { setError(cause instanceof Error ? cause.message : "The project could not be saved."); setPhase("idle"); }
      return;
    }
    if (!file) { setError("Choose a PNG or JPEG image."); return; }
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError("Choose a PNG or JPEG image smaller than 10 MiB."); return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    let uploadId: string | null = null;
    try {
      setPhase("reserving");
      const existing = await readResponse<{ projects: unknown[] }>(await fetch("/api/cloud-projects", { signal: controller.signal }));
      if (!unlimited && existing.projects.length >= 5) throw new Error("The five-project limit has been reached.");
      const reservation = await readResponse<{ id: string }>(await fetch("/api/original-uploads", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ requestKey: crypto.randomUUID(), originalName: file.name,
          mediaType: file.type, bytes: file.size }),
      }));
      uploadId = reservation.id;
      setPhase("uploading");
      await readResponse(await fetch(`/api/original-uploads/${uploadId}`, {
        method: "PUT", headers: { "Content-Type": file.type }, body: file, signal: controller.signal,
      }));
      const saved: PendingUpload = { uploadId, name: projectName, originalName: file.name, stage: "finalizing" };
      sessionStorage.setItem(key, JSON.stringify(saved));
      setPending(saved);
      await finalize(uploadId, projectName, file.name);
    } catch (cause) {
      if (controller.signal.aborted) {
        if (uploadId) {
          await fetch(`/api/original-uploads/${uploadId}`, { method: "DELETE" }).catch(() => {});
        }
        setError("Upload stopped. Choose the image again to retry.");
      } else {
        setError(cause instanceof Error ? cause.message : "The image could not be saved. Try again.");
      }
      setPhase("idle");
    } finally { abortRef.current = null; }
  }

  function chooseFile(next: File | null) {
    setFile(next);
    setError(null);
    if (next && !name) setName(next.name.replace(/\.[^.]+$/, "").slice(0, 80));
  }

  const aiDisabled = !entryReady || aiStarting || (!ai.available && !aiSessionId);
  const aiAvailability = !entryReady || !ai.usage ? ai.error ?? "Checking AI availability…"
    : aiSessionId && !ai.available ? "You can reopen your saved AI session. New previews require available AI."
    : !ai.usage.enabled ? "AI is currently unavailable. You can still upload an image."
    : ai.usage.pending > 0 ? "An AI request is pending. Check its result before creating another."
    : !ai.available ? "Your welcome credits are used. You can still upload an image."
    : ai.usage.unlimited ? "Unlimited AI previews for your admin account." : "1 credit per generated preview.";

  return <>{entry === "choose" ? <section className="workspace-content" aria-labelledby="new-project-title">
    <Link href="/projects" className="inline-flex min-h-10 items-center text-xs text-muted hover:text-ink">← My projects</Link>
    <div className="mb-9 mt-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">New project / choose a starting point</p>
      <h1 id="new-project-title" className="mt-3 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Start a new project.</h1>
      <p className="mt-4 max-w-xl text-sm leading-6 text-muted">Both paths open the editor. Every accepted edit stays reversible.</p>
    </div>
    <div className="grid gap-5 md:grid-cols-2">
      <button type="button" aria-label="Upload an image to edit" disabled={!entryReady || aiStarting} onClick={() => { setEntry("upload"); setError(null); }} className="group flex min-h-72 flex-col rounded-xl border border-line bg-surface/40 p-7 text-left hover:border-ink/40 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-40 sm:p-9">
        <span className="flex w-full items-center justify-between"><span className="grid size-12 place-items-center rounded-lg border border-line bg-paper"><ImagePlus className="size-5" aria-hidden="true" /></span><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">01 / Your image</span></span>
        <strong className="mt-7 text-2xl font-semibold tracking-tight">Upload an image to edit</strong>
        <span className="mt-3 max-w-sm text-sm leading-6 text-muted">Bring a photo or design. Edit, compare, and export while keeping the original safe.</span>
        <span className="mt-7 flex items-center gap-3 text-sm font-semibold">Choose your image <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
      </button>
      <div className="flex flex-col overflow-hidden rounded-xl border border-line bg-paper">
        <button type="button" aria-label="Create an image with AI" aria-describedby="ai-entry-availability" disabled={aiDisabled} onClick={() => { setError(null); void openAiCreation(); }} className="group flex flex-1 flex-col p-7 text-left hover:bg-surface/50 focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-ink disabled:opacity-40 sm:px-9 sm:pt-9 sm:pb-5">
          <span className="flex w-full items-center justify-between"><span className="grid size-12 place-items-center rounded-lg bg-acid/40"><Sparkles className="size-5" aria-hidden="true" /></span><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">02 / From a prompt</span></span>
          <strong className="mt-7 text-2xl font-semibold tracking-tight">Create an image with AI</strong>
          <span className="mt-3 max-w-sm text-sm leading-6 text-muted">Describe what you have in mind. Review the generated image, then make it your own in the editor.</span>
          <span className="mt-7 flex items-center gap-3 text-sm font-semibold">{aiStarting ? "Opening AI creator…" : "Describe your image"} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
        </button>
        <p id="ai-entry-availability" className="px-7 pb-7 text-xs leading-5 text-muted sm:px-9">{aiAvailability}</p>
      </div>
    </div>
    <div className="mt-8 overflow-hidden rounded-lg border border-line"><CloudAiBalance usage={ai.usage} error={ai.error} /></div>
    {error && <p role="alert" className="mt-5 border-l-2 border-accent bg-[#ffd5cc] p-3 text-sm">{error}</p>}
  </section> : <section className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-7xl lg:grid-cols-[0.95fr_1.05fr]">
    <div className="flex flex-col justify-center border-b border-line bg-surface/60 p-6 sm:p-12 lg:border-b-0 lg:border-r lg:p-14">
      <Link href="/projects" className="self-start text-xs text-muted hover:text-ink">← My projects</Link>
      <p className="mt-9 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">New project / original image</p>
      <h1 className="mt-4 max-w-md text-4xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-5xl">Start with the original.</h1>
      <p className="mt-5 max-w-md text-sm leading-6 text-muted">Give your image a home. Keep the original, explore edits, and reopen every saved version whenever you need it.</p>
      <StudioIllustration className="mt-8 hidden h-56 w-full max-w-md rounded-xl sm:block" />
      <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">PNG or JPEG · 10 MiB maximum · 2,048 px per edge</p>
    </div>
    <div className="flex min-w-0 items-center justify-center px-6 py-10 sm:p-12"><form onSubmit={submit} className="w-full max-w-md">
      {!pending && <button type="button" disabled={phase !== "idle"} onClick={() => { setEntry("choose"); setError(null); }} className="mb-7 min-h-10 text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-40">← Choose another starting point</button>}
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">01 / Upload image</p>
      {pending ? <div role="status" className="mt-4 break-words border-l-2 border-acid bg-[#edf5c4] p-4 text-sm leading-6">{pending.originalName} is uploaded. Finish saving this project before starting another image.</div>
        : <label className="mt-4 flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-surface/40 px-5 text-center text-sm hover:border-ink hover:bg-surface has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink"><ImagePlus className="size-7 text-muted" aria-hidden="true" /><span className="max-w-full break-words font-semibold">{file ? file.name : "Choose a PNG or JPEG"}</span><span className="text-xs text-muted">Up to 10 MiB · your original stays safe</span><input aria-label="Original image" className="sr-only" type="file" accept="image/png,image/jpeg" disabled={phase !== "idle"} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /></label>}
      <label htmlFor="project-name" className="mt-7 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted">02 / Project name</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} disabled={phase !== "idle"} maxLength={80} required placeholder="Give your project a name" className="workspace-field mt-3" />
      {error && <p role="alert" className="mt-5 border-l-2 border-accent bg-[#ffd5cc] p-3 text-sm">{error}</p>}
      {phase !== "idle" && <p role="status" className="mt-5 text-sm text-muted">{{ reserving: "Reserving private space…", uploading: "Uploading image…", finalizing: "Preparing editor copy…", saving: "Saving project…" }[phase]}</p>}
      <div className="mt-7 flex flex-wrap items-center gap-4"><button type="submit" disabled={phase !== "idle"} className="workspace-action flex-1">{pending ? "Finish saving project" : "Save project"}<ArrowRight className="size-4" aria-hidden="true" /></button>
        {phase === "reserving" || phase === "uploading" ? <button type="button" onClick={() => abortRef.current?.abort()} className="workspace-quiet-action">Stop upload</button> : null}</div>
    </form></div>
  </section>}
    {aiSessionId && <AssetGenerationDialog initialChoice="image" open={aiOpen} cloudSessionId={aiSessionId} cloudAiAvailable={ai.available} cloudUnlimited={ai.usage?.unlimited} onClose={() => setAiOpen(false)} onUseCandidate={async (candidate) => {
      const result = await cloudAiJson<{ project: { id: string } }>(await fetch(`/api/ai/attempts/${candidate.response.requestId}/use`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() || "AI creation" }) }));
      sessionStorage.removeItem(`mirai-ai-session-${ownerId}`);
      router.push(`/projects/${result.project.id}`);
      return true;
    }} />}
  </>;
}
