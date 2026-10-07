"use client";

import Image from "next/image";
import { useState } from "react";
import styles from "./ProductLanding.module.css";

export function LandingComparison() {
  const [position, setPosition] = useState(58);
  return (
    <figure className={styles.comparison}>
      <div className={styles.comparisonImage}>
        <Image
          src="/landing/studio-scene.webp"
          width={1672}
          height={941}
          sizes="(max-width: 760px) 100vw, 65vw"
          alt="An orange lounge chair in a sunlit studio, compared with a monochrome version"
        />
        <Image
          src="/landing/studio-scene.webp"
          width={1672}
          height={941}
          sizes="(max-width: 760px) 100vw, 65vw"
          alt=""
          className={styles.monochrome}
          style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        />
        <span className={styles.compareLabel}>Original</span>
        <span className={`${styles.compareLabel} ${styles.compareLabelRight}`}>
          Monochrome
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
        <span>Local Monochrome · interactive example</span>
      </figcaption>
      <input
        id="landing-comparison"
        type="range"
        min={0}
        max={100}
        value={position}
        aria-label="Compare original and monochrome"
        aria-valuetext={`${position}% original, ${100 - position}% monochrome`}
        onChange={(event) => setPosition(Number(event.target.value))}
        className={styles.comparisonSlider}
      />
    </figure>
  );
}
