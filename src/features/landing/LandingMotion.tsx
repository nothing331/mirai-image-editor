"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";

const motionPreference = "(prefers-reduced-motion: reduce)";

function subscribeToMotionPreference(onChange: () => void) {
  const preference = window.matchMedia(motionPreference);
  preference.addEventListener("change", onChange);
  return () => preference.removeEventListener("change", onChange);
}

export function LandingMotion() {
  const marker = useRef<HTMLSpanElement>(null);
  const reduced = useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(motionPreference).matches,
    () => true,
  );

  useEffect(() => {
    const surface = marker.current?.closest("main");
    if (!surface) return;
    surface.dataset.motion = reduced ? "static" : "running";
    if (reduced || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement;
          if (!entry.isIntersecting) continue;
          target.dataset.revealState = "visible";
          observer.unobserve(target);
        }
      },
      { root: surface, threshold: 0.12, rootMargin: "0px 0px -24px 0px" },
    );

    const surfaceBounds = surface.getBoundingClientRect();
    surface.querySelectorAll<HTMLElement>("[data-reveal]").forEach((target) => {
      if (target.dataset.revealState === "visible") return;
      const bounds = target.getBoundingClientRect();
      if (bounds.top < surfaceBounds.bottom - 24) {
        target.dataset.revealState = "visible";
      } else {
        target.dataset.revealState = "pending";
        observer.observe(target);
      }
    });

    // Keyboard navigation must never land on an element waiting for a reveal.
    const revealFocusedContent = (event: FocusEvent) => {
      if (!(event.target as HTMLElement).matches(":focus-visible")) return;
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-reveal]",
      );
      if (!target) return;
      target.dataset.revealState = "focused";
      observer.unobserve(target);
    };
    surface.addEventListener("focusin", revealFocusedContent);
    return () => {
      observer.disconnect();
      surface.removeEventListener("focusin", revealFocusedContent);
    };
  }, [reduced]);
  return <span ref={marker} hidden aria-hidden="true" />;
}
