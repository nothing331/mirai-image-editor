"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./ProductLanding.module.css";

export function LandingComparison() {
  const [position, setPosition] = useState(72);
  return (
    <figure className={styles.comparison} data-reveal>
      <div className={styles.comparisonImage}>
        <Image
          src="/landing/mirai-portrait.webp"
          width={1024}
          height={1024}
          sizes="(max-width: 760px) 100vw, 65vw"
          alt="Original portrait created with Mirai"
        />
        <Image
          src="/landing/mirai-portrait-edit.webp"
          width={1024}
          height={1024}
          sizes="(max-width: 760px) 100vw, 65vw"
          alt="Mirai AI Transform proposal with charcoal ink, ivory paper, and lime sunglasses"
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        <span className={styles.compareLabel}>Original</span>
        <span className={`${styles.compareLabel} ${styles.compareLabelRight}`}>
          AI edit
        </span>
        <span
          className={styles.compareDivider}
          style={{ left: `${position}%` }}
          aria-hidden="true"
        >
          <span>↔</span>
        </span>
      </div>
      <figcaption className={styles.comparisonCaption}>
        <label htmlFor="landing-comparison">Slide to compare</label>
        <span>AI Transform · actual Mirai result</span>
      </figcaption>
      <input
        id="landing-comparison"
        type="range"
        min={0}
        max={100}
        value={position}
        aria-label="Compare original and AI edit"
        aria-valuetext={`${position}% original, ${100 - position}% AI edit`}
        onChange={(event) => setPosition(Number(event.target.value))}
        className={styles.comparisonSlider}
      />
    </figure>
  );
}
