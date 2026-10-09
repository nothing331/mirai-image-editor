"use client";

import Image from "next/image";
import { useState } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { creationExamples } from "./creation-examples";
import styles from "./ProductLanding.module.css";

export function CreationGallery() {
  const [selected, setSelected] = useState(creationExamples[0]);
  return (
    <div className={styles.creationGallery}>
      <div className={styles.exampleGrid} role="group" aria-label="Explore creation styles">
        {creationExamples.map((example, index) => (
          <button
            key={example.id}
            type="button"
            aria-pressed={selected.id === example.id}
            aria-controls="creation-prompt"
            aria-label={`Explore ${example.label} template`}
            className={styles.example}
            onClick={() => setSelected(example)}
          >
            <span className={styles.exampleImage}>
              <Image src={example.src} alt={example.alt} width={1024} height={1024} sizes="(max-width: 760px) 45vw, 23vw" />
              <span className={styles.exampleIcon} aria-hidden="true">
                {selected.id === example.id ? <Check /> : <ArrowUpRight />}
              </span>
            </span>
            <span className={styles.exampleLabel}><span>0{index + 1}</span>{example.label}</span>
            <span className={styles.exampleTitle}>{example.title}</span>
          </button>
        ))}
      </div>
      <div id="creation-prompt" className={styles.promptPanel}>
        <div><p className={styles.eyebrow}>THE STARTING PROMPT</p><h3 aria-live="polite">{selected.label} / Instagram Post</h3></div>
        <p>{selected.prompt}</p>
        <span>Created in Mirai · AI-generated example · 1024 × 1024</span>
      </div>
    </div>
  );
}
