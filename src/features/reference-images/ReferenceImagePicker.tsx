"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { maxReferenceImages, type ReferenceImage } from "@/shared/reference-images";
import { readReferenceImage } from "./reference-image-client";

export function ReferenceImagePicker({ images, onChange, disabled = false, onBusyChange, label = "Reference images", compact = false }: {
  images: ReferenceImage[];
  onChange: (images: ReferenceImage[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  label?: string;
  compact?: boolean;
}) {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; onBusyChange?.(false); }; }, [onBusyChange]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unavailable = disabled || loading;
  return <section className={compact ? "flex flex-wrap items-center gap-2" : "grid gap-2"} aria-label={label}>
    {!compact && <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted">{label}</span>
      <span className="font-mono text-[10px] text-muted">{images.length}/{maxReferenceImages}</span>
    </div>}
    {images.length > 0 && <ol className={compact ? "flex gap-2 overflow-x-auto py-1" : "grid grid-cols-3 gap-2"}>
      {images.map((reference, index) => <li key={`${index}-${reference.name}`} className={`relative min-w-0 ${compact ? "preview-enter w-12 shrink-0" : ""}`}>
        <div className="relative aspect-square overflow-hidden rounded-md border border-line bg-surface">
          <Image src={reference.dataUrl} alt={`Reference ${index + 1}: ${reference.name}`} fill unoptimized className="object-contain" />
          <span className="absolute bottom-1 left-1 rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] text-paper">{index + 1}</span>
        </div>
        <button type="button" aria-label={`Remove reference ${index + 1}`} disabled={unavailable} onClick={() => onChange(images.filter((_, position) => position !== index))} className={`absolute grid place-items-center rounded bg-paper text-ink outline-none hover:bg-ink hover:text-paper focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-40 ${compact ? "right-0 top-0 size-6" : "right-1 top-1 size-7"}`}><X className="size-3.5" /></button>
        {!compact && <p className="mt-1 truncate text-[10px] text-muted" title={reference.name}>{reference.name}</p>}
      </li>)}
    </ol>}
    <label className={`group relative flex min-h-10 items-center justify-center gap-2 rounded-md border border-line px-3 text-xs font-bold text-ink transition-colors focus-within:ring-2 focus-within:ring-ink ${compact ? "w-fit" : ""} ${unavailable || images.length >= maxReferenceImages ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:border-ink hover:bg-surface"}`}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
      <span className={compact && images.length > 0 ? "sr-only" : undefined}>{loading ? "Preparing images…" : compact ? "Add image" : "Add reference images"}</span>
      {compact && <span className="font-mono text-[10px] font-normal text-muted">{images.length}/{maxReferenceImages}</span>}
      {compact && images.length > 0 && <span aria-hidden="true" className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-normal text-paper opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">Add reference images</span>}
      <input type="file" aria-label="Add reference images" className="sr-only" accept="image/png,image/jpeg,image/webp" multiple disabled={unavailable || images.length >= maxReferenceImages} onChange={async (event) => {
        const files = Array.from(event.currentTarget.files ?? []);
        event.currentTarget.value = "";
        if (!files.length) return;
        setError(null);
        if (images.length + files.length > maxReferenceImages) { setError("Use up to three reference images. Remove one before adding another."); return; }
        setLoading(true);
        onBusyChange?.(true);
        try { const prepared = await Promise.all(files.map(readReferenceImage)); if (mounted.current) onChange([...images, ...prepared]); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "The reference image could not be opened."); }
        finally { if (mounted.current) { setLoading(false); onBusyChange?.(false); } }
      }} />
    </label>
    {!compact && <p className="text-[11px] leading-relaxed text-muted">Use “reference 1” in your prompt to describe what to bring into the image.</p>}
    {error && <p role="alert" className="w-full text-xs leading-relaxed text-accent">{error}</p>}
  </section>;
}
