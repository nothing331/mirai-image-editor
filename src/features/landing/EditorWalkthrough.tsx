"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./EditorWalkthrough.module.css";

const steps = [
  { id: "start", label: "Start", title: "Start with an idea.", description: "Generate an image or bring your own. This portrait was created in Mirai.", screenshot: "/landing/editor-original.webp", caption: "The starting image", },
  { id: "select", label: "Edit", title: "Change what matters.", description: "Select the glasses. Ask for polished chrome instead of lime. Give the image a direction.", screenshot: "/landing/editor-select.webp", caption: "Selection + Replace instruction", },
  { id: "review", label: "Review", title: "See what actually changes.", description: "Lime becomes chrome. Compare the complete AI proposal before accepting it, or discard it and try again.", screenshot: "/landing/editor-review.webp", caption: "Original + complete AI proposal", },
  { id: "export", label: "Keep", title: "Make it ready to use.", description: "Accept the edit as a new version, then export. Your original stays available in history.", screenshot: "/landing/editor-finish.webp", caption: "Accepted edit + export", },
] as const;

function StepVisual({ index }: { index: number }) {
  if (index === 1) return <Image className={styles.editorImage} src={steps[1].screenshot} alt="Actual Mirai editor with the glasses selected and a chrome replacement prompt" width={1440} height={900} sizes="(max-width: 760px) 90vw, 44vw" />;
  if (index === 2) return (
    <div className={styles.resultPair}>
      <figure><Image src="/landing/mirai-portrait.webp" alt="Before: the AI-created portrait with lime glasses" width={1024} height={1024} sizes="(max-width: 760px) 42vw, 22vw" /><figcaption>Before</figcaption></figure>
      <figure><Image src="/landing/mirai-portrait-chrome.webp" alt="After: Mirai replaced the lime glasses with polished chrome glasses" width={1024} height={1024} sizes="(max-width: 760px) 42vw, 22vw" /><figcaption>After</figcaption></figure>
    </div>
  );
  return <>
    <Image className={styles.portrait} src={index === 0 ? "/landing/mirai-portrait.webp" : "/landing/mirai-portrait-chrome.webp"} alt={index === 0 ? "Starting portrait generated in Mirai" : "Accepted Mirai edit exported as a square PNG"} width={1024} height={1024} sizes="(max-width: 760px) 80vw, 35vw" />
    <span className={styles.imageNote}>{index === 0 ? "Editorial portrait / lime glasses" : <><Download aria-hidden="true" /> PNG · 1024 × 1024</>}</span>
  </>;
}

export function EditorWalkthrough() {
  const rail = useRef<HTMLDivElement>(null);
  const parallax = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const section = parallax.current;
    const surface = section?.closest("main");
    if (!section || !surface) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const visuals = Array.from(section.querySelectorAll<HTMLElement>("[data-parallax-visual]"));
    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = surface.getBoundingClientRect();
      for (const visual of visuals) {
        if (preference.matches || surface.clientWidth <= 900) {
          visual.style.removeProperty("--scroll-drift");
          continue;
        }
        const bounds = visual.parentElement!.getBoundingClientRect();
        const distance = (bounds.top + bounds.height / 2 - viewport.top - viewport.height / 2) / viewport.height;
        visual.style.setProperty("--scroll-drift", `${Math.max(-32, Math.min(32, distance * -48))}px`);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    surface.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    preference.addEventListener("change", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      surface.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      preference.removeEventListener("change", schedule);
    };
  }, []);

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

  return <>
    <section id="workflow" className={styles.workflow} aria-labelledby="workflow-title">
      <div className={styles.introduction} data-reveal>
        <p className={styles.eyebrow}>THE EDITOR</p>
        <h2 id="workflow-title">One image.<br />A direction of your own.</h2>
        <p>A real edit, from the first image to the file you keep.<br />The change: lime glasses → polished chrome.</p>
      </div>
      <ol className={styles.visualSteps}>
        {steps.map((step, index) => <li key={step.id} data-reveal>
          <div className={styles.visual}><StepVisual index={index} /></div>
          <div className={styles.stepCopy}><span>{step.label}</span><h3>{step.title}</h3><p>{step.description}</p></div>
        </li>)}
      </ol>
      <p className={styles.boundaryNote}>Real Mirai output. AI selections are a focus hint; review the whole proposal. Use protected mode when pixels outside the selection must stay exact.</p>
    </section>

    <section id="workspace-tour" className={styles.horizontal} aria-labelledby="tour-title">
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

    <section ref={parallax} id="edit-story" className={styles.vertical} aria-labelledby="story-title">
      <div className={styles.storyHeading}><p className={styles.eyebrow}>FROM IDEA TO IMAGE</p><h2 id="story-title">Take it a little further.</h2><p>Follow the same edit, one moment at a time.</p></div>
      {steps.map((step, index) => <article key={step.id} className={styles.parallaxStep}>
        <div className={styles.storyCopy}><span>{step.label}</span><h3>{step.title}</h3><p>{step.description}</p></div>
        <div data-parallax-visual className={styles.parallaxVisual}><StepVisual index={index} /></div>
      </article>)}
    </section>
  </>;
}
