import Image from "next/image";
import localFont from "next/font/local";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { MiraiBrand } from "@/shared/ui/MiraiBrand";
import { CreationGallery } from "./CreationGallery";
import { creationExamples } from "./creation-examples";
import { LandingComparison } from "./LandingComparison";
import { LandingMotionControls } from "./LandingMotionControls";
import styles from "./ProductLanding.module.css";

const displayFont = localFont({
  src: "./fonts/bricolage-grotesque.woff2",
  variable: "--font-landing-display",
  weight: "400 800",
  display: "swap",
});
const bodyFont = localFont({
  src: "./fonts/dm-sans.woff2",
  variable: "--font-landing-body",
  weight: "400 700",
  display: "swap",
});

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
      "Sign in with Google and request owner approval, or open your emailed invitation link, sign in with its matching Google email, and accept the invitation. Approved members receive 25 one-time welcome AI credits shared across up to 5 active projects. Each generated preview uses 1 credit; accepting or discarding it does not refund that credit. Local edits and export use no credits. Credits do not reset monthly. Admin accounts have unlimited account allowances; service availability still applies.",
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
  signedOut: boolean;
  destination: string;
  action: string;
  access: string;
}

export function ProductLanding({
  signedOut,
  destination,
  action,
  access,
}: ProductLandingProps) {
  return (
    <main
      className={`public-page account-surface ${displayFont.variable} ${bodyFont.variable} ${styles.page}`}
      data-motion="static"
    >
      <a href="#landing-content" className={styles.skipLink}>
        Skip to content
      </a>
      <header className={styles.header}>
        <MiraiBrand />
        <nav aria-label="Landing navigation" className={styles.navigation}>
          <a href="#templates">Creation styles</a>
          <a href="#workflow">The editor</a>
          <a href="#invitation">Early access</a>
        </nav>
        <div className={styles.headerActions}>
          <LandingMotionControls />
          <Link href={signedOut ? "/sign-in?next=/projects" : destination} className={styles.headerAction}>
            {signedOut ? "Sign in" : "Open Mirai"}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </header>

      <section id="landing-content" className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}><span className={styles.statusDot} /> AI IMAGE STUDIO / INVITATION LAUNCH</p>
          <h1 id="landing-title" aria-label="Create. Edit. Make it yours."><span>Create. <em>Edit.</em></span><span>Make it<br />yours.</span></h1>
          <p className={styles.heroDescription}>
            Turn a prompt into an image. Change a detail, try a new style,
            and keep every version. This is your space to make something unexpected.
          </p>
          <div className={styles.heroActions}>
            <Link href={destination} className={styles.primaryAction}>
              {action}<ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <a href="#invitation" className={styles.invitationLink}>I have an invitation <ArrowUpRight className="size-4" aria-hidden="true" /></a>
          </div>
          <p className={styles.heroAccess}>{access}. A Google account is required.</p>
          <a href="#features" className={styles.explore}>Explore the tools <ArrowDown className="size-4" aria-hidden="true" /></a>
        </div>
        <div className={styles.heroArt} aria-label="Images created with Mirai">
          {[creationExamples[0], creationExamples[1], creationExamples[3], creationExamples[2]].map((example, index) => (
            <a key={example.id} href="#templates" className={styles.heroArtwork} data-art={index} aria-label={`See ${example.label} creation example`}>
              <Image src={example.src} alt={example.alt} width={1024} height={1024} sizes="(max-width: 760px) 45vw, 30vw" preload={index === 0} />
              <span>{example.label}<ArrowUpRight className="size-3" aria-hidden="true" /></span>
            </a>
          ))}
          <p className={styles.heroArtCaption}>A FEW IDEAS. ALL MADE IN MIRAI.</p>
        </div>
      </section>

      <section id="templates" className={styles.templates} aria-labelledby="templates-title">
        <div className={styles.sectionHeading} data-reveal>
          <p className={styles.eyebrow}>01 / CREATE WITH AI</p>
          <h2 id="templates-title">One idea.<br />So many directions.</h2>
          <p>Explore a style. See its starting prompt.<br />These are real images created with Mirai.</p>
        </div>
        <CreationGallery />
      </section>

      <section
        id="workflow"
        className={styles.workflow}
        aria-labelledby="workflow-title"
      >
        <div className={styles.sectionLabel} data-reveal>
          <span>02 / THE EDITOR</span>
          <h2 id="workflow-title">One workspace, from start to export.</h2>
        </div>
        <figure className={styles.workspacePreview} data-reveal>
          <Image src="/landing/editor-portrait.webp" width={1440} height={900} sizes="(max-width: 760px) 95vw, 90vw" alt="Mirai’s actual editor with its AI-created portrait and a selected area ready to edit" />
          <figcaption><span>ACTUAL MIRAI WORKSPACE / SELECT & EDIT</span><span>Generate a preview. Compare it. Keep what works.</span></figcaption>
        </figure>
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
            <li
              key={title}
              data-reveal
              style={{ transitionDelay: `${index * 70}ms` }}
            >
              <span className={styles.stepNumber}>0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        id="features"
        className={styles.toolkit}
        aria-labelledby="features-title"
      >
        <div className={styles.sectionHeading} data-reveal>
          <p className={styles.eyebrow}>03 / YOUR EDITING TOOLS</p>
          <h2 id="features-title">
            Tools for every
            <br />
            part of your edit.
          </h2>
          <p>
            AI when you want a new possibility.
            <br />
            Direct controls when you know the change.
          </p>
        </div>
        <div className={styles.toolList}>
          {tools.map((tool, index) => (
            <article
              key={tool.category}
              data-reveal
              style={{ transitionDelay: `${(index % 2) * 80}ms` }}
            >
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

      <section className={styles.reviewSection} aria-labelledby="review-title">
        <div className={styles.reviewIntroduction} data-reveal>
          <p className={styles.eyebrow}>04 / REVIEW & HISTORY</p>
          <h2 id="review-title">
            Compare before
            <br />you accept.
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
        className={styles.workspaceSection}
        aria-labelledby="workspace-title"
      >
        <div className={styles.workspaceHeading} data-reveal>
          <p className={styles.eyebrow}>05 / PROJECTS & EXPORT</p>
          <h2 id="workspace-title">Save your work. Export your image.</h2>
          <p>
            Reopen private projects, return to saved versions, and pick up where
            you left off. Export the accepted image when you’re ready.
          </p>
        </div>
        <div className={styles.exportRow} data-reveal>
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
        <div data-reveal>
          <p className={styles.eyebrow}>06 / BEFORE YOU START</p>
          <h2 id="questions-title">Before you start.</h2>
          <p>Clear boundaries make it easier to explore.</p>
        </div>
        <div className={styles.questions}>
          {questions.map(({ question, answer }) => (
            <details key={question} data-reveal>
              <summary>
                {question}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="invitation" className={styles.finalCta} aria-labelledby="get-started-title">
        <div data-reveal>
          <p className={styles.eyebrow}>INVITATION LAUNCH / EARLY ACCESS</p>
          <h2 id="get-started-title">Your next idea<br />starts here.</h2>
          <p>Mirai is opening by invitation. Request access, or use the invitation link sent to your email.</p>
        </div>
        <div className={styles.invitationOptions}>
          <div>
            <h3>New to Mirai?</h3>
            <p>Sign in with Google, then send an access request. You can check its status while you wait for approval.</p>
            <Link href={destination} className={styles.finalAction}>{signedOut ? "Request early access" : "Continue to Mirai"}<ArrowUpRight className="size-5" aria-hidden="true" /></Link>
          </div>
          <div>
            <h3>Already have an invitation?</h3>
            <p>Open your emailed invitation link, sign in with the Google email it was sent to, then choose Accept invitation.</p>
            <Link href={signedOut ? "/sign-in?next=/projects" : destination} className={styles.existingAccount}>{signedOut ? "Sign in to your account" : "Open Mirai"}<ArrowUpRight className="size-4" aria-hidden="true" /></Link>
          </div>
          <span><ShieldCheck className="size-4" aria-hidden="true" />Your original stays untouched.</span>
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
