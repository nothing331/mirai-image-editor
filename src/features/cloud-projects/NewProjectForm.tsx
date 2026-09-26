"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type PendingUpload = { uploadId: string; name: string; originalName: string; stage: "finalizing" | "attaching" };
type Phase = "idle" | "reserving" | "uploading" | "finalizing" | "saving";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error ?? "This step failed. Try again.");
  return body as T;
}

export function NewProjectForm({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const key = `mirai-p05-pending-${ownerId}`;

  useEffect(() => {
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as PendingUpload;
      if (typeof saved.uploadId === "string" && typeof saved.name === "string" &&
          (saved.stage === "finalizing" || saved.stage === "attaching")) {
        const timer = window.setTimeout(() => { setPending(saved); setName(saved.name); }, 0);
        return () => window.clearTimeout(timer);
      }
    } catch { sessionStorage.removeItem(key); }
  }, [key]);

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
      if (existing.projects.length >= 5) throw new Error("The five-project limit has been reached.");
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

  return <section className="mx-auto grid min-h-[calc(100dvh-56px)] max-w-6xl border-x border-line lg:grid-cols-[0.9fr_1.1fr]">
    <div className="flex flex-col justify-between border-b border-line bg-ink p-6 text-paper sm:p-10 lg:border-b-0 lg:border-r">
      <div><Link href="/projects" className="font-mono text-[10px] uppercase tracking-[0.12em] text-acid underline underline-offset-4">← My projects</Link>
        <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.18em] text-acid">New project / original image</p>
        <h1 className="mt-4 max-w-md text-4xl font-bold leading-tight tracking-[-0.055em] sm:text-5xl">Start with the original.</h1>
        <p className="mt-5 max-w-md text-sm leading-6 text-[#cfcdc5]">Mirai keeps the source image and a normalized editor copy in private storage. Once saved, the project opens at its own URL.</p></div>
      <p className="mt-16 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8e8b82]">PNG or JPEG · 10 MiB maximum · 2,048 px per edge</p>
    </div>
    <div className="flex items-center p-6 sm:p-10"><form onSubmit={submit} className="w-full max-w-lg">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">01 / Select image</p>
      {pending ? <div role="status" className="mt-4 border-l-2 border-acid bg-[#edf5c4] p-4 text-sm leading-6">{pending.originalName} is uploaded. Finish saving this project before starting another image.</div>
        : <label className="mt-4 flex min-h-36 cursor-pointer flex-col items-center justify-center border border-dashed border-line bg-[#e8e5dc] px-5 text-center hover:border-ink focus-within:outline-2 focus-within:outline-acid">
          <span className="text-2xl" aria-hidden="true">↑</span><span className="mt-2 text-sm font-bold">{file ? file.name : "Choose an image"}</span><span className="mt-1 text-xs text-muted">PNG or JPEG, up to 10 MiB</span>
          <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={phase !== "idle"} onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
        </label>}
      <label htmlFor="project-name" className="mt-8 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted">02 / Project name</label>
      <input id="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required disabled={phase !== "idle"} placeholder="Untitled project" className="mt-3 min-h-11 w-full border border-line bg-paper px-3 text-sm outline-none focus:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid disabled:opacity-60" />
      {error && <p role="alert" className="mt-5 border-l-2 border-accent bg-[#ffd5cc] p-3 text-sm">{error}</p>}
      {phase !== "idle" && <p role="status" className="mt-5 font-mono text-[11px] uppercase tracking-[0.1em]">{{ reserving: "Reserving private space…", uploading: "Uploading image…", finalizing: "Preparing editor copy…", saving: "Saving project…" }[phase]}</p>}
      <div className="mt-7 flex flex-wrap items-center gap-4"><button type="submit" disabled={phase !== "idle"} className="inline-flex min-h-11 items-center border border-ink bg-acid px-5 text-sm font-bold hover:bg-ink hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid disabled:cursor-wait disabled:opacity-60">{pending ? "Finish saving project" : "Save project"} <span aria-hidden="true" className="ml-3">↗</span></button>
        {phase === "reserving" || phase === "uploading" ? <button type="button" onClick={() => abortRef.current?.abort()} className="min-h-11 text-sm underline underline-offset-4">Stop upload</button> : null}</div>
    </form></div>
  </section>;
}
