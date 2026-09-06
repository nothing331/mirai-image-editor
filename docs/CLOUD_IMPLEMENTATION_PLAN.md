# Mirai cloud product implementation plan

**Status:** User decisions recorded; remaining clarifications are identified below. Planning only in this task; no application implementation or deployment has started.
**Prepared:** 6 September 2026.
**Repository baseline reviewed:** `aa2ef76`.
**Goal:** Turn Mirai into a private, multi-user image editor with accounts, multiple projects, durable history, and export, while keeping the initial infrastructure bill as close to zero as practical.

This plan covers the first invited cloud beta and the gates for a wider launch. It includes UI, backend work, refactoring, infrastructure, cost controls, operations, tests, and unresolved product decisions. Provider limits are dated observations; application limits below are proposals, not existing functionality.

The earlier [product journey](../CLOUD_PRODUCT_JOURNEY.md) remains a discussion draft. This document refines it into delivery units. [PROJECT.md](../PROJECT.md) and [FEATURE_CONTEXT.md](../FEATURE_CONTEXT.md) continue to describe the existing architecture and implemented behavior; the completed local milestones in [LOCAL_DEVELOPMENT_PLAN.md](../LOCAL_DEVELOPMENT_PLAN.md) are not cloud-release milestones.

## Contents

1. [Scope and decisions](#1-scope-and-decisions)
2. [Current-code gap analysis](#2-current-code-gap-analysis)
3. [Complete user journeys](#3-complete-user-journeys)
4. [UI inventory and state requirements](#4-ui-inventory-and-state-requirements)
5. [Backend responsibilities and refactoring](#5-backend-responsibilities-and-refactoring)
6. [Critical data and failure flows](#6-critical-data-and-failure-flows)
7. [Deployment and environment plan](#7-deployment-and-environment-plan)
8. [Cost and capacity plan](#8-cost-and-capacity-plan)
9. [Operations and miscellaneous requirements](#9-operations-and-miscellaneous-requirements)
10. [Implementation sequence and delivery units](#10-implementation-sequence-and-delivery-units)
11. [Verification and release gates](#11-verification-and-release-gates)
12. [Plan audit and residual uncertainties](#12-plan-audit-and-residual-uncertainties)

## 1. Scope and decisions

### 1.1 First release

One account owns one personal project library. One project contains one original image and one linear editing history. Different versions may have different dimensions. Users can upload or generate an original, edit, accept or discard, undo/redo, leave, return, and export.

The first beta includes authentication, project listing and search, naming, private assets, durable accepted history, save recovery, AI allowances, trash/restore, account deletion, basic account data export, and operational recovery. No team-membership schema is required for personal ownership; add it with an approved teams feature.

The following are explicitly deferred: public sharing, teams, folders, comments, multi-image projects, independently editable layers, branching history, permanent generation galleries, batch processing, offline-first editing, native mobile apps, payments, and a full operator dashboard. A small owner-only invitation/access-request approval surface is included. Browser draft caching is included and does not imply offline synchronization. Project duplication is a later feature; its eventual first form should start a new project from the selected accepted image rather than silently clone an entire history.

### 1.2 Recommended deployment shape

```text
Browser: public pages, login, project library, existing editor
    |
    +-- Supabase Auth: identity and sessions
    |
    +-- Next.js on Render: authenticated application commands
            |
            +-- Supabase PostgreSQL: ownership, projects, history, usage
            +-- Private Supabase Storage: originals, versions, masks, temporary results
            +-- Existing AI adapters: controlled provider calls

Browser <--> short-lived, authorized Supabase Storage transfers
Maintenance workflow --> database + object storage directly
```

Keep the Next.js modular monolith. Do not split frontend and backend into different applications merely to deploy. Do not introduce Redis or a general job platform unless the reliability measurements require one.

### 1.3 Decision record after user review

The user's answers are matched by meaning where the later numbering shifted. Approved choices below replace the earlier defaults; clarification-needed items are not silently treated as approved. Other numeric capacity/retention proposals remain proposals unless explicitly approved here.

| ID | Decision | User direction / status | Consequence / remaining clarification |
|---|---|---|---|
| D01 | Initial audience | Approved with change: owner invitations or owner-approved access requests; no fixed user-count ceiling | Owner may approve as many users as wanted. Infrastructure/AI resource budgets remain separate from invitation count. |
| D02 | Identity | Approved: Google sign-in through Supabase | No password/email-login flow in the initial scope. |
| D03 | Ownership | Approved: personal ownership, one image-editing journey per project | No teams or multiple canvases per project initially. |
| D04 | Services | Approved with change: Render web service plus Supabase Auth/Postgres/Storage on the Free plan; R2 rejected because activation requires a billable subscription/payment method | Exact runtime and 1 GB storage-envelope suitability still need P01 evidence. Reassess object storage before expansion rather than silently enabling billing. |
| D05 | Saving | Approved: automatically persist accepted edits, renames, and history-pointer changes | Browser-cached drafts must not be labelled cloud-saved. |
| D06 | Temporary state | Approved with change: keep unfinished drafts and selections in the user's browser cache | Add bounded browser draft recovery, separate from accepted cloud history; cache retention/eviction details are implementation proposals. |
| D07 | History | Approved: linear history and the proposed non-destructive original navigation | Original selection preserves redo until a new accepted edit replaces the future. |
| D08 | Concurrent editing | Dedicated multi-session conflict handling deferred at user's request | No conflict-resolution UI, collaboration or device synchronization feature. Atomic saves and valid input-version checks remain necessary to preserve the existing history contract. |
| D09 | Project deletion | Approved: seven-day trash | Restore during retention; physical cleanup releases storage. |
| D10 | AI eligibility and allowance | Approved: invited/owner-approved users receive an allowance of five AI images; others cannot use AI tools | Clarify whether five is lifetime or recurring, and whether AI editing shares it. No automatic replenishment or extra AI allowance is approved yet. |
| D11 | Long AI requests | Approved: start with request-bound generation; revisit background processing only if needed | Keep durable status/results and test the host; a background worker is not part of the initial scope. |
| D12 | Local data migration | User says old local projects are mostly tests and need not be carried over | Omit import/migration tooling from initial scope; leave local files untouched. |
| D13 | Browser support | Approved: desktop editor with responsive account, library and invitation/access-request pages | Users can request access from phones; owner invitation/approval controls should also work on narrow screens. A mobile editor/app remains deferred. |
| D14 | Source fidelity | Approved: preserve exact original file bytes and retain source-size editing; no lower-resolution working-copy/upscale workflow | Normalization preserves dimensions except deliberate geometry edits. Existing provider input preparation is separate from working-canvas resolution. |

Other release decisions: public operator name/contact, intended geography and audience, account-data retention, global AI funding, the storage service required beyond the zero-billing beta, and the supported image envelope. Decisions about privacy wording and legal applicability must be resolved before publishing those promises.

**P00 status:** product direction agreed; proceed to P01. Source-size editing is confirmed, D11/D13 are approved and D08 remains deferred. Carry forward D10 allowance coverage/renewal to the AI allowance delivery before activation; it does not block infrastructure testing. The repository documentation conflicts identified in section 2 remain a tracked documentation task, not a completed reconciliation. Approval of choices does not mean their features already exist.

If email/password is chosen instead of D02, add a separate authentication delivery with sign-up, verification/resend and expiry, login, forgot/reset password, change password, account-enumeration-safe errors, resend throttling, transactional-email setup and deliverability tests. If Clerk is selected, replace the Supabase-auth integration with Clerk session validation and a deliberate identity-to-Postgres ownership integration; do not add both identity systems accidentally. These alternatives are recorded, not included in the Google-only beta implementation scope.

## 2. Current-code gap analysis

The following findings are from source inspection, not assumptions based on the README alone.

| ID | Current implementation | Cloud gap and planned response |
|---|---|---|
| G01 | `src/app/page.tsx` opens `EditorWorkspace` directly | Add public/account/library routes and an owned project URL. |
| G02 | `globals.css` applies `overflow: hidden` to the entire document | Scope fixed-height overflow to the editor; landing, settings, and legal pages must scroll. |
| G03 | Fonts load from a Google Fonts CSS import | Decide local font hosting; verify licenses, load readiness, and text rasterization consistency. |
| G04 | `WorkspaceHeader.tsx` has manual Save, a saved-project select, debug IDs, Diagnostics, and Reset | Replace local-project controls with navigation/save status/history/account controls; gate developer surfaces. |
| G05 | `EditorWorkspace.tsx` handles project I/O and browser paid-call confirmations | Extract cloud project lifecycle and access/capability state; keep component intent separate from persistence. |
| G06 | `project-client.ts` uploads the full snapshot, image data URLs, and numeric mask arrays on every save | Incremental asset transfer and typed metadata commands; no repeatedly uploading old versions. |
| G07 | Reopening decodes all saved images and overlays using `Promise.all` | Load current image first; use bounded lazy version/mask caches. |
| G08 | `project-repository.ts` exports an in-memory SQLite database to local files | Introduce transactional Postgres repositories and private Supabase Storage; local disk is not a cloud source of truth. |
| G09 | Project GET/POST routes have no identity/ownership checks; POST casts weakly validated snapshots | Authenticate every command, derive owner server-side, validate runtime contracts and references. |
| G10 | The project repository serializes saves through a process-local promise chain without recovery | A failed promise can poison later local saves; cloud commands need isolated failure handling and database concurrency controls. Preserve/fix local mode separately if retained. |
| G11 | `decodeImage` redraws and re-encodes uploads; JPEG data may change | Store exact uploaded bytes and a lossless normalized editing base as distinct asset roles. |
| G12 | `ImageVersion` requires decoded pixels and a data URL | Separate immutable metadata from cached decoded data; reference storage by asset ID, never expiring URL. |
| G13 | `appendAcceptedEdit` drops the redo branch; `reset` drops all versions except original | Define reversible original navigation, explicit redo replacement, retention, and cleanup before adding autosave. |
| G14 | Accepted operations have no creation timestamp in their current base type | Add server timestamps and versioned operation payloads; legacy timestamps must not be invented. |
| G15 | Asset-generation request count is kept in `sessionStorage` | Replace with durable, atomic per-user and global admission control. Browser limits are only presentation. |
| G16 | Image edit/creation/Extend routes call providers in the request and return base64 | Store durable requests/results; return IDs and authorized asset reads; handle lost responses and restart ambiguity. |
| G17 | Extend planning is a separate potentially paid call; analysis/plan can come from the browser | Meter planning too; bind cached analysis and validated plans to owned source version and configuration. |
| G18 | Diagnostic routes list/read/pin/write artifacts without user authentication | Disable public detailed diagnostics by default; protected operational metadata must use ownership and role checks. |
| G19 | Diagnostics store images/prompts locally and retain ten unpinned bundles globally | Production metadata and sensitive-artifact retention must be separate; diagnostics cannot serve as durable jobs or usage accounting. |
| G20 | `exportVersion` re-encodes in-browser with a generic filename | Add project-aware filenames, explicit format behavior, Blob downloads, and remote-image/CORS checks. |
| G21 | CI covers lint/types/unit tests/build; browser suite is manually triggered | Add cloud integration, authorization, migration, browser smoke, release, and restore gates. |
| G22 | No deployment manifest, cloud migration directory, runtime health route, or cloud configuration example was found in the inspected deployment surfaces | Add reproducible deployment/configuration and operational instructions as delivery work. |

**Documentation conflict to reconcile:** `PROJECT.md` and local milestone 18 still describe exact retained-core compositing for Extend. `FEATURE_CONTEXT.md`, `extend-provider.ts`'s `finalizeCandidate`, and the current browser client describe/preserve the complete normalized proposal. Cloud work must follow source/tests and resolve the wording; it must not silently restore an older Extend algorithm.

**Existing work to retain:** source-coordinate selections, immutable edit pipeline, local deterministic processing, provider boundaries, generative review/protected distinction, dimension-aware history, fake providers, and current editing tests. Cloud infrastructure must not change these algorithms as incidental cleanup.

## 3. Complete user journeys

### 3.1 New invited user

Landing → Continue with Google → provider consent → secure callback → invitation/approval eligibility → idempotent profile setup → short welcome/privacy explanation → empty My projects → Upload image or Create with AI.

If not yet invited: Request access → request pending → owner approves or rejects → refresh eligibility → approved access and one five-image allowance grant. Direct invitation and approval of a request converge on the same grant; repeating either must not reset or duplicate the allowance. No fixed cap on the number of approved accounts.

An unapproved identity gets a request-access/pending page, not an operational account. AI denial or allowance exhaustion disables AI actions; it does not sign an approved user out or remove their existing projects. Broader non-AI access before approval is not newly assumed. Authentication alone must not grant upload, generation, storage-signing, or project access. Failed onboarding can be retried without creating duplicate profiles or consuming another invitation.

### 3.2 Upload to first saved edit

Choose file → local preflight → reserve upload allowance → private staging upload → server verification and immutable promotion → original/version/project transaction → editor → select tool → local draft or generated review → Apply/Accept → durable commit → Saved → dashboard thumbnail updates.

The project is not shown as ready before its original is durable. No usable project is created from a failed upload. No accepted history is created merely by generating a preview.

### 3.3 Returning user

Log in → own recent projects → open one by stable URL → current image loads → history metadata loads → older images load on demand → continue → durable history-pointer/acceptance changes → export.

Signing out clears account-specific browser state. Logging in as a different account must never restore the prior user's cached canvas or project list.

### 3.4 AI-created project

New project → Create with AI → choose existing Mark/Icon/Image mode → inputs/preset/format → allowance and privacy notice → Generate → review temporary result → Use image → create original and zero-edit project history → editor.

Use an owned creation session before a project exists. Bind requests/results to it. Repeated generations are separate attempts; closing the dialog does not refund provider work automatically. Unselected results expire under temporary-result retention. Selecting a result twice must still create one project.

### 3.5 Interruption and recovery

Network loss while saving → retain preview/local draft and commit identifier → show Retry save → reconcile server receipt → either apply the single durable result or resume that same save.

Refresh during generation → reopen project/creation session → inspect durable request status → retrieve a persisted result if available. A terminated server request may have an unknown provider outcome; show that honestly and never automatically purchase another generation.

### 3.6 Project and account lifecycle

Project menu → Move to trash → immediate loss of normal editing access → restore before deadline or permanently delete → asynchronous cleanup → updated storage usage.

Account settings → export account data if wanted → reauthenticate → confirm deletion → disable access/new work → delete owned objects and records with retryable cleanup → remove identity → completion. Account deletion is not the same action as logout.

## 4. UI inventory and state requirements

### 4.1 Shared UI contract

Follow [FRONTEND_DESIGN.md](../FRONTEND_DESIGN.md): approved Mirai mark, Manrope/DM Mono, warm paper/ink, sparse acid highlights, explicit coral error/destructive states, restrained motion, and existing canvas/rail/inspector ownership. Public pages can have more readable spacing and larger body copy; do not stretch compact inspector typography into long pages.

Every applicable control needs ready, hover, keyboard focus, disabled, busy, success, and failure states. Async errors need a recovery action. Disabled AI controls explain budget/unavailable/access reasons. Dialogs trap/restore focus, support Escape where safe, and name destructive consequences. Use live regions for save/generation status without announcing every progress tick.

Public/account pages scroll normally. Editor scrolling stays inside bounded regions. Test browser zoom, reduced motion, narrow widths, keyboard-only navigation, and long project names. Private thumbnails are content, not public social-preview assets.

### 4.2 Screens and surfaces

| UI ID | Surface | Elements and actions | Required non-default states |
|---|---|---|---|
| UI01 | Landing `/` | Brand, short editor explanation, approved example image, Start/Sign in, beta notice, privacy/terms/help links; signed-in shortcut to My projects | Auth resolving, service notice, narrow layout, images disabled; no false unlimited/free-AI promise |
| UI02 | Sign-in `/sign-in` | Continue with Google, back link, account/privacy explanation; same action creates eligible first-time accounts | Redirecting, consent cancelled, callback failed, cookies unavailable, provider unavailable, retry; safe return destination |
| UI03 | Auth callback/access/welcome | Loading; Request access and request-status page; welcome text for projects, browser drafts, autosave and five-image allowance | Pending, approved, rejected, duplicate submission, revoked access, callback/setup failure; requests do not grant themselves access |
| UI04 | My projects `/projects` | Header/account menu, New project, search, sort by updated/name, thumbnail grid or list, name/dimensions/updated label, item menu, pagination/load more | Empty with upload/create actions, loading skeleton, zero search results, list failure/retry, missing thumbnail fallback, quota reached |
| UI05 | New project flow | Upload/Create tabs or choices, optional name, PNG/JPEG chooser/drop target, visible upload limits | Drag active, invalid file, too large/dimensions, upload progress, cancel, retry, storage full, verifying, complete |
| UI06 | AI creation dialog | Preserve current Logo Mark/Icon/Create Image fields, visual treatment, destination format, preview, Generate, Use image; show allowance | Disabled/unavailable, invalid prompt, generating, rejected request, failure/unknown outcome, result expiring/expired, save failure, previous result retained |
| UI07 | Editor header `/projects/[id]` | My projects/back, editable name, save-state text, undo/redo, History, Export, account/overflow menu | Loading project, Saving, Saved, Retry save, offline, session expired, invalid input version, read-only/deleted project |
| UI08 | Existing editor body | Retain rail, contextual inspectors, canvas, dimension/zoom status, comparison, Apply/Accept/Discard | All current selected/draft/processing/review/failed states plus asset-loading, access revoked, limits, and save pending |
| UI09 | History drawer | Original, chronological accepted operations, timestamp, optional thumbnail, current marker; inspect version, select as current, return to latest | Metadata loading, old image loading/retry, unavailable asset, truncated future explanation, empty original-only history |
| UI10 | Save/navigation protection | Persistent save error with Retry; navigation dialog for live draft, unaccepted preview, or pending commit | Save/apply where valid, discard pending work, stay; lost-response reconciliation; browser close warning is best-effort |
| UI11 | Dedicated conflict dialog/banner — deferred | No custom conflict-resolution screen in this release | Invalid/stale-input saves use ordinary actionable save errors; no merge or synchronization UI |
| UI12 | Export dialog/action | Selected accepted version, dimensions, PNG/JPEG, sanitized filename, transparency explanation/background for JPEG, Download | Image loading, encoding, failed download/retry, pending edit explicitly excluded; usable while AI is unavailable |
| UI13 | Project actions and Trash `/projects/trash` | Rename; Move to trash confirmation; deleted date/deadline; Restore; Delete permanently confirmation | Action pending, failure/retry, restoration over project limit, expired/purging item, stale item, empty trash |
| UI14 | Account `/settings` | Display name, read-only login identity, usage/storage, sign out, support, data export, delete account | Loading, update failure, account restricted, export preparing/ready/expired, reauthentication failed, deletion pending |
| UI15 | Usage | Storage used/reserved/limit, active project count, five-image allowance remaining; reset policy only once confirmed, current availability; explain how to free space | Near limit, exhausted, usage unavailable, cleanup pending; no upgrade button until billing exists |
| UI16 | Help and policy pages | Quick workflow guide, format/size limits, autosave/history behavior, support contact, privacy, terms, beta limitations | Readable mobile layout, functioning links; error report excludes images/prompts unless deliberately attached |
| UI17 | Global error routes | Signed-out redirect, generic unavailable/not-found, offline/retry, service temporarily unavailable | Project IDs must not reveal someone else's existence; logged-in state must not loop between redirects |
| UI18 | Minimal request recovery | On relevant project/creation surface, status of last outstanding attempt, result review link, request reference for support | Still processing, result ready, failed, outcome unknown, expired; polling stops in terminal states |
| UI19 | Owner access management, responsive for phone use | Owner-only invitation action and pending-request list; Approve, Reject, revoke access; show whether the five-image grant was issued | Unauthorized, duplicate approval, already invited, revoked, action failure/retry; approving twice never grants ten images |

### 4.3 Existing controls: retain, change, or remove

| Current element | Cloud treatment |
|---|---|
| Upload/Replace image in editor | “New project” or equivalent project creation; must never overwrite the current original. Resolve pending work first. |
| Open saved-project dropdown | My projects navigation; do not fetch every project into the editor header. |
| Manual Save | Save status plus Retry/Save now only where useful; distinguish “Apply edit” from “Saved to cloud.” |
| Project/request ID chips | Remove from ordinary header; request reference stays in error/help details. |
| Diagnostics button and fake-scenario controls | Local/development or specifically authorized operator mode only; hiding buttons is insufficient. |
| Reset to original | Proposed “Go to original” pointer move with redo retained; no silent history wipe. |
| Lasso, selection Add/Subtract, Recolor | Preserve current source coordinates, selection behavior, local processing and comparison. |
| Brush and draft Eraser | Preserve draft-only erasing and one-operation Apply; integrate save/navigation state. |
| Hand, pan/zoom, fit/reset view | Remain local view state, never an accepted edit or cloud write. |
| Size & position | Preserve Crop/Resize/Rotate/Flip; enforce cloud dimension envelope before accepting. |
| Text/Watermark | Preserve flattened accepted result and supporting PNG asset references; do not imply editable layers. |
| Remove/Replace/Restyle | Same review/protected rules; authenticated, metered requests and durable results. |
| Transform | Preserve local Monochrome shortcut and generative fidelity acceptance rules. |
| Extend | Preserve current complete-candidate review, output dimensions, planning/adjustment behavior; meter planning separately. |
| Compare/Accept/Discard | Same visual authority; acceptance now has a visible durable-save phase. |
| Keyboard undo/redo and overflow actions | Route through the same draft, processing, and concurrency guards as visible buttons. |

### 4.4 UI acceptance details

- A thumbnail click and a deep link open the same owned project. Browser back/forward cannot bypass pending-work protection or restore another account's data.
- Enter/Escape behavior for rename is defined; names are trimmed/bounded; blank names get a clear fallback; search escapes wildcard semantics deliberately.
- Reading a history item for comparison does not change the persisted current pointer. “Use this version” does; a later edit requires acknowledgement that redo will be replaced.
- The current and original labels are distinct. Selecting original alone does not add an operation. Accepted history is not an audit of every click or failed request.
- Export has a visible entry on narrow screens. JPEG requires an explicit background for transparent pixels; PNG remains lossless.
- Provide “Download original file” in the project/export menu, explicitly distinct from exporting the normalized original version; preserve the uploaded bytes and appropriate file type.
- For genuine save failure, retain the exact proposed pixels. If a user needs an emergency download of pending work, label it separately from ordinary accepted-version export and do not advance history.
- User-facing capability flags come from the server: access, quota, AI disabled, maintenance, supported input envelope. Provider/model configuration remains an implementation detail unless it affects a user decision.

## 5. Backend responsibilities and refactoring

### 5.1 Modules and boundaries

Introduce concrete modules only with their delivery unit. Suggested ownership areas:

| Area | Responsibility | Existing code to adapt |
|---|---|---|
| `server/auth` | Validate session, resolve active account, invitation eligibility, recent-auth checks | All API routes and new protected page loaders |
| `server/projects` | Project lifecycle, ownership, atomic valid-source acceptance commands | `server/storage/project-repository.ts`, project routes |
| `server/assets` | Staging, immutable promotion, verification, signed reads, quota reservations, cleanup | Local asset persistence and image intake |
| `server/generation` | Durable attempts, orchestration, admission, result references, recovery | Image edit/creation/Extend routes; existing adapters stay behind contracts |
| `server/usage` | Atomic allowances, global budget, provider-stage accounting, reconciliation | Browser counters/capabilities and provider-call boundaries |
| `server/lifecycle` | Trash purge, account deletion, data exports, orphan reconciliation | New, narrowly scoped maintenance responsibilities |
| `features/projects` / `features/account` | Library/account presentation and API clients | Extract cloud navigation/I/O from `EditorWorkspace` |
| Editor domain/cache | Metadata versus decoded pixel cache, pending commit, hydration, shared acceptance | `types.ts`, `store.ts`, `project-client.ts`, image-data clients |
| Diagnostics | Sanitized metadata, role-gated evidence, bounded retention | `server/diagnostics`, diagnostic routes/drawer |

### 5.2 Authentication and authorization

Use supported Supabase server/browser clients and cookie/session refresh handling. Verify identity on the server, not from a decoded cookie or user-supplied owner ID. Signed claims prove identity but do not alone prove current invitation eligibility, account status, or recent reauthentication; check those separately. Follow the current [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [session-validation distinctions](https://supabase.com/docs/guides/auth/server-side/advanced-guide).

Required controls:

- Authenticate page loaders and every data, generation, signing, mutation, and recovery route; route-level security remains necessary even with page protection.
- Derive user ID from the validated session. Never treat `x-project-id`, `x-request-id`, path IDs, or client profile fields as authorization.
- Authorize every referenced project, version, mask, result, creation session, and overlay; verify that all references belong together.
- Use database row-level policies and constrained database permissions. Clients must not have unrestricted write access that bypasses quotas/history rules.
- Prefer user-scoped reads. Transactional domain writes execute through tightly restricted commands/functions; privileged server paths must explicitly enforce owner/account checks. Service/admin credentials are not a substitute for RLS and must never reach the browser.
- Design atomic history/usage operations with database transactions or restricted transaction functions; separate REST requests are not a transaction.
- Prevent ownership, quota, invitation, role, operation-provenance, and account-status edits through profile updates.
- Protect cookie-authenticated mutations against cross-origin/CSRF requests; validate allowed origins and use appropriate anti-CSRF measures. CORS is not authorization.
- Validate OAuth state/PKCE, exact callback/return destinations, session refresh races, sign-out, and account switching. Avoid session-bearing response caching.
- Protect destructive account operations with recent authentication. Define revocation behavior for already issued sessions and short-lived object URLs.
- Service credentials for maintenance are scoped separately, audited, and unavailable in untrusted PR workflows.

### 5.3 Data inventory

This is an entity/constraint plan, not final SQL. The implementation ticket defines migrations and indexes.

| Record | Important data and constraints |
|---|---|
| Auth identity | Managed by Supabase; Mirai does not store passwords. |
| Profile/account | Auth user ID, display name, active/pending/suspended/deleting status, onboarding/policy acknowledgement timestamps. |
| Invitation/access request | Direct invitation or pending/approved/rejected/revoked request, requester identity, owner decision/audit timestamps; idempotent approval and exactly one five-image grant, never user-editable eligibility. |
| Project | Owner, name, lifecycle status, original/current version, revision, thumbnail reference, created/updated/deleted/purge timestamps. |
| Image version | Project, parent, immutable asset ID, dimensions/type, accepted timestamp; one original, at most one active linear successor. |
| Edit operation | Project, input/output version, type/method, immutable parameters with schema version, mask/overlay references, creation timestamp, verified request provenance when generative. |
| Asset | Owner/project or creation-session scope, role, opaque storage key, checksum, bytes, dimensions/format, staged/verified/committed/deleting state. |
| Upload reservation | User, intended asset role, byte reservation, expiry, state, immutable finalization receipt. |
| Commit receipt | Owner, project, idempotency key, payload digest, input version and resulting version/revision; prevents duplicate acceptance after lost responses. |
| Creation session | Owner, request/result references, expiry, chosen result and resulting project ID. |
| Generation request | Owner, project or creation session, source version, parameters/plan version, idempotency key, phase/status, lease/deadline, result asset, provider correlation. |
| Provider-stage usage | Request/stage, estimated reservation, attempted/confirmed/unknown outcome, observed usage, pricing/configuration version; not inferred from accepted history. |
| Allowance/budget | Per-account limits and global limits, counters/reservations, window/reset policy, configuration version. |
| Maintenance/deletion/export task | Type, owner/target, durable progress, retry count, next attempt, completion/failure details without private payloads. |
| Audit event | Minimal security/administrative changes; bounded retention, no raw images/tokens. |

Indexes must support owner + status + updated time pagination, project history order, idempotency uniqueness, pending task scans, and expiry cleanup. Foreign keys must prevent cross-project references; original/current pointers must point to valid versions of that project. Store timestamps in UTC and display in the user's locale. Store billing estimates in integer units, not floating-point money.

Do not put base64 images or full mask arrays in Postgres. Do not store signed URLs as canonical asset locations. Old operation payload versions remain readable after a deploy.

### 5.4 Endpoint coverage

Exact new route names are implementation details; every capability below requires a typed contract, ownership rules, bounded inputs, and tests.

| Existing/new surface | Required cloud behavior |
|---|---|
| Existing `/api/projects` GET | Owner-scoped pagination/search/sort; lightweight summaries only. |
| Existing `/api/projects` POST | Replace arbitrary snapshot overwrite with validated creation/commands; compatibility only in explicit local mode. |
| Existing `/api/projects/[id]` GET | Owned metadata/current version; no eager base64 history. |
| New project mutations | Rename, commit edit, move current pointer, trash, restore, permanent deletion; atomic input validation/idempotency protection where needed; dedicated multi-session revision-conflict UX is deferred. |
| New history reads | Paged operations/version metadata and authorized asset access. |
| New asset operations | Reserve/initiate, finish/verify, authorized signed read, cancel; ownership/quota enforcement on every path. |
| Existing `/api/image-edits` GET | Safe user capabilities and availability, not unrestricted developer configuration. |
| Existing `/api/image-edits` POST | Owned source/reference validation, durable request and stage budget, result persistence, safe response. |
| Existing `/api/asset-generations` GET/POST | Same controls; owner-scoped creation session before any project exists. |
| Existing `/api/image-extends/plan` POST | Meter/cache authoritative analysis; reject source/config mismatches. |
| Existing `/api/image-extends/generate` POST | Validate frozen plan against authoritative source/analysis, output envelope, revision, request/result lifecycle. |
| New request status/result reads | Owned status and temporary result; no new provider call when polling. |
| Existing `/api/request-logs` and nested GET/PATCH/artifact/client-artifact routes | Disabled in cloud beta by default; if enabled later, explicit operator/owner policy and bounded writes, retention, no cross-user access. |
| New account/profile/usage surfaces | Whitelisted profile changes, server-derived allowances, recent-auth deletion, data-export request/download. |
| New access-request/owner surfaces | Signed-in request submission/status; owner-only invitation/approval/rejection/revocation, rate limits, audit record and idempotent allowance grant. |
| New health/status surfaces | Minimal liveness and controlled dependency readiness; no credentials, user data, or paid calls. |

Standardize validation/error handling: malformed input, expired auth, forbidden/ineligible, absent object, stale revision, upload too large, quota exhausted, rate limited with retry timing, unavailable dependency, internal failure with a safe request reference. Do not return raw provider exceptions, database details, file paths, or stack traces. Network timeouts and non-JSON host errors must produce usable client errors too.

### 5.5 Editor/store refactor

1. Split `ImageVersion` metadata from decoded pixel resources. Add a bounded image cache keyed by immutable asset/version ID.
2. Load current version first; hydrate original/comparison/undo targets on demand. Fetch masks/overlays only when required. Release bitmaps, object URLs, and buffers on eviction/project/account change.
3. Keep `appendAcceptedEdit` or a typed successor as the single domain acceptance transition. UI components request acceptance; the cloud orchestration layer persists it and applies the confirmed transition exactly once.
4. Model a pending commit separately from accepted history. Preserve preview/local draft while saving; allow inspection but block competing accepted-state mutations until resolved. This conservative beta rule avoids an unbounded client outbox.
5. After a server acknowledgement, update version/operation/current pointer together in the store. Retry receipt lookup if the response was lost. Saving failure creates no accepted entry.
6. Add server revision for internal ordering, typed save status, account/project identity scope, stale-response protection, and abort handling. Do not add dedicated multi-session conflict UX under this work.
7. Rename and current-pointer moves are lightweight writes, not full project saves. Coalesce rapid name edits; serialize state-changing commands.
8. Guard keyboard, upload/new project, history, account switch, browser navigation, and destructive controls consistently during drafts/requests/saves.
9. Preserve one original and exactly one version/operation per accepted edit. Store masks against the operation's relevant source/output dimensions as defined by that operation, including geometry and Extend.
10. Keep local development with fake providers usable. Explicit mode configuration must fail closed in cloud deployments; never silently fall back from unavailable cloud storage to local disk.

Cache scoped unfinished draft/selection data and pending request/commit identifiers in browser storage. On refresh, retrieve the server's latest owned project/receipt before offering a cached draft. Cache eviction, private browsing, storage denial or an incomplete cache write can still lose unsaved work; browser cache is not a cloud backup. A timeout is not proof that a commit failed: do not let “Discard pending save” pretend to undo an already committed server result. Resolve the receipt first, then offer a normal history action if the user wants to reverse it.

### 5.6 Browser draft cache

Implement application-managed browser storage, preferably IndexedDB for binary masks/paint/overlay data, rather than relying on the HTTP cache or large localStorage strings. Key entries by authenticated user, project, immutable input version and draft schema version. Cache live draft parameters, selection data and necessary temporary assets with bounded/debounced writes; this cache never creates accepted cloud operations.

- On reopen, validate account eligibility, project access, original input version and schema before offering Restore draft / Discard. Never auto-apply cached work to a different current image.
- Show “Draft stored on this device” separately from “Saved to cloud.” Cached drafts are not available on another device.
- Purge entries after successful acceptance, explicit discard, logout/account change, project/account deletion, expiry or schema incompatibility. Prevent late async cache writes from resurrecting a signed-out user's data.
- Configure a small byte cap and expiration period during implementation; these values are not yet approved product promises. Evict safely with clear feedback and handle disabled storage, full quota and private browsing.
- Do not store provider credentials or signed URLs as durable draft data. Outstanding generated results are recovered by their owned server IDs and expire under result retention.
- Cached pending-commit IDs are reconciled with server receipts before draft restoration, avoiding duplicate application after a refresh.

This is best-effort local recovery; users can clear browser data and the browser can evict it. It does not change the promise that accepted changes are durably saved to the cloud.

## 6. Critical data and failure flows

### 6.1 Original/upload durability

1. Browser checks format, file size, and dimensions for fast feedback; server verification remains authoritative.
2. Server verifies eligibility, project/storage allowance, limits, and intended asset role; reserves bytes and returns an expiring staging upload permission.
3. Browser uploads directly to private staging storage. It cannot select or write a committed asset key.
4. Finalization verifies actual size, file signature/decodability, supported frame count, dimensions/pixel budget, checksum, and reservation ownership. Bound streaming and decoding; a declared content type is not proof.
5. Preserve exact source bytes. Build a lossless normalized editor base with explicit orientation/color-space handling; strip unnecessary metadata from derived previews. Do not silently resize the retained original to make it fit.
6. Promote verified content to a new immutable key inaccessible to the client's upload token. A reusable staging PUT must never overwrite an accepted original/version after verification. Bind promotion to the verified object/checksum and defend against concurrent staging replacement.
7. Commit project/original/base-version/asset references and storage usage atomically in Postgres, then return a creation receipt.
8. If storage succeeds and the database fails, retry finalization idempotently. Expired unreferenced staging/promoted assets are reconciled later; they do not become visible projects.

Signed URLs are bearer access with finite lifetime, not single-use permissions. Browser transfers require tested authorization and CORS behavior. Use the documented [Supabase signed upload URL mechanism](https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl) and [private-bucket access model](https://supabase.com/docs/guides/storage/security/access-control). Handle an expired URL even when the browser cannot read its error body.

**Abuse boundary:** verification after upload alone does not cap uploaded bytes. Before enabling direct browser PUT, prove an enforceable size/rate bound for the chosen mechanism. If unavailable, use a bounded upload gateway for the small beta or explicitly limit access to trusted invitees with aggregate reservations and cleanup; do not describe unbounded signed PUT as a hard cost cap. Replayed staging uploads and abandoned parts belong in cost tests.

### 6.2 Accepting an edit

User Accept/Apply → freeze operation input/current version → stable commit key → prepare verified output/mask/assets → server validation → one transaction creates operation/version and advances pointer/revision → receipt → shared client acceptance → Saved.

Required validation includes ownership of every reference, current input version, output limits, supported operation schema, immutable mask dimensions, and generative provenance. Generative review acceptance binds to the server's stored normalized candidate; protected mode binds to the authorized effective mask and exact compositing rule. Never trust a client-supplied “fidelity passed” field for Transform.

For deterministic edits, keep browser rendering but validate the submitted asset, operation contract, dimensions and effective-mask preservation where applicable. Exact outside-mask pixel comparison uses decoded pixels, not compressed byte equality. The server need not reproduce browser font rendering, but must not advertise unimplemented server verification of the entire visual transformation.

No database transaction remains open while calling a provider or transferring large objects. Database/object storage coordination uses staged states and reconciliation, not a claim of a cross-service atomic transaction.

### 6.3 History integrity; multi-session feature deferred

- Commit atomically and validate that an edit still targets the current input version. This protects linear history and exactly-one acceptance. Dedicated multi-session optimistic-concurrency controls/UX are deferred under D08; lightweight rename/pointer actions use transactional last-completed-write behavior rather than a merge or conflict workflow.
- If a result was produced for an older source, retain it as a temporary result and show an ordinary invalid-source/save error. Never paste it onto a newer image automatically.
- Undo/redo selects an existing retained immutable version. A new edit after undo detaches the future from active linear history in the same transaction as acceptance.
- Detached future assets become cleanup candidates only when no surviving references/tasks require them. Brief internal recovery retention is not a user-visible branching feature.
- “Go to original” is a pointer change. A later accepted edit may replace redo after explicit explanation. Do not retain the old destructive `reset` under a benign label.
- A project being deleted rejects saves/generations. A restored project still requires valid current source references before an edit is accepted.

### 6.4 Durable AI attempts, budgets, and recovery

The five-image allowance grant must be persisted server-side and issued once per approved identity, regardless of invitation/approval retries or browser changes. Its renewal period and coverage of edits are awaiting clarification. All paid AI entry points still require metering and an explicitly authorized budget; do not interpret an ambiguous allowance as unlimited free editing.

All AI entry points use the same admission service: creation, localized edits, Replace planning, Transform planning/generation/fidelity checks, Extend analysis, and Extend generation. Local recolor and local Monochrome do not consume AI allowance.

State sketch:

```text
reserved → running stage(s) → result ready → accepted OR discarded/expired
                   |
                   +→ failed (known outcome)
                   +→ outcome unknown (provider may have run)
```

The request record is required domain data. Diagnostic logging is optional observation; failure to record an optional trace must not control usage accounting or history.

Required behavior:

- Atomically reserve per-user allowance, project/result storage headroom, and global budget before provider work. Re-check account status and stage budget before each subsequent paid stage.
- Use durable idempotency keys plus request digests; the same key with different input is rejected. A request ID by itself is not an idempotency implementation.
- Persist actual stage attempts and available usage independently of acceptance/discard. Set provider/client retry and timeout policy explicitly after checking installed SDK behavior; do not accidentally stack retries at SDK, server, and browser layers.
- Store result bytes privately and mark result ready before returning success. A lost client response can then retrieve the same result without another model call.
- Use a database-backed concurrency lease; proposed beta starts with one global active image-processing/generation request and one per user. Return a clear busy response instead of an in-memory waiting queue.
- An expired lease does not prove the provider stopped. Fence late completions, preserve unknown cost reservations, and reconcile; do not blindly reclaim uncertain spend and repeat work.
- Distinguish stop waiting/discard from provider cancellation. Closing a tab does not prove cancellation or refund.
- Normal network retry checks existing status first. A deliberate new generation creates a new key and consumes another allowance according to policy.
- Cache Extend scene analysis by owned immutable source plus analysis/model/schema version; recompute deterministic frames locally or server-side without buying repeated analysis. Validate the frozen plan against authoritative analysis before generation.
- Gate presets/qualities/models server-side. A public request cannot increase quality, dimensions, result count, or provider permissions outside configured bounds.
- Account deletion or suspension during generation prevents later stages/acceptance/signing. Late results are retained only long enough for controlled cleanup and usage reconciliation.

**Free-host boundary:** the beta may execute inside the active HTTP request after writing the durable record. It must not return `202` and pretend an untracked detached promise is a reliable worker. Refresh/restart recovery means recovering stored status/results, not guaranteeing unfinished execution survives. If the longest supported pipeline fails the host timeout/restart tests, real AI stays disabled until a durable executor is separately approved and deployed. A Postgres-backed work table can later feed one worker; Redis is not a prerequisite.

### 6.5 Deletion, cleanup, and account export

- Trash sets lifecycle state and purge time; it keeps objects and counts their bytes. Restore validates project allowance and that purge has not started.
- Permanent delete first revokes application access/signing, then retries object deletion in batches. Mark complete and release committed usage only after deletion is confirmed; repeated cleanup is safe.
- Account deletion immediately disables new commands, cancels unsent work, invalidates sessions as supported, and prevents new result writes. Retain a minimal deletion task until cleanup finishes; deleting the identity first must not destroy the ability to find its objects.
- Show a deletion-request receipt before sign-out. Completion must not depend on the now-deleted account being able to poll authenticated settings; retain a non-sensitive support reference and operator-visible completion status. Only promise a completion email if an email delivery path has actually been built.
- Already issued read URLs can remain usable until expiry. Set a short lifetime and state this limitation accurately; logout cannot retract files already downloaded.
- Account export includes profile/project metadata, retained operations/history, and owned originals/versions through a bounded manifest/download process. Large archives require a maintenance job with an expiring private result, quota allowance, and cleanup; do not assemble all projects in a web request's RAM.
- Identity/password secrets, internal logs, and operator credentials never enter an account export. Define provenance fields that are user data separately from internal diagnostic prompts.
- Backups retain deleted data only for the disclosed retention period. Restoring a backup must replay deletion tombstones so deleted accounts/projects do not reappear.
- Garbage collection distinguishes staging, temporary candidates, detached redo, committed assets, exports, and backups. Never apply a blanket bucket expiry to accepted history.

Use database row locks or equivalent lifecycle fencing so restore and purge cannot both win. A cleanup worker rechecks references/status before deleting, and finalizing commits/results rechecks deletion state before attaching an asset. Signed uploads that finish after cancellation/deletion stay uncommitted and are swept safely.

## 7. Deployment and environment plan

### 7.1 Free-tier constraints verified for this plan

| Service | Verified constraint | Planning implication |
|---|---|---|
| Render Free web service | Idle sleep after 15 minutes, roughly one-minute wake-up, ephemeral disk, 750 shared monthly instance hours; free Postgres expires after 30 days | Use external durable data; budget staging hours; tolerate cold starts. Render itself advises against production use of free instances. [Source](https://render.com/docs/free) |
| Supabase Free | 500 MB database, 50,000 MAU, 1 GB file storage, 5 GB egress plus 5 GB cached egress, two active service projects, inactivity pause; automatic backups excluded | Keep metadata and private binary assets in the same isolated project for the zero-billing beta; enforce a conservative global storage reserve and build a backup process. A Supabase service project is not one user's Mirai project. [Source](https://supabase.com/pricing) |
| Supabase email sender | Default delivery is restricted to project-team addresses; public email auth requires custom SMTP | Google-only beta avoids adding email/password flows initially. [Source](https://supabase.com/docs/guides/auth/auth-smtp) |

Do not promise a permanently free, always-available production service. The user has rejected services that require a payment method or usage-billed subscription for this phase. Keep Supabase on its Free plan and Render on its Free service; limits may suspend or deny work rather than scale. Confirm real dashboard allowances before provisioning or enabling additional services.

### 7.2 Provisioning inventory

| Item | Setup work | Verification |
|---|---|---|
| Service ownership | Owner-controlled GitHub, Render, Supabase and later Google OAuth accounts; MFA and recovery codes | Recovery owner documented; no personal tokens embedded in repo |
| Render app | Native Node web service or Docker if exact runtime requires it; locked dependencies, production build/start, assigned port and host binding | Actual Linux build with pinned Node/npm and Sharp succeeds |
| Supabase beta | Auth configuration, Postgres schema/migrations, RLS/grants, connection strategy, narrow keys | Two users cannot access each other's data; transactions work |
| Supabase staging | Separate service project if free capacity allows, fake users/results only | No production data or provider credentials |
| Supabase Storage buckets | Separate staging/committed/backup roles or guarded prefixes; environment separation, private access, lifecycle only for eligible temporary data | Anonymous access fails; browser authorized transfers work; policies/tokens cannot cross environments or owners |
| Google OAuth | Client credentials, consent/branding, correct scopes, authorized callback configuration and testing/publishing status | First login, repeat login, cancellation, ineligible user and exact callback tested |
| Site URL | Provider hostname first; optional custom domain/DNS/TLS later | HTTPS, redirects, cookie domain, OAuth return URL, CORS and canonical metadata agree |
| Maintenance runner | Protected scheduled/manual GitHub workflow for cleanup, export and backup where suitable | Runs against Supabase database/storage directly; retries safely; records last success |
| Monitoring | Structured app logs and external/operator checks for service, storage, backup freshness, usage | Synthetic failure reaches an operator without including private payloads |

Use Render's [Next.js deployment instructions](https://render.com/docs/deploy-nextjs-app), [deploy lifecycle](https://render.com/docs/deploys), and [health-check documentation](https://render.com/docs/health-checks) when implementing, rather than guessing platform commands.

### 7.3 Environment matrix

| Environment | Application | Data | AI | Purpose |
|---|---|---|---|---|
| Local | Local Next.js | Local isolated test/cloud-emulator setup; explicit existing local mode if retained | Fake default | Fast development without user data or spend |
| CI | Disposable Linux app/tests | Disposable Postgres/storage test fixtures; real policies, not only mocks | Fake; no paid credentials | Reproducible contract and browser validation |
| Staging | On-demand shared staging deploy | Separate Supabase project if free capacity allows; otherwise isolated schemas/buckets with synthetic data only | Fake except deliberate bounded provider smoke | OAuth/storage/runtime qualification |
| Invited beta | Render app | Production Supabase database and private Storage buckets | Disabled until gate; then capped | Real invited users |

Avoid a full cloud stack per PR. Preview builds must never point to beta data or share real provider secrets. Restrict preview authentication redirects rather than wildcarding arbitrary hosts. Account for all free-tier projects/hours already used by other personal projects.

### 7.4 Configuration and secrets inventory

Document names in `.env.example` without values and validate them at startup:

- Application mode, canonical URL, deployment/release ID, allowed origins, maintenance/registration flags.
- Public Supabase project URL and publishable key; server-only privileged credentials only where required.
- Database migration/maintenance credentials, separate from ordinary runtime credentials.
- Supabase Storage environment bucket names and scoped runtime access; separate backup/deletion permissions where feasible.
- AI provider credentials/configuration already present; explicit quality/output limits, admission flags, timeouts/retries, per-user/global budgets.
- Upload/pixel/storage/project limits, signing TTL, result/trash retention, generation lease deadlines.
- Maintenance authentication, backup encryption secret and destination, alert destination.
- Optional email provider configuration only when email features are approved.

Never prefix secrets with a browser-public environment convention. Prevent build logs, source maps, test traces, request bodies and signed URLs from leaking secrets or image content. Rotation instructions must cover revoking old tokens, updating services/workflows, redeploying and verifying access.

### 7.5 Deployment pipeline

1. Feature PR completes its focused tests and documentation; inspect concern-separated commits.
2. CI runs locked installation, lint, generated Next types/typecheck, unit/integration tests, production build, and required browser smoke.
3. Validate migrations on an empty database and an upgrade fixture; test policies with ordinary user credentials.
4. Deploy approved revision to isolated staging; verify OAuth, upload, one accepted edit, reopen and export with fake AI.
5. Back up before a production schema migration. Apply additive/compatible migrations once through a protected release job, not on every app start.
6. Deploy the app only after required checks genuinely pass; a skipped critical check is not a release pass.
7. Run non-destructive beta smoke with dedicated synthetic fixtures and no automatic paid generation.
8. Record release/migration IDs, settings changed, smoke result and rollback target. Turn real AI on only after its separate gate.

Old browser tabs may live across deployments. Version contracts so old clients fail clearly or continue compatibly. On revision/schema incompatibility, offer reload after protecting pending work. Use expand/migrate/contract changes so an application rollback does not require destructive database reversal.

### 7.6 Runtime and rollback checks

- Verify exact Node/npm versions in `.nvmrc`/`package.json` are available; use a pinned Linux container only if needed. Test native Sharp and writable temporary paths.
- Bound decoded pixel memory, concurrent Sharp work, input streaming, and maximum request size. Measure peak RSS under maximum supported images and candidate analysis.
- Liveness is cheap and independent of AI. Readiness checks are bounded and must not create restart storms when an external service is paused.
- Handle shutdown: stop admitting new paid work, record phase and lease, persist finished results where possible; interrupted calls become uncertain, not silently retried.
- Back up before risky migrations; keep prior app release available; test recovery from a failed build, bad configuration and incompatible migration in staging.
- Rollback does not erase successful user edits or reset usage. Disabling AI should leave reading, local editing, saving and export usable when dependencies allow.
- Initial cold-start pages belong to the host; the unloaded Mirai app cannot replace that experience. After loading, explain dependency/network failures in Mirai UI.

## 8. Cost and capacity plan

### 8.1 Proposed starting envelope, pending benchmarks

| Limit | Proposal | Reason |
|---|---|---|
| Invitations | No fixed account-count ceiling; owner invitation or approval required | Owner controls admission; aggregate resource budgets independently control spend |
| Active projects | 5 per account | Multiple projects without an unlimited library |
| Total committed user assets | Proposed 100 MiB per account, including trash | Aggregate depends on actual approved accounts; global reserve still applies and this numeric per-user proposal is not yet approved |
| Upload file size | 10 MiB | Reasonable initial transport bound |
| Editing dimensions | At most 2,048 px on either edge, at most 4,194,304 pixels | Starting benchmark envelope, not proof it fits the free instance |
| Output dimensions | Same envelope, including Resize and Extend | Prevent bypassing limits after upload; incompatible presets must be disabled clearly |
| AI images | Five per invited/owner-approved user; coverage and renewal pending clarification | No automatic daily/monthly reset is approved; exhausted/unapproved users cannot initiate AI work; global budget remains separate |
| Concurrent heavy processing | 1 globally and 1 per user initially | Reduce memory and spend spikes |
| Temporary candidates | Proposed 24-hour maximum, earlier cleanup on discard where safe | Recovery window without a permanent generation gallery |
| Trash | 7 days | Small recovery window; counts against quota |
| Signed transfer expiry | Short bounded lifetime, e.g. 5 minutes, renewable after authorization | Limits exposure; final value tested against upload duration |

These are intentionally conservative proposals. Measure originals plus normalized bases, version PNGs, masks, overlays, thumbnails, temporary outputs, and cleanup lag. A 4-megapixel RGBA buffer is about 16 MiB before copies; multiple canvases, masks and Sharp buffers make file-size limits alone inadequate.

Use a separate small aggregate temporary-upload/result reserve and backup reserve. Monitor database size, Supabase stored bytes/egress/operations, app bandwidth/build usage, and provider spend independently. Database and Storage share the same Supabase project lifecycle; other test buckets consume the same file-storage allowance.

Proposed zero-billing global storage watermarks: warn at 600 MiB of managed objects, stop new large uploads/generations at 700 MiB, and leave the rest of the included 1 GB for in-flight reservations, staging, cleanup lag, and provider-reported accounting variance. Keep backups outside this live-object allowance or reduce the product cutoff further. Before enabling work, verify that predicted usage including reserved bytes stays below the cutoff. Bound temporary reservations in total, not just per user.

Do not implement an automatic daily reset: the renewal period is awaiting the user's answer. If a recurring policy is chosen later, define its time boundary and show it clearly. One user-facing generation action may purchase several provider stages. A request rejected before all paid work releases its reservation; partial/unknown provider work keeps the corresponding cost reservation. A failed request does not enter edit history. Any courtesy restoration of user allowance is a separate audited decision and does not erase actual provider cost. Pure cached analysis/frame recalculation uses no new AI attempt; a newly purchased analysis must count under a defined planning allowance or the same overall request allowance.

### 8.2 Prevent waste before buying more infrastructure

- Upload committed assets once. Do not resend or decode the full history for each save/open.
- Use small thumbnails for lists, lazy image fetches for history, and direct authorized downloads when possible.
- Prefer Blob/object URLs to persistent base64 copies; preserve exact committed pixels and source bytes rather than applying lossy savings to accepted history.
- Count bytes from server-verified storage, with reservations for in-progress work; reject new work before the account/global cap is exhausted.
- Bound API request rates as well as storage. Cheap repeated URL signing/status/listing can still consume database and storage operations.
- Keep production diagnostics mostly metadata; do not duplicate raw/normalized/final images per request by default.
- Preserve legitimate accepted history; free space through explicit user deletion and unreferenced temporary cleanup, never silent pruning of active versions.
- Stop retry storms with exponential backoff/jitter and terminal status handling. Suspend polling when hidden/offline and stop after completion.
- Billing alerts are warnings, not guaranteed hard cutoffs. Reserve conservative cost for all stages, unknown outcomes and concurrent in-flight work.

### 8.3 Budget scenarios and upgrade triggers

| Scenario | Expected cost posture |
|---|---|
| Fake AI / deterministic invited beta within provider allowances | Target $0 recurring infrastructure; provider subdomain; no purchased AI |
| Real AI sponsored beta | Same infrastructure target plus an explicitly funded provider budget; unknown/cached attempts accounted for |
| Better availability | Paid always-on compute; size selected from measured image memory rather than smallest advertised price |
| Database reliability/capacity exhausted | Reassess managed database paid plan, backups and connection/storage requirements |
| Image growth | Reassess R2 or another private object store only through an explicit billing/architecture decision; do not silently attach a payment method or migrate metadata merely because image storage grows |

Upgrade or reduce scope when peak memory approaches the process limit, long pipelines do not finish reliably, host suspension occurs, storage/database headroom falls below the operating reserve, or backup/recovery needs exceed what scheduled maintenance can deliver. A paid background executor needs its own cost and deployment decision.

No current fixed monthly price is promised for a future upgrade; recheck checkout pricing when choosing that instance. No automated billing enrollment, domain purchase, or deployment is part of this planning task.

### 8.4 Approved image-size policy

Keep the original file intact and edit at its source dimensions. Do not implement a lower-resolution authoritative working copy or model-based final upscaling. Deliberate Crop, Resize and Extend operations still change dimensions through the existing immutable edit pipeline; this decision does not remove those tools.

Thumbnail/display scaling and provider-specific input preparation remain distinct from the working image. The current adapter may prepare smaller provider inputs and normalize returned candidates; retaining canvas dimensions does not guarantee that the provider works natively at those dimensions.

P01 must measure a safe source-image envelope. If an upload exceeds that envelope, reject it with clear limits instead of silently reducing it. The numerical limits in section 8.1 remain benchmark proposals. Export the accepted current version with no additional model call.

## 9. Operations and miscellaneous requirements

### 9.1 Backups and recovery

- Implement encrypted database exports and asset manifests with checksums. Include or document restoration of application data, RLS/functions/migrations, identity mappings and necessary auth configuration; an application-table dump alone is not a full account recovery plan.
- Database backups do not contain the image bytes stored in object storage. Supabase explicitly distinguishes database backups from storage objects in its [backup documentation](https://supabase.com/docs/guides/platform/backups).
- Protect committed images from accidental deletion with a separate backup copy or explicit delayed-deletion recovery strategy. Immutability alone is not a backup. Account for backup storage and write operations.
- Use incremental immutable asset copies plus dated manifests; do not make seven full binary copies of every user's history. One live 2.5 GiB library plus seven full copies would already exceed the intended free storage envelope. Track deleted-but-retained backup assets and churn against the global reserve, and expire them only when no retained recovery point needs them.
- For this beta, propose a nightly backup attempt, seven daily recovery points, a target recovery point within 24 hours and operator recovery within one working day. These are objectives, not an uptime/data-loss SLA; actual backup freshness is monitored.
- A backup bucket under the same provider/account does not protect against all account loss. Keep recovery credentials offline and periodically test an encrypted copy in an independently controlled location if the owner wants that protection.
- Practice restoring a synthetic multi-project account into an isolated environment: login ownership, originals, history, masks, overlays, current pointer, usage and exports must work. Replay deletion tombstones.
- Record latest successful backup/cleanup/export job and alert on age. Scheduled GitHub jobs can be delayed, and public-repository schedules can be disabled after inactivity; provide a manual dispatch/runbook. [GitHub scheduling behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

### 9.2 Maintenance without a paid worker

Use bounded, restartable maintenance batches with durable progress: orphan cleanup, trash/account purge, expired reservations/results/exports, backup creation, usage reconciliation. A protected GitHub workflow can operate directly on Supabase database/storage without keeping Render awake. Never make its first step call a sleeping app to discover all work.

Schedules are best-effort; define what happens if cleanup is late. Storage remains counted until removal is confirmed, exports show pending instead of an invented completion time, and an operator can safely resume work. If reliable time-bound execution becomes required, move maintenance to a supported scheduler/executor.

### 9.3 Security and privacy work

- Validate actual image formats, frame counts, pixel budgets, malformed files, oversized prompts/names, integer geometry and mask lengths. Reject URL-based arbitrary server fetches; no user-provided storage keys or external fetch URLs.
- Preserve exact input pixels outside protected/effective masks, complete candidates in review, and source-space coordinates. Test normalization/orientation as part of that contract.
- Keep buckets private, signed URLs out of logs, response caching scoped safely, and private pages/thumbnails excluded from public indexing and social previews.
- Add and test security headers/CSP appropriate for OAuth, canvas, blob images and fonts; do not use a broad policy that breaks the editor or a permissive wildcard as a permanent fix.
- Scope same-origin session/auth handling, file-download content types/disposition, names, and CORS. Prevent caching an authenticated response for another user.
- Document where images/prompts go, source metadata handling, retention/deletion, backup expiry, subprocessors and support access. Validate provider policies before publishing claims about training or retention.
- Record applicable policy acknowledgement versions. Identify intended audience/regions and obtain any necessary legal review; this plan does not claim regulatory compliance.
- Keep security reports private as in `SECURITY.md`; update product support channels before launch. Do not invite private user images into public GitHub issues.
- Audit dependency licenses for fonts/brand/demo assets, runtime packages and exported content notices. Use approved assets already in the repository.

### 9.4 Support and observability

Track requests by safe correlation ID, user/account reference, operation class, phase, latency, outcome and release ID. Do not put raw prompts, images, cookies or provider keys in routine logs.

Track actionable metrics: upload/verification failures, save failures/conflicts, generation stage errors/unknown outcomes, process memory, storage headroom, requests/egress, quota rejections, overdue deletion/export tasks and backup freshness. Small beta operation can use provider consoles plus protected scripts; a full operational dashboard is deferred, while the minimal owner invitation/approval UI is included.

Required operator actions: issue invitations, review/approve/reject access requests, revoke access, suspend an account, disable AI globally, adjust allowances only through explicit owner action, investigate a request without opening image content, retry maintenance, rotate credentials and restore backups. Every sensitive action has a documented authentication path and audit record. Manual SQL edits are not the routine control plane for user history.

The minimal access-management UI is owner-only. Do not infer owner privileges from a client field or user-editable profile metadata. Restrict owner assignment through deployment/operator-controlled configuration and test direct unauthorized API calls. Invitation delivery can initially use an owner-copied link; automated invitation email is not assumed.

Write short runbooks for: bad release, provider outage, database pause/outage, Supabase Storage access failure, lost/unknown AI result, duplicate-charge concern, storage full, compromised credential, deletion stalled, and backup restore. Assign an owner and escalation contact; a plan without an operator is incomplete.

### 9.5 Browser, product, and data details often missed

- Original JPEG bytes versus normalized working PNG; EXIF orientation/GPS, color profiles, alpha and animation handling need explicit behavior.
- Text renders with loaded fonts before accepting/exporting. Review browser differences and avoid font requests leaking unnecessary information if fonts are self-hosted.
- Remote images need proper CORS/fetch-to-Blob behavior; test canvas export for taint/security errors and URL expiry.
- Existing image exports are not editable project backups. Provide account/project data export separately; define its versioned manifest before advertising portability.
- Limits apply to generated images, Resize, Extend, masks and overlays, not just initial upload.
- Account switching, browser back cache, aborted requests and stale promises must not leak prior account state.
- Deep links, expired sign-in callbacks, missing projects, renamed/deleted projects, and browser refresh must resolve consistently.
- A cached old app after deploy must not submit an incompatible command silently.
- Product language must distinguish original, accepted version, unaccepted preview, pending save, and AI attempt. Do not call every state “history.”
- Login eligibility, user quotas and abuse controls remain server-enforced even if an attacker bypasses the UI.
- Avoid adding trackers/cookie banners by default; if analytics are introduced, determine their privacy requirements and keep image/prompt content out of events.
- Separate public site metadata/sitemap from authenticated routes. Use fixed approved social images, never a user's current project.
- Define end-of-beta communication, data export/deletion window, and what happens if free hosting is discontinued or the owner stops funding AI.

## 10. Implementation sequence and delivery units

Each numbered unit is one cohesive feature or repository concern, with its own PR. If a unit needs domain/server/UI changes, use separate coherent commits within that PR, with tests alongside the concern. Do not combine unrelated units into a mega-PR. Estimates should follow the first deployment spike rather than assume the local plan's former weekly schedule applies.

### Wave A — Confirm the foundation

| Unit | Work and dependency | Completion evidence |
|---|---|---|
| P00 | Product direction agreed; D10 allowance semantics carried to P14 and documentation reconciliation tracked separately | Decision record updated; proceed to P01 without claiming deferred work is complete |
| P01 | Isolated Render/Supabase database/Storage feasibility spike with synthetic fixtures; measure pinned runtime, Sharp, maximum image and longest fake pipeline | Build/start/transfers/auth proof, peak memory/timing report, verdict on supported envelope and HTTP execution |
| P02 | Reproducible environments, configuration validation, deployment skeleton, health and required CI | Repeatable isolated deploy with AI off; no production data/secrets in tests |

P01 must not expose existing unauthenticated local routes or enable paid calls. If the host fails, select another measured runtime or revise scope before integration work assumes it works.

### Wave B — One complete owned project

| Unit | Work and dependency | Completion evidence |
|---|---|---|
| P03 | Accounts and eligibility: OAuth, sessions, invitations/access requests/owner approval/profile, protected route helpers; after P02 | No user-count cap; idempotent grants/approval, ineligible-user denial, sign-out/account-switch and callback recovery |
| P04 | Private asset foundation: Supabase Storage staging/finalization, quotas, original/base normalization; after P03 | Upload retries, size enforcement, immutability, anonymous/foreign access denial, cleanup record |
| P05 | Cloud project creation/read with minimal My projects list and stable editor URL; after P04 | Upload → saved original → logout/login → reopen original |
| P06 | Durable acceptance and incremental save: transactional operation/version, receipts, pending UI; after P05 | Local edit → exactly one cloud operation/version → refresh → same pixels; lost acknowledgement test |
| P07 | Lazy history and durable undo/redo/original navigation; after P06 | Large-history memory test, dimension-changing undo, valid-source and redo replacement tests |

At this checkpoint the main vertical slice is usable with local/fake edits. Deploy only to controlled testing; lifecycle and launch gates still remain.

### Wave C — Complete the personal product

| Unit | Work and dependency | Completion evidence |
|---|---|---|
| P08 | Library completion: thumbnails, pagination/search/sort, rename; after P05–P07 | Empty/error/long-name/narrow cases; no full-history list downloads |
| P09 | Browser draft cache and cross-surface navigation/session recovery; after P06–P07 | Same-account draft restore, eviction/denial fallback, stale-base rejection, logout purge; no dedicated conflict UI |
| P10 | Export completion: accepted-version download, format/background/filename, original download; after P07 | No provider calls, correct dimensions/transparency, remote canvas test |
| P11 | Trash, restore and project purge; after P08 and maintenance foundation | Restorable project; purge retry; no asset resurrection or premature quota release |
| P12 | Account settings, usage and deletion; after P03/P11 | Recent-auth deletion, in-flight result cleanup, cached session denial |
| P13 | Portable account data export; after P07/P12 and maintenance foundation | Manifest/assets complete, private expiring result, large export bounded, deletion race handled |

### Wave D — Controlled real AI

| Unit | Work and dependency | Completion evidence |
|---|---|---|
| P14 | Shared durable attempt/usage admission foundation and sanitized diagnostics; after P03–P06 | No route can bypass limits; reservations/idempotency/unknown outcomes tested with fake stages |
| P15a | Localized AI editing cloud integration; after P07/P09/P14 | Review/protected invariants; Replace stages metered; stored result survives lost response |
| P15b | Transform cloud integration; after P15a | Local Monochrome remains unmetered; source planning/generation/fidelity metered; acceptance gate cannot be forged |
| P16 | Extend cloud integration; after P15a/P14 | Owned cached analysis, plan tamper rejection, output caps, complete candidate review, stage charging |
| P17 | AI creation cloud integration; after P14/P08 | Owned pre-project session; selecting result creates one original and zero edit operations |

P15a, P15b, P16 and P17 are separate feature deliveries because they have different contracts. References to P15 below mean both P15 deliveries where applicable. Do not enable one while leaving another route unguarded. Paid smoke tests require an explicit budget and run outside ordinary CI.

### Wave E — Lifecycle operation and release

| Unit | Work and dependency | Completion evidence |
|---|---|---|
| P18 | Maintenance execution foundation: protected scheduled/manual batches, task progress and retry | Orphan cleanup works after interruption; no public maintenance endpoint; can precede P11–P13 |
| P19 | Backup/restore and deletion reconciliation; after P06/P18, extended after lifecycle features | Restored multi-project fixture with assets/ownership and deletion tombstones |
| P20 | Public pages, help/policy content and consistent account shell; after scope decisions | Scroll/accessibility/responsive/metadata checks; promises match implemented product |
| P21 | Operational visibility, runbooks, spend alerts and release rollback; after P02/P14/P18 | Alert exercise, AI off switch, bad-release rollback and credential rotation exercise |
| P22 | Integrated release qualification; after all applicable units | Section 11 evidence complete; invited rollout first; real AI gate evaluated separately |

**Dependency clarification:** P18 is listed with operations for ownership, but must be delivered before P11's purge and P13's export are declared complete. P14 can begin once the vertical slice exists; full UI polish need not block its tests. P20's basic public/login layout can arrive earlier with P03, with policy completion before release. Nothing about wave ordering permits launching before required security/lifecycle work.

One valid execution order is: **P00 → P01 → P02 → P03 → P04 → P05 → P06 → P07 → P08 → P09 → P10 → P18 → P11 → P12 → P13 → P14 → P15a → P15b → P16 → P17 → P19 → P20 → P21 → P22**. This order is a planning dependency sequence, not authorization to create multiple tasks or delegate work. P14's metadata-only diagnostics and route disabling must still exist for a deterministic beta; real-provider integration can stay feature-disabled.

### Documentation delivery rules

- After scope approval, add the cloud architecture/decisions to `PROJECT.md` and link this plan from the execution index; preserve completed local milestone history.
- Update each relevant `FEATURE_CONTEXT.md` entry in its feature PR, including cloud failure modes and source/test references.
- Update `FRONTEND_DESIGN.md` only when an approved reusable pattern changes, not to present proposed screens as already implemented.
- Update README/setup/security/support/env guidance and add migration/deployment/operations runbooks with the matching delivery units.
- Keep this plan's delivery status tied to evidence. Do not mark a feature complete merely because its UI exists or its happy-path test passes.

## 11. Verification and release gates

### 11.1 Required test layers

| Layer | Coverage |
|---|---|
| Domain/unit | Existing coordinates/masks/pixels/history/export invariants; revisions, idempotency, quota windows, reservations and status transitions |
| Database integration | Actual migrations, RLS/grants, owner isolation, cross-project references, transactional commits/quotas, concurrent writes, deletion |
| Asset integration | Real or faithful storage behavior: signing/CORS/expiry, checksum/size validation, promotion race, lost response, cleanup |
| Provider integration | Fake success/slow/failure/unknown/late result; stage budgets and explicit retry behavior; limited real smoke after approval |
| Browser | Sign-in/session, library, upload, edit, save, history, export, trash, account lifecycle; no browser-only authorization shortcuts |
| Deployment | Production Linux build/start, memory envelope, shutdown, cold start, migration/rollback, no local durable data |
| Recovery | Database-plus-asset restore, missed schedule, partial deletion, lost commit response, interrupted generation |

Keep existing `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and relevant `npm run test:e2e` checks. Expand CI with meaningful cloud tests; mocks alone cannot prove RLS or Supabase Storage authorization/CORS. Test OAuth callbacks with controlled fixtures in CI and a real staging login manually; do not automate around Google login protections.

### 11.2 End-to-end and failure acceptance matrix

| Test ID | Scenario | Required result | Primary units |
|---|---|---|---|
| T01 | Eligible first/repeat login; repeated callback | One profile, stable ownership; no duplicate invitation claim | P03 |
| T02 | Ineligible user calls APIs directly | No project, upload permission or paid work | P03/P14 |
| T03 | User A substitutes B's project/version/asset/request IDs | Denied without leaking data, including diagnostics and exports | P03–P17 |
| T04 | Logout and login as another user; browser back | No former account canvas/list/private cache displayed | P03/P09 |
| T05 | Valid JPEG/PNG upload | Exact original bytes retained; normalized editor coordinates/dimensions correct | P04/P05 |
| T06 | Oversize, malformed, animated or huge decoded input | Bounded rejection before dangerous decode/provider work | P04/P14 |
| T07 | Staging upload replay or mutation after verification | Committed immutable bytes cannot change | P04 |
| T08 | Upload succeeds, finalize/DB response fails | Retry yields one project or safe cleanup, not duplicate originals | P04/P05 |
| T09 | One accepted local/generative edit | Exactly one operation/version and correct current pointer | P06/P15–P17 |
| T10 | Commit succeeds but response is lost | Same key recovers receipt; no duplicate accepted edit | P06 |
| T11 | Save fails, tab remains open | Pending pixels retained; accepted history unchanged; retry available | P06/P09 |
| T12 | Two edit commits target the same current image | Atomic valid-source acceptance prevents a broken linear chain; no bespoke conflict UI required | P06/P07 |
| T13 | Undo/redo/original then reload | Correct persisted current version and dimensions; original navigation retains redo | P07 |
| T14 | New edit after undo | Future replaced deliberately; no branching promised; safe asset cleanup | P07/P18 |
| T15 | Crop/Resize/Rotate/Flip/Text/Watermark/Paint save/reopen | Correct immutable pixels, source/output mask rules, overlay assets | P06/P07 |
| T16 | Review-mode candidate changes outside selection | Complete normalized candidate preserved | P15 |
| T17 | Protected/deterministic outside-mask pixels | Exact decoded pixel preservation | P06/P15 |
| T18 | Transform fidelity fails or unavailable under blocking policy | Cannot bypass acceptance with a forged client field | P15 |
| T19 | Extend cached analysis tampered, wrong source, oversized frame | Reject before paid generation; legitimate cached analysis avoids repeat cost | P16 |
| T20 | Same generation request resent; SDK/browser retries | No duplicate dispatch through Mirai; uncertain provider outcome is explicit | P14–P17 |
| T21 | Provider started, host dies or connection times out | Durable uncertain status; no automatic repurchase or false refund | P14/P21 |
| T22 | Result stored, browser closes/reloads | Owned result retrievable until expiry without a model call | P14–P17 |
| T23 | AI creation before project; Use image double-click | One new original/project, zero edit operations | P17 |
| T24 | Storage/AI quota hit concurrently in two tabs | Reservations prevent oversubscription; no unpaid/unreserved stage | P04/P14 |
| T25 | Per-user allowance remains but global cap exhausted | New paid work stops; reads/export/local tools remain available | P14/P21 |
| T26 | Delete account/project during generation/save | No resurrection; late assets purged and usage reconciled | P11/P12/P14 |
| T27 | Trash restore and partial permanent deletion | Restore only before purge; retries safe; quota freed after physical deletion | P11/P18 |
| T28 | Export PNG/JPEG with expired remote URL or alpha | Renew authorized read; explicit background; correct dimensions; zero model calls | P10 |
| T29 | Hundreds of version metadata entries | Current image usable without decoding every version; bounded memory | P07/P08 |
| T30 | Missing thumbnail versus missing current asset | Thumbnail fallback; current asset integrity error, never silent reset/history loss | P07/P08 |
| T31 | Provider unavailable or real AI disabled | Local tools, reading and export work; no fake output pretending to be real AI | P14–P17 |
| T32 | Session expires during save | Reauthenticate same account and reconcile; no cross-account save | P03/P09 |
| T33 | App deployment with old tab and new schema | Compatible command or safe reload/error; no corruption | P02/P06/P22 |
| T34 | Scheduled cleanup/backup missed | Overdue signal, safe manual rerun, no premature quota release | P18/P19/P21 |
| T35 | Database and asset restore | Original/history/ownership work; deletion tombstones prevent resurrection | P19 |
| T36 | Private route/CDN/browser caching | No cross-user session, metadata, signed URL or image leak | P03/P04/P22 |
| T37 | Keyboard, 200% zoom, reduced motion, narrow screen | Essential navigation/save/review/export reachable and named | P08–P10/P20 |
| T38 | Account data export with many projects | Complete bounded private export; expiry/deletion handled | P13 |
| T39 | Diagnostic failure/injection/oversized artifact | No history/provider effect; protected/disabled artifact routes | P14 |
| T40 | Worst supported image on deployment host | Memory/time results meet chosen headroom; otherwise reduce envelope or change host | P01/P22 |
| T41 | Refresh with cached draft; stale base; denied/evicted browser storage | Same-account valid draft can be restored without acceptance; incompatible/absent cache fails safely; logout clears entries | P09 |
| T42 | Owner approves access request twice or also invites the same identity | One approval/grant only, five-image allowance not replenished; requester cannot self-approve | P03/P14 |
| T43 | Owner approves more than 25 accounts | No artificial user-count rejection; resource limits remain separately enforced | P03 |

### 11.3 Launch gates

**Gate A — Cloud foundation:** verified runtime, accounts/eligibility, private object storage, transactional owned project, no local-disk fallback, isolated secrets and tests.

**Gate B — Complete deterministic product:** project library, durable edits/history, browser draft cache/navigation handling, export, trash/account deletion, portable data export, source preservation, backups and runbooks. This can launch with AI disabled.

**Gate C — Real AI:** every paid route and substage metered; durable results/status; enforced dimensions/concurrency/spending; tested known/unknown failures; approved budget; host measured with representative bounded real requests. If it fails, do not expose real AI merely because login works.

**Gate D — Wider public launch:** explicit reassessment of host reliability, abuse volume, backup targets, support capacity, policies and budget. Passing the invited beta does not automatically justify unlimited public registration.

For each gate keep a release checklist with commit, date, environment, evidence and owner. No critical failed/untested case can be waived silently.

## 12. Plan audit and residual uncertainties

### 12.1 Review passes

This plan is reviewed as a document, not as a deployed-system certification. The preparation covered source behavior, journey completeness, failure/authorization boundaries and free-tier deployment constraints. The final document checks below record what was actually inspected.

| Pass | Review focus | Findings incorporated |
|---|---|---|
| A | Existing source versus product summaries | Base64 snapshot transfers, eager decoding, weak ownership, destructive reset, original JPEG re-encoding, absent timestamps, global overflow and stale Extend wording |
| B | Every user entry/exit and mutable state | Pre-project AI ownership, pending commits, draft navigation, account switching, conflict, trash, deletion and data export |
| C | Cross-service failures and hostile inputs | Staging overwrite race, signed-upload bounds, atomic reservations, trusted generative provenance, uncertain provider outcomes, late results after deletion, no fake worker promise |
| D | Free-tier and operating model | Host sleep/ephemeral disk, Supabase Free storage/egress limits, backup bytes, scheduler delays, identity restoration and upgrade triggers |
| E | Written-plan consistency and dependency audit | Split localized editing and Transform into separate PRs; made maintenance precede purge/export; clarified unknown commit versus discard, deletion receipts, backup amplification and global storage headroom |
| F | User decision reconciliation | Removed account-count ceiling, added access requests/owner approval and browser draft recovery, deferred dedicated conflict UI, recorded five-image allowance with unresolved coverage/renewal, omitted local-data import |

### 12.2 Remaining items that require implementation evidence

- Exact runtime compatibility, peak memory, worst-case pipeline duration and safe image envelope: P01/P22.
- Effective transfer-size enforcement and immutable staging promotion behavior on actual Supabase Storage: P04.
- OAuth consent/publishing requirements for the owner's accounts/domain and final invitation method: P03.
- Provider-specific cancellation/idempotency/retry/usage behavior: P14–P17; no exactly-once external execution claim without evidence.
- Whether a request-bound free beta is acceptable or a paid durable executor is necessary: Gate C.
- Account/auth restoration mechanics, backup encryption destination and achievable recovery targets: P19.
- Final approved limits, billing/payment-method tolerance, privacy/retention wording and legal applicability: P00/Gate D.

All identified uncertainties have an owner delivery unit or release gate. No plan can guarantee that implementation reveals no additional issue; newly discovered material behavior, security, cost or architecture changes must update this plan and the relevant feature scope before expansion.

### 12.3 Coverage cross-check

| Coverage | Delivery owner(s) | Verification |
|---|---|---|
| UI01–UI03: public entry, authentication, onboarding | P03/P20 | T01/T02/T04/T32/T37 |
| UI04–UI05: library and new upload | P04/P05/P08 | T05–T08/T24/T29/T30 |
| UI06: creation dialog | P17 | T20–T25 |
| UI07–UI09: editor, controls and history | P06/P07/P15a/P15b/P16 | T09–T19/T29 |
| UI10–UI11: pending work; dedicated conflict UI deferred | P09 | T10–T14/T32/T33 and browser-cache tests |
| UI12: export | P10 | T28/T37 |
| UI13: trash and project actions | P08/P11/P18 | T26/T27/T34 |
| UI14–UI15: account and usage | P12/P13/P14 | T24–T26/T32/T38 |
| UI16–UI17: help/policy/global errors | P20/P21/P22 | T03/T31/T36/T37 plus content review |
| UI18: request recovery | P14–P17 | T20–T23 |
| UI19: owner access management | P03/P14 | T42/T43 |
| G01–G05: routing, shell, fonts and orchestration | P03/P05/P08/P09/P20 | UI walkthrough and source-boundary review |
| G06–G14: storage, ownership, history and source fidelity | P03–P07 | T03/T05–T17/T29/T30 |
| G15–G19: AI/diagnostics | P14–P17 | T18–T26/T39 |
| G20–G22: export, CI and deployment | P02/P10/P19/P21/P22 | T28/T33–T40 |

Final structural review checks section links, unique decision/gap/UI/delivery/test IDs, endpoint coverage against the repository's route inventory, feature-to-delivery mapping and dependency order. This is documentation verification; application tests and cloud deployments are intentionally left to the implementation units.

### 12.4 Suggested next action

Start P01; resolve the remaining D10 allowance clarification before P14 activates real AI: prove that the exact Mirai runtime, one private upload, an owned metadata record and representative image processing fit the chosen free services. This is the cheapest point to discover a hosting mismatch before implementing the full account/project interface.
