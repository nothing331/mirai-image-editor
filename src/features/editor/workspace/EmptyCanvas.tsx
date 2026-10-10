"use client";

import { ArrowUpRight, ImagePlus, ShieldCheck, Sparkles } from "lucide-react";
import type { ChangeEvent } from "react";
import { StudioIllustration } from "@/shared/ui/StudioIllustration";
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
            <StudioIllustration />
            <span className={styles.selectionLabel}><span />Selection focus</span>
          </div>
          <figcaption><span>Select</span><span aria-hidden="true">↗</span><span>Edit</span><span aria-hidden="true">↗</span><span>Review</span></figcaption>
        </figure>
      </div>
    </div>
  );
}
