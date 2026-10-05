"use client";

import { ArrowUpRight, ImagePlus, ShieldCheck, Sparkles } from "lucide-react";
import type { ChangeEvent } from "react";
import styles from "./EmptyCanvas.module.css";

export function EmptyCanvas({ busy, onUpload, onGenerateAsset, cloudMode }: {
  busy: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onGenerateAsset: () => void;
  cloudMode: boolean;
}) {
  if (cloudMode) return <div className="absolute inset-0 grid place-items-center p-6 text-center text-muted"><div><ImagePlus className="mx-auto mb-4 size-8" /><h2 className="text-lg font-bold text-ink">Your project canvas</h2><p className="mt-2 text-sm">Your saved image will appear here.</p></div></div>;

  return (
    <div className={styles.empty} data-testid="empty-workspace">
      <div className={styles.content}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}><span aria-hidden="true" />Mirai / Image workspace</p>
          <h2>Open an image.<br /><span>Make it yours.</span></h2>
          <p className={styles.description}>Refine a detail or reimagine the whole image. Every edit is yours to keep or undo.</p>
          <div className={styles.actions}>
            <label className={styles.upload} aria-disabled={busy}>
              <ImagePlus className="size-4" aria-hidden="true" />
              <span>Open an image</span>
              <ArrowUpRight className="ml-5 size-4" aria-hidden="true" />
              <input aria-label="Open an image" className="sr-only" type="file" accept="image/png,image/jpeg" onChange={onUpload} disabled={busy} />
            </label>
            <button data-testid="open-asset-generator" type="button" className={styles.create} onClick={onGenerateAsset} disabled={busy}><Sparkles className="size-4" aria-hidden="true" />Create with AI<ArrowUpRight className="size-3.5" aria-hidden="true" /></button>
          </div>
          <p className={styles.formats}>PNG or JPEG<span>·</span>Logo, icon, or image with AI</p>
          <p className={styles.preservation}><ShieldCheck className="size-4" aria-hidden="true" />Your original stays untouched. Always.</p>
        </div>
        <figure className={styles.artwork} aria-label="Illustration of a landscape with a selected area">
          <div className={styles.artHeader}><span>ROOM TO EXPLORE</span><span>01 / ∞</span></div>
          <div className={styles.imageFrame}>
            <svg viewBox="0 0 400 450" fill="none" role="img" aria-label="A sun above sculptural dunes, with a selection around it">
              <defs>
                <linearGradient id="studio-sky" x1="200" y1="0" x2="200" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#c7d3c5" /><stop offset="1" stopColor="#e7e9da" /></linearGradient>
                <linearGradient id="studio-dune" x1="85" y1="205" x2="295" y2="430" gradientUnits="userSpaceOnUse"><stop stopColor="#d6976c" /><stop offset="1" stopColor="#9d4d34" /></linearGradient>
                <linearGradient id="studio-foreground" x1="270" y1="290" x2="90" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#495d49" /><stop offset="1" stopColor="#293b32" /></linearGradient>
              </defs>
              <path fill="url(#studio-sky)" d="M0 0h400v450H0z" />
              <circle cx="267" cy="125" r="46" fill="#f8f0d7" />
              <path d="M0 318c55-90 70-44 114-106 61-88 126 72 165 63 53-12 85-51 121-37v212H0V318Z" fill="url(#studio-dune)" />
              <path d="M0 378c77-61 116 59 200 0 66-46 115-98 200-86v158H0v-72Z" fill="url(#studio-foreground)" />
              <path d="M0 433c63-15 157-5 237-49 50-27 105-42 163-31v97H0v-17Z" fill="#24362e" />
              <path d="M192 73c25-29 91-23 120 1 29 25 30 90-1 113-29 22-95 22-120-7-22-26-25-78 1-107Z" stroke="#283d31" strokeWidth="1.5" strokeDasharray="5 5" />
              <path d="m322 179 5 24 6-8 10-1-21-15Z" fill="#faf9f6" stroke="#283d31" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className={styles.selectionLabel}><span />Selection focus</span>
          </div>
          <figcaption><span>Select</span><span aria-hidden="true">↗</span><span>Edit</span><span aria-hidden="true">↗</span><span>Review</span></figcaption>
        </figure>
      </div>
    </div>
  );
}
