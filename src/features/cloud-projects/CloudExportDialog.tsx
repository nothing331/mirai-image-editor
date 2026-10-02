"use client";

import { useEffect, useState } from "react";
import type { ImageVersion } from "@/features/editor/types";

const safeName = (value: string) => value.trim().replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/^\.+/, "").slice(0, 80) || "mirai-image";

export function CloudExportDialog({ projectId, projectName, version, onClose }: {
  projectId: string; projectName: string; version: ImageVersion; onClose: () => void;
}) {
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [background, setBackground] = useState("#ffffff");
  const [filename, setFilename] = useState(projectName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = version.width;
      canvas.height = version.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image export is unavailable in this browser.");
      if (format === "jpeg") {
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
      }
      const pixels = new ImageData(new Uint8ClampedArray(version.pixels), version.width, version.height);
      const source = document.createElement("canvas");
      source.width = version.width;
      source.height = version.height;
      const sourceContext = source.getContext("2d");
      if (!sourceContext) throw new Error("Image export is unavailable in this browser.");
      sourceContext.putImageData(pixels, 0, 0);
      context.drawImage(source, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, format === "png" ? "image/png" : "image/jpeg", 0.92));
      if (!blob) throw new Error("The image could not be encoded. Try again.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${safeName(filename)}.${format === "png" ? "png" : "jpg"}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The image could not be downloaded.");
    } finally { setBusy(false); }
  }

  return <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="cloud-export-title" className="w-full max-w-md border border-ink bg-paper p-5 shadow-[6px_6px_0_#d8f441]">
      <div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted">Accepted version</p><h2 id="cloud-export-title" className="mt-1 text-xl font-bold">Export image</h2></div><button type="button" onClick={onClose} className="min-h-10 px-2 text-xs underline focus-visible:outline-2 focus-visible:outline-acid">Close</button></div>
      <p className="mt-3 text-sm text-muted">{version.width} × {version.height} px. Downloads the selected saved version without changing history.</p>
      <label className="mt-5 block text-xs font-bold" htmlFor="export-name">Filename</label>
      <input id="export-name" autoFocus value={filename} maxLength={80} onChange={(event) => setFilename(event.target.value)} className="mt-2 min-h-10 w-full border border-line bg-[#e8e5dc] px-3 text-sm focus-visible:outline-2 focus-visible:outline-acid" />
      <fieldset className="mt-5"><legend className="text-xs font-bold">Format</legend><div className="mt-2 flex gap-2">{(["png", "jpeg"] as const).map((choice) => <label key={choice} className="flex min-h-10 flex-1 cursor-pointer items-center gap-2 border border-line px-3 text-xs has-checked:border-ink has-checked:bg-[#edf5c4]"><input type="radio" name="export-format" checked={format === choice} onChange={() => setFormat(choice)} />{choice.toUpperCase()}</label>)}</div></fieldset>
      {format === "jpeg" && <label className="mt-5 flex items-center gap-3 text-xs">Background for transparent pixels <input type="color" value={background} onChange={(event) => setBackground(event.target.value)} aria-label="JPEG background color" className="h-10 w-14 border border-line" /></label>}
      {error && <p role="alert" className="mt-4 border-l-2 border-accent bg-[#ffd5cc] p-3 text-xs">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void download()} className="mt-6 min-h-11 w-full border border-ink bg-acid px-4 text-sm font-bold hover:bg-ink hover:text-paper disabled:opacity-50">{busy ? "Preparing download…" : "Download accepted version"}</button>
      <a href={`/api/cloud-projects/${encodeURIComponent(projectId)}/original-file`} className="mt-4 block text-center text-xs underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-acid">Download exact uploaded original</a>
    </section>
  </div>;
}
