import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { MiraiBrand } from "@/shared/ui/MiraiBrand";
import { LandingComparison } from "./LandingComparison";
import styles from "./ProductLanding.module.css";

const tools = [
  {
    title: "Create your starting point",
    category: "CREATE WITH AI",
    description:
      "Describe a complete image, a transparent logo mark, or an icon. Choose a visual treatment and a format for where it’s going.",
    capabilities: [
      "Image generation",
      "Logo marks & icons",
      "Style treatments",
      "Social & thumbnail formats",
    ],
  },
  {
    title: "Edit just the part you mean",
    category: "SELECT & EDIT",
    description:
      "Draw a selection, refine its area, then recolor locally or ask AI to remove, replace, or restyle. Use protected mode when everything outside must stay exact.",
    capabilities: [
      "Recolor",
      "AI Remove · Replace · Restyle",
      "Add · subtract · invert",
      "Protected boundaries",
    ],
  },
  {
    title: "Try a whole new direction",
    category: "AI TRANSFORM",
    description:
      "Transform the full image with a preset or your own prompt. Choose Faithful, Balanced, or Imaginative preservation; use local Monochrome for a simple tonal change.",
    capabilities: [
      "Whole-image styles",
      "Custom prompts",
      "Preservation choices",
      "Local Monochrome",
    ],
  },
  {
    title: "Give your image more room",
    category: "AI EXTEND",
    description:
      "Preview a new aspect ratio, keep the full image or use a subject-aware frame, then generate the missing surroundings. Compare the complete proposal before saving.",
    capabilities: [
      "Aspect-ratio presets",
      "Smart framing",
      "Keep full image",
      "Adjust frame & review",
    ],
  },
  {
    title: "Finish the details by hand",
    category: "DIRECT TOOLS",
    description:
      "Crop, resize, rotate, and flip. Add text or a text/PNG watermark, paint with Brush, and use Eraser to correct pending paint. See direct changes on the canvas as you work.",
    capabilities: [
      "Crop · resize · rotate · flip",
      "Text & watermarks",
      "Brush & draft eraser",
      "Pan · zoom · reset",
    ],
  },
  {
    title: "Keep every project within reach",
    category: "PRIVATE WORKSPACE",
    description:
      "Save and reopen private projects. Find them by thumbnail, search, or sort; rename them, return to saved history, and recover matching drafts stored on this device.",
    capabilities: [
      "Private projects & originals",
      "Search · sort · rename",
      "Undo · redo · history",
      "Device drafts & AI result recovery",
    ],
  },
];

const questions = [
  {
    question: "What happens to my original image?",
    answer:
      "It stays untouched. Every accepted edit creates a separate saved image version. Undo, redo, Original, and history let you return to earlier versions. A failed or discarded edit does not advance your accepted history. Saved edits are flattened image versions rather than separately editable layers.",
  },
  {
    question: "Does a selection keep everything outside unchanged?",
    answer:
      "For generative edits, the default selection is a focus hint. You review the complete AI proposal, including any changes outside it. Turn on protected mode when pixels outside the effective edit mask must remain exact. Local selection edits preserve pixels outside their mask.",
  },
  {
    question: "What can I upload and export?",
    answer:
      "Start a cloud project with a PNG or JPEG up to 10 MiB and 2,048 pixels per edge. Export the accepted version as PNG or JPEG at its saved dimensions, choose a filename and JPEG background, or download the exact uploaded original. Export never asks the image model to generate again.",
  },
  {
    question: "How do private-beta access and AI credits work?",
    answer:
      "Sign in with Google, then use an invitation or request owner approval. Approved members receive 25 one-time welcome AI credits shared across up to 5 active projects. Each generated preview uses 1 credit; accepting or discarding it does not refund that credit. Local edits and export use no credits. Credits do not reset monthly. Admin accounts have unlimited account allowances; service availability still applies.",
  },
  {
    question: "What if an upload, generation, or save is interrupted?",
    answer:
      "Unfinished uploads can be resumed in the same account and tab session. Cloud saves keep the proposed edit available for retry until confirmed. Matching browser drafts can be restored on the same device, and stored AI results can be reviewed without buying the same preview again while recovery remains available. Closing a tab does not cancel an AI request.",
  },
  {
    question: "Can I manage or download my account data?",
    answer:
      "Settings lets you change your display name, check project/storage/AI usage, prepare a private data archive, or request account deletion after a recent sign-in. Projects moved to Trash can be restored for 30 days; permanent deletion cannot be undone. Trashed projects continue to use storage until removal finishes.",
  },
  {
    question: "Is there also a local development workspace?",
    answer:
      "Yes. When Mirai runs with authentication disabled, its local workspace supports local project persistence and developer request diagnostics, including prompts, previews, masks, and provider response evidence. That development mode is separate from the private cloud product and is intended for trusted local use.",
  },
];

interface ProductLandingProps {
  destination: string;
  action: string;
  access: string;
}

export function ProductLanding({
  destination,
  action,
  access,
}: ProductLandingProps) {
  return (
    <main className={`public-page account-surface ${styles.page}`}>
      <a href="#landing-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <MiraiBrand />
        <nav aria-label="Landing navigation" className={styles.navigation}>
          <a href="#features">The tools</a>
          <a href="#workflow">How it works</a>
          <a href="#questions">Questions</a>
        </nav>
        <Link href={destination} className={styles.headerAction}>
          Open Mirai
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </header>

      <section
        id="landing-content"
        className={styles.hero}
        aria-labelledby="landing-title"
      >
        <Image
          src="/landing/studio-scene.webp"
          alt="A sculptural orange chair beside a sunlit arch overlooking olive hills"
          fill
          sizes="100vw"
          preload
          className={styles.heroImage}
        />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>A REVERSIBLE AI IMAGE STUDIO</p>
          <p className={styles.heroWordmark} aria-hidden="true">
            MIRAI
          </p>
          <h1 id="landing-title">
            Edit boldly.
            <br />
            Keep the original.
          </h1>
          <p className={styles.heroDescription}>
            From a small refinement to a whole new direction. Create, edit, and
            keep every version yours.
          </p>
          <div className={styles.heroActions}>
            <Link href={destination} className="workspace-action">
              {action}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <a href="#features" className={styles.explore}>
              Explore the tools
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          </div>
          <p className={styles.heroAccess}>
            <span aria-hidden="true" />
            Private beta · <span>{access}</span>
          </p>
        </div>
        <p className={styles.heroCaption}>ONE IMAGE. ROOM TO EXPLORE.</p>
      </section>

      <section
        id="workflow"
        className={styles.workflow}
        aria-labelledby="workflow-title"
      >
        <div className={styles.sectionLabel}>
          <span>01 / THE FLOW</span>
          <h2 id="workflow-title">An idea in. Your image out.</h2>
        </div>
        <ol>
          {[
            [
              "Start",
              "Upload a PNG or JPEG, or create an image, icon, or logo mark with AI.",
            ],
            [
              "Edit",
              "Select a detail, change the whole image, or finish it with direct tools.",
            ],
            [
              "Review",
              "Compare AI proposals. Keep what works and discard what doesn’t.",
            ],
            [
              "Keep",
              "Save a new version, revisit your history, and export when you’re ready.",
            ],
          ].map(([title, description], index) => (
            <li key={title}>
              <span className={styles.stepNumber}>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.reviewSection} aria-labelledby="review-title">
        <div className={styles.reviewIntroduction}>
          <p className={styles.eyebrow}>02 / BUILT TO BE REVERSIBLE</p>
          <h2 id="review-title">
            Every edit.
            <br />A way back.
          </h2>
          <p>
            Explore a result before it becomes part of your image. Your original
            is always there, and every accepted change gets its own version.
          </p>
          <ul>
            <li>
              <Check aria-hidden="true" />
              Compare before accepting AI edits
            </li>
            <li>
              <Check aria-hidden="true" />
              Undo, redo, or return to the original
            </li>
            <li>
              <Check aria-hidden="true" />
              Keep failed and discarded edits out of history
            </li>
          </ul>
          <p className={styles.smallNote}>
            Try the example. Move the slider to see both sides.
          </p>
        </div>
        <LandingComparison />
      </section>

      <section
        id="features"
        className={styles.toolkit}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>03 / THE COMPLETE TOOLSET</p>
          <h2 id="features-title">
            From first idea
            <br />
            to final image.
          </h2>
          <p>
            AI when you want a new possibility.
            <br />
            Direct controls when you know the change.
          </p>
        </div>
        <div className={styles.toolList}>
          {tools.map((tool, index) => (
            <article key={tool.category}>
              <div className={styles.toolHeading}>
                <span>0{index + 1}</span>
                <p className={styles.eyebrow}>{tool.category}</p>
              </div>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              <ul>
                {tool.capabilities.map((capability) => (
                  <li key={capability}>{capability}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section
        className={styles.workspaceSection}
        aria-labelledby="workspace-title"
      >
        <div className={styles.workspaceHeading}>
          <p className={styles.eyebrow}>04 / A FOCUSED WORKSPACE</p>
          <h2 id="workspace-title">The image takes center stage.</h2>
          <p>
            A canvas, a tool rail, and the options you need. Move between
            creation, precise edits, comparison, and saved history in one place.
          </p>
        </div>
        <figure className={styles.workspacePreview}>
          <Image
            src="/landing/editor-workspace.webp"
            width={1440}
            height={900}
            sizes="(max-width: 760px) 100vw, 90vw"
            alt="Mirai’s editor with the studio image on its canvas and selection tools beside it"
          />
          <figcaption>Mirai workspace · example project</figcaption>
        </figure>
        <div className={styles.exportRow}>
          <div>
            <p className={styles.eyebrow}>READY TO TAKE IT WITH YOU</p>
            <h3>Your image. Your files.</h3>
          </div>
          <p>
            Export PNG or JPEG without another AI call. Download your exact
            original, or prepare an archive of your account’s projects, files,
            and saved versions.
          </p>
          <span>PNG / JPEG / ORIGINAL / DATA ARCHIVE</span>
        </div>
      </section>

      <section
        id="questions"
        className={styles.faq}
        aria-labelledby="questions-title"
      >
        <div>
          <p className={styles.eyebrow}>05 / BEFORE YOU START</p>
          <h2 id="questions-title">A few good questions.</h2>
          <p>Clear boundaries make it easier to explore.</p>
        </div>
        <div className={styles.questions}>
          {questions.map(({ question, answer }) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="get-started-title">
        <div>
          <p className={styles.eyebrow}>MAKE ROOM FOR YOUR NEXT IDEA</p>
          <h2 id="get-started-title">
            Start with an image.
            <br />
            See where it goes.
          </h2>
        </div>
        <div>
          <Link href={destination} className={styles.finalAction}>
            Get started
            <ArrowUpRight className="size-5" aria-hidden="true" />
          </Link>
          <p>Private beta. New accounts need an invitation or approval.</p>
          <span>
            <ShieldCheck className="size-4" aria-hidden="true" />
            Your original stays untouched.
          </span>
        </div>
      </section>
      <footer className={styles.footer}>
        <MiraiBrand />
        <p>CREATE / EDIT / REVIEW / KEEP</p>
        <a href="#landing-content">Back to top ↑</a>
      </footer>
    </main>
  );
}
