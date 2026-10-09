# Mirai Frontend Design Guide

This document is the durable design contract for Mirai's editor interface. Read it before changing layout, styling, interaction patterns, responsive behavior, or user-facing copy. Feature behavior remains authoritative in `FEATURE_CONTEXT.md`; implementation remains authoritative in source code and tests.

## Design thesis

Mirai is a **refined editorial image workspace** for ordinary users. It should feel focused and capable without resembling a professional suite full of floating palettes. The image is always the visual anchor; controls form a quiet, precise frame around it.

The visual signature is soft warm paper, charcoal canvas, and one sharp acid-lime action color. The interface uses quiet surface boundaries, readable typography, gently rounded controls, and deliberate spacing. The image-first shell and reversible editing model remain central to the design.

When making a design decision, prefer:

1. Image prominence over interface decoration.
2. One clear responsibility per surface.
3. Visible state over explanatory prose.
4. Borders, contrast, and spacing over floating cards.
5. Reversible review for generated proposals and reversible live drafts for deterministic edits.
6. Familiar interaction behavior with a distinctive visual treatment.

## Product interaction model

Generated edits use:

```text
Open image → choose tool → configure in inspector → act on canvas or generate → review → accept or discard
```

Direct deterministic edits use:

```text
Open image → choose tool → configure and manipulate live on canvas → apply or discard
```

The shell has five stable regions:

| Region | Role | Current measure |
|---|---|---|
| Header | Project commands, save, diagnostics, export | 64px high locally and in the cloud project toolbar |
| Tool rail | Select one editing workflow | 56px wide on desktop |
| Contextual inspector | Options for the selected workflow | 264px content beside the rail; 320px total sidebar |
| Canvas | Image interaction and proposal comparison | Receives all remaining space |
| Canvas status | Dimensions, zoom, active mode, history count | 32px high |

The rail chooses the workflow; the inspector configures it; the canvas performs or reviews it. Do not place the same primary action in multiple regions merely for visibility.

### Tool behavior

- Lasso owns selection construction and selection-based edits.
- Brush owns pending paint.
- Eraser corrects pending paint only.
- Hand owns navigation and removes the inspector because it has no settings.
- Create with AI, Select & edit, AI Transform, and AI Extend form one high-visibility group at the start of the rail. Select & edit uses the standard rail treatment and no AI marker because it combines local Recolor with AI Remove, Replace, and Restyle; each operation exposes its execution type in the inspector.
- Transform is image-wide but behaves as a first-class rail selection; its presets and controls live in the inspector.
- Size & position, Text, and Watermark are direct rail workflows. Their inspector settings update a source-space canvas draft immediately. The local editor offers Save edit / Discard changes / Keep editing when switching tools. In the cloud editor, changing tools, history versions, or in-app screens with a valid edit offers a save-first decision with Keep editing and no discard action; it continues only after the cloud save succeeds. Incomplete work stays in place or can be kept as a device draft when leaving the editor. Saving creates one accepted version without opening comparison.
- Every icon-only rail control must reveal its full name on hover and keyboard focus. Show its shortcut when one exists.
- Selecting a tool must not generate pixels, accept history, or trigger an external request by itself.

### Surface selection

Use the contextual inspector for persistent options belonging to a tool. Use the canvas for direct manipulation and review controls. Use the header only for project-wide commands. Use a drawer for supporting evidence such as diagnostics. Reserve a modal for a short, genuinely blocking decision that cannot coexist with the canvas; do not use a modal as a substitute for an inspector.

## Visual language

### Brand identity

- Use the approved transparent Mirai image-editor mark from `src/app/icon.png`; do not redraw it or place it inside another tile.
- In the application header, pair the mark with an uppercase, extra-bold Manrope `MIRAI` wordmark and the mono uppercase descriptor `IMAGE STUDIO`.
- On constrained widths, hide the wordmark before shrinking the mark or displacing project controls.

### Color

The canonical semantic tokens live in `src/app/globals.css`.

| Token | Value | Purpose |
|---|---:|---|
| `ink` | `#171714` | Primary text, selected tools, strongest actions |
| `paper` | `#faf9f6` | Main interface surface |
| `line` | `#deddd6` | Dividers and control boundaries |
| `muted` | `#6b6b62` | Secondary text and inactive icons |
| `accent` | `#ef4b32` | Errors, destructive emphasis, serious warnings |
| `acid` | `#d8f441` | Primary action, successful readiness, active highlight |

Supporting neutrals already used by the shell:

- `surface` / `#eeeee8`: recessed controls.
- `workspace` / `#e8e8e1`: canvas surround.
- `stage` / `#20211e`: canvas and review stage. A subtle 20px dot texture gives the editing stage depth; keep it behind the image and away from review results.
- Pale acid (`#edf5c4`): selected or ready informational state.
- Pale coral (`#ffd5cc`): error and blocked state.

Rules:

- Acid is scarce. Use it for the next meaningful action, active focus, or confirmed readiness—not as decoration.
- Coral communicates a problem or destructive consequence. Never use it as a neutral brand accent.
- Prefer semantic Tailwind tokens (`bg-ink`, `text-muted`) over new raw hex values.
- Add a global token only when a color has a repeated semantic role. A feature-specific image swatch may remain local.
- Do not introduce gradients into the application chrome. Gradients are acceptable inside image/style previews where they represent visual content.

### Typography

- **Manrope** is the interface and heading face.
- **DM Mono** is for metadata, shortcuts, IDs, counts, statuses, and compact uppercase labels.
- Headings are compact, bold, and slightly tightly tracked.
- Eyebrows and metadata use uppercase mono text with generous letter spacing.
- Sentence case is the default for buttons, labels, and explanations.

Typical scale:

| Use | Size |
|---|---:|
| Micro metadata / eyebrow | 9–10px mono |
| Supporting label | 11–12px |
| Control and body copy | 12–14px |
| Inspector heading | 16px bold |
| Product mark / major compact heading | 16px+ bold |

Small type is appropriate only for short interface metadata. Explanations, errors, and instructions must remain readable and use comfortable line height.

### Shape, depth, and texture

- Use 6–8px corners on buttons, fields, rail controls, and the canvas frame. Keep the shell and inspector sections adjoining and cardless; do not turn each group into a floating card. Sliders use circular handles and a rounded track.
- Use 1px borders and adjoining surfaces to establish structure.
- Use subtle shadows for elevated menus, tooltips, blocking dialogs, and evidence drawers. Dialog frames may use 12px corners; their controls retain the shared 6–8px treatment. The empty-state illustration may use a solid offset backing to suggest an image sheet; keep it separate from interactive chrome.
- Avoid soft, diffuse card shadows, glassmorphism, decorative blur, and purple/blue SaaS gradients.
- The image or generated result supplies visual richness. The surrounding interface should remain controlled.

### Spacing and sizing

Use a compact 4px-based rhythm. Common values are 4, 8, 12, 16, and 24px.

- Rail target: 44 × 44px inside a 56px rail, with 4px between tools.
- Local header icon target: 36 × 36px.
- Primary inspector action: 40px high and full width.
- Compact segmented control: 32–36px high.
- Inspector horizontal padding: 16px; heading vertical padding: 20px.
- Separate inspector groups with a top border and 12–16px vertical padding.

Maintain comfortable pointer targets even when the visible icon is 16–18px.

## Component patterns

### Tool rail

- AI workflows appear first with a pale acid surface and compact `AI` marker. Create with AI uses the solid acid treatment. Select & edit sits among them for workflow prominence but uses the standard rail treatment without an AI marker. Any selected workflow uses the standard selected ink surface with acid content.
- Inactive: muted icon on the paper rail.
- Hover: lighter surface and ink icon.
- Selected: ink surface with acid icon.
- Disabled: reduced opacity but retain the hover label so users can identify the control.
- Tooltip: ink background, paper text, optional acid shortcut, 6px corners, and a subtle shadow.
- Do not show two tools as selected. An image-wide workflow may preserve an underlying canvas mode internally, but only the visible workflow is highlighted.

### Contextual inspector

- Use a sticky heading followed by vertically stacked sections.
- Each section has a small mono label and is separated by a border, not a card container.
- Keep the primary action in a fixed footer so it remains available while options scroll.
- Keep configuration visible during processing and review, but prevent competing requests.
- Switching tools replaces the inspector content; do not accumulate permanent panels.
- Retain meaningful draft inputs through review and Adjust flows.

### Empty workspace

- Use a warm paper stage with a clear “Open an image” action and a quieter “Create with AI” action.
- Pair concise intake copy with a locally rendered landscape illustration at desktop widths. The illustration explains selection and review; it is decorative and never becomes an image version.
- Hide the illustration below 1024px to prioritize intake controls. On short screens, the empty stage may scroll internally while the application viewport stays locked.
- Keep file inputs keyboard accessible with a visible focus ring on their enclosing label. Both intake actions are disabled during project I/O.
- Cloud projects show a project-loading placeholder rather than local upload or AI creation commands.

### Buttons

| Priority | Treatment |
|---|---|
| Primary | Ink or acid fill, bold label, explicit hover inversion |
| Secondary | Transparent or paper surface, ink/muted text, visible hover surface |
| Destructive | Coral-tinted context; require an explicit text label |
| Icon-only | Fixed square target, accessible name, tooltip, focus ring |

Use verbs that describe the immediate result: “Generate preview,” “Apply paint,” “Accept edit,” “Discard.” Avoid vague labels such as “Continue” or “Done.”

### Inputs and option groups

- Use recessed neutral surfaces for text fields and selects.
- Use a visible ink focus ring on light surfaces and a paper or acid focus ring on dark surfaces. Coral is reserved for error states; it is no longer the default field focus or slider color.
- Use radio semantics for mutually exclusive presets and segmented controls.
- Selected options should change both contrast and structure; do not rely on color alone.
- Placeholder copy should demonstrate the expected input without becoming an instruction manual.

### Status and feedback

- Processing: keep layout stable, replace the action label, and show restrained motion.
- Ready/success: acid or pale-acid state.
- Warning: warm amber/brown text where the action may proceed.
- Error/block: coral edge or surface with an actionable recovery message.
- Disabled controls must explain themselves through nearby state, tooltip, or error text.
- Never advance history on failure or discard.
- A leave decision must say whether work is saved to the cloud or only kept as a device draft. A failed save keeps the user in the editor with a retry path.

### Product landing

- Lead with the actual Mirai workspace and an explicit AI image-editor headline. Keep the shared paper/ink palette, lime actions, fonts, and account-aware start action. Show the tool rail, inspector, and canvas together; use a creative sample image that supports the editing task. The workspace and start action appear in the first viewport on common desktop and phone sizes.
- Follow with the upload/create → edit → review → save/export workflow, complete toolset in divided rows, a real before/after editing example, project/export summary, native questions, and a final start action. Keep headings concrete and give each section one responsibility. Avoid oversized brand slogans, lifestyle-image heroes, moving slogan strips, repeated workspace screenshots, generic feature-card mosaics, invented social proof, and unsupported capability claims.
- Bundle purpose-created public artwork and actual workspace screenshots. Label illustrative input and real AI results accurately. A comparison changes browser presentation only; visiting the landing never buys provider work or creates project history. Keep customer images and account data out of marketing assets.
- Use native range and details/summary controls for keyboard-accessible exploration. Section links scroll within the public page; account-aware start links retain the existing eligibility destinations.
- Limit motion to brief entrances, small scroll reveals, and control hover/focus transitions. Keep the workspace screenshot stationary and defer 3D/depth treatments. Pause/resume controls and live reduced-motion preferences disable movement; static/no-JavaScript rendering keeps content visible. Keyboard focus reveals a pending section immediately.

### Account and project journey

- The product landing, sign-in, access status, welcome, administration, upload, and deletion receipt share the editor’s warm paper, Manrope/DM Mono typography, charcoal actions, acid emphasis, and softly rounded controls. Use `MiraiBrand` for the public/account identity and the shared `StudioIllustration` for the landscape motif. Illustration is decorative; it never becomes a project asset.
- Account screens use a light editorial introduction beside the form on desktop. Hide the illustration on phones, stack the content, and allow vertical scrolling. Long names and emails must wrap without hiding actions. Authentication, eligibility, allowances, and recovery stay authoritative on the server.
- The project shell has a 64px header and persistent Projects, Trash, and Settings navigation. Show active destinations; compact to accessible, named icons on narrow screens. Sign-out retains its device-draft cleanup.
- Library pages use a padded, centered content region. Image previews own the visual hierarchy, with one, two, or three columns by available width. A project is an interaction surface with an 8px corner and subtle border; do not add decorative dashboard cards. Keep search, sort, rename, pagination, load failure, thumbnail fallback, and empty states visible.
- Settings uses separated sections for profile, usage, data export, and deletion. Keep destructive actions visually distinct and preserve typed confirmation. Project rename, image export, save-first prompts, and device draft recovery use the same restrained modal treatment as the creation studio.
- Use the shared `workspace-action`, `workspace-quiet-action`, and `workspace-field` patterns for account/project controls. Forms have 44px targets, ink focus, and readable pending/error feedback. Copy explains the user’s next step without exposing database or provider implementation details.

### New project entry

- New project starts with two equally prominent choices: Upload an image to edit and Create an image with AI. Use two equally sized, rounded 12px interaction surfaces with quiet borders in the shared paper/ink visual system, side by side on desktop and stacked on mobile.
- Keep upload inputs inside the chosen upload flow. AI creation opens in Create Image mode; opening the studio never generates a result by itself. Show availability and member pricing beside the AI choice.
- Restore unfinished uploads before offering another starting point. Keep the recovery flow visible until it saves; a transfer cannot be replaced by another path. Closing the AI studio returns to the chooser.

### Cloud AI usage and recovery

- Keep the account balance and pending-credit state beside the active inspector and creation entry. Use plain copy: “25 AI credits shared across your projects” and “1 credit per generated preview.” State the one-time member policy in welcome/settings. Admin accounts show “Unlimited” for AI, projects and account storage, with no one-credit action prices; communicate service availability separately.
- Price the generation action before the click. Local Monochrome, deterministic tools and export remain usable when credits are exhausted or AI is off. Cached frame changes remain free; do not imply a fresh generation is free.
- Show processing and unknown outcomes separately. Unknown work has a pending credit and a short support reference, with no automatic repurchase. Offer saved-preview recovery without replacing another draft; preserve normal comparison and Save/Accept controls.
- Developer provider/scenario controls and disk diagnostics are absent in cloud mode. A cloud error must have a usable recovery path rather than a dead diagnostics button.

### Review

Review is a distinct dark stage owned by the canvas for generated proposals and explicitly reviewable local operations such as selection recolor. Show the comparison at the largest practical size. Accept, Discard, and feature-specific adjustment controls live with the preview. Fidelity or scope warnings must remain adjacent to those decisions. Do not route directly manipulated Text, Watermark, Crop, Resize, Rotate, or Flip drafts through this stage; they remain visible on the ordinary canvas and have a persistent Save/Discard inspector footer.

## Motion

In the editor and account flows, motion communicates a state transition. The public landing may use the controlled visual storytelling described above.

- Inspector entry: short fade with a 6px horizontal shift, approximately 160ms.
- Preview entry: subtle fade/scale, approximately 180ms.
- Loading: rotation or pulse only on the element communicating progress.
- Hover transitions: approximately 140ms for color, border, and opacity.
- Avoid springy movement, bouncing controls, and large parallax effects in the editor shell.
- Respect `prefers-reduced-motion`; global fallbacks already exist in `globals.css`.

## Responsive behavior

Desktop prioritizes a vertical rail, contextual inspector, and maximum canvas area. On narrow screens, the tool rail becomes horizontal below the canvas and the inspector occupies a bounded lower region of at most 40dvh or 320px. The canvas retains at least 180px including its status strip, even on short phone viewports.

- Preserve the same tool order and names across breakpoints.
- Tooltips move above horizontal rail icons and to the right of vertical rail icons.
- Never allow the inspector to push the canvas entirely off-screen.
- Keep primary review actions reachable without horizontal scrolling.
- Hide low-priority metadata before shrinking essential controls below usable sizes.
- Test both an empty workspace and an image-loaded workspace at mobile and desktop widths when changing shell geometry.

## Accessibility

- Every control needs an accessible name; icon-only controls also need a visible hover/focus label.
- Use native buttons, inputs, selects, and textareas whenever possible.
- Use `role="radio"` with `aria-checked` for custom exclusive choices.
- Focus indication must be visible against both paper and dark canvas surfaces.
- Do not encode selection, warning, or failure with color alone.
- Keep keyboard shortcuts inactive while the user types in an input, textarea, select, or editable region.
- Preserve logical tab order when visual layout changes responsively.
- Announce asynchronous processing and errors with appropriate status or alert semantics.

## Voice and copy

Mirai is direct, calm, and concrete.

- Name the object and outcome: “Transform the complete image.”
- Explain irreversible-looking actions in terms of the actual reversible model: “Review before history changes.”
- State provider cost or request implications before generation.
- Keep labels short; place nuance in one nearby sentence.
- Avoid hype, magic language, and unexplained AI terminology.
- Use “image,” “selection,” “preview,” “version,” and “history” consistently.

## Frontend architecture boundaries

- UI components collect intent and request domain transitions. They do not call image providers or write history directly.
- Authoritative editor state stays in the editor store; transient disclosure state may stay local to the owning component.
- Derive presentation phases from domain state instead of persisting duplicate UI state.
- Keep feature controls near their owning workflow component. Avoid generalized component registries until independent extension requires one.
- Reuse established components and interaction patterns before creating a new abstraction.
- Keep `data-testid` attributes on stable user outcomes, not styling details.

## Anti-patterns

Do not introduce:

- A duplicate entry point for the same primary workflow.
- A modal for controls that belong in the contextual inspector.
- Floating rounded cards for every section.
- New colors without a semantic purpose.
- Icon-only actions without full-name hover/focus labels.
- Permanent side panels for occasional supporting information.
- UI that hides the source or proposal when the user must make a visual decision.
- Animation that delays input or masks processing state.
- A visual redesign bundled into an unrelated feature.

## Frontend change workflow

Before implementation:

1. Read this guide, the affected `FEATURE_CONTEXT.md` entry, and the owning components/tests.
2. Identify the surface that owns the interaction: header, rail, inspector, canvas, drawer, or exceptional modal.
3. State any proposed departure from this guide and obtain approval if it changes the product's design direction.

During implementation:

1. Use existing tokens and sizing patterns.
2. Implement complete ready, hover, focus, disabled, processing, failure, and review states that apply.
3. Check desktop and narrow layouts.
4. Preserve domain and history boundaries.

Before delivery:

1. Run focused tests plus `npm run typecheck`, `npm run lint`, and `npm run build`.
2. Run the relevant Playwright workflow for user-visible interaction changes.
3. Verify accessible names and keyboard behavior.
4. Update this document only when the reusable design system changes; update `FEATURE_CONTEXT.md` when feature behavior changes.
5. Include design tradeoffs and known limitations in the handoff.

## Evolving the guide

This guide describes the implemented system, not a speculative redesign. Add a rule only after it is approved and represented in the product, or when it formalizes a clearly repeated existing pattern. When a deliberate new pattern supersedes an old one, update the guide and the relevant source in the same delivery unit.
