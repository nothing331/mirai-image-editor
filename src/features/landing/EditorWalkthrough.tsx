"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRef, useState } from "react";
import styles from "./EditorWalkthrough.module.css";

const steps = [
  { id: "start", label: "Start", title: "Start with an idea.", screenshot: "/landing/editor-original.webp", caption: "The starting image", },
  { id: "select", label: "Edit", title: "Change what matters.", screenshot: "/landing/editor-select.webp", caption: "Selection + Replace instruction", },
  { id: "review", label: "Review", title: "See what actually changes.", screenshot: "/landing/editor-review.webp", caption: "Original + complete AI proposal", },
  { id: "export", label: "Keep", title: "Make it ready to use.", screenshot: "/landing/editor-finish.webp", caption: "Accepted edit + export", },
] as const;

export function EditorWalkthrough() {
  const rail = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const goTo = (index: number) => {
    const container = rail.current;
    const panel = container?.children[index] as HTMLElement | undefined;
    if (!container || !panel) return;
    container.scrollTo({ left: panel.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  const trackStep = () => {
    const container = rail.current;
    if (!container) return;
    const left = container.getBoundingClientRect().left;
    const distances = Array.from(container.children, panel => Math.abs(panel.getBoundingClientRect().left - left));
    setActive(distances.indexOf(Math.min(...distances)));
  };

  return (
    <section id="workflow" className={styles.horizontal} aria-labelledby="tour-title">
      <div className={styles.tourHeading}>
        <div><p className={styles.eyebrow}>INSIDE THE WORKSPACE</p><h2 id="tour-title">Follow the edit.</h2></div>
        <p>Move sideways through the actual workspace.<br />One portrait, four moments.</p>
      </div>
      <div className={styles.tourControls}>
        <div className={styles.stepLinks} aria-label="Choose a workspace step">{steps.map((step, index) => <button key={step.id} type="button" onClick={() => goTo(index)} aria-current={active === index ? "step" : undefined}>{step.label}</button>)}</div>
        <div className={styles.arrows}><button type="button" aria-label="Previous workspace step" disabled={active === 0} onClick={() => goTo(active - 1)}><ArrowLeft /></button><button type="button" aria-label="Next workspace step" disabled={active === steps.length - 1} onClick={() => goTo(active + 1)}><ArrowRight /></button></div>
      </div>
      <div ref={rail} className={styles.rail} role="region" aria-label="Horizontal editor walkthrough" tabIndex={0} onScroll={trackStep} onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        const destination = event.key === "ArrowRight" ? Math.min(active + 1, 3) : event.key === "ArrowLeft" ? Math.max(active - 1, 0) : event.key === "Home" ? 0 : event.key === "End" ? 3 : null;
        if (destination === null) return;
        event.preventDefault(); goTo(destination);
      }}>
        {steps.map(step => <figure key={step.id} className={styles.screen}>
          <Image src={step.screenshot} alt={`Actual Mirai workspace: ${step.caption}`} width={1440} height={900} sizes="(max-width: 760px) 90vw, 85vw" />
          <figcaption><h3>{step.title}</h3><span>{step.caption}</span></figcaption>
        </figure>)}
      </div>
      <p className={styles.tourStatus} aria-live="polite">{steps[active].label} — {steps[active].caption}</p>
    </section>
  );
}
