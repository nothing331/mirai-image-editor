# Mirai Cloud Product Journey

**Status:** Discussion draft
**Purpose:** Describe the product flow and major development areas required to turn the current local Mirai repository into a multi-user, cloud-hosted product. This is a journey plan, not an API or implementation specification.

## 1. Product goal

Mirai should let a user create an account, maintain multiple image-editing projects, return to any project from any supported device, review its complete accepted history, continue editing, and export the selected version.

The existing editing promise remains unchanged:

```text
Upload or create → edit → compare → accept or discard → undo/redo → export
```

The cloud product adds an account and project-management layer around that workflow:

```text
Discover → sign up → dashboard → create project → edit with autosave
→ return later → inspect history → export → manage account
```

## 2. Recommended first-release user flow

### A. Entry and account creation

1. The visitor sees a short landing page and a clear “Start editing” action.
2. They sign up with email/password or a trusted identity provider such as Google.
3. Email verification and password recovery are available.
4. A short onboarding screen explains projects, immutable history, AI usage, and image privacy.
5. The user enters their personal workspace.

### B. Project dashboard

The dashboard is the user’s home and should provide:

- a “New project” action;
- upload-image and create-with-AI starting points;
- recent projects with thumbnail, name, last modified time, and dimensions;
- search and simple sorting;
- rename, duplicate, archive, and delete actions;
- storage and AI-usage visibility;
- clear empty, loading, upload, and failure states.

Folders, team workspaces, sharing, and live collaboration can wait until the personal-project workflow is dependable.

### C. Creating a project

1. The user uploads a supported image or chooses Mirai’s existing AI creation flow.
2. Mirai validates the file, dimensions, size, and media type before accepting it.
3. Upload progress and retry are visible.
4. Mirai creates the project, stores the original as an immutable asset, creates the original image version, and opens the editor.
5. The original is never overwritten.

### D. Editing and saving

1. The existing editor loads the project’s current accepted version and history.
2. Temporary selections, paint drafts, and unaccepted previews remain session state.
3. Every accepted edit creates exactly one operation and one immutable version through the existing shared edit pipeline.
4. Accepted changes autosave; the UI shows saving, saved, offline/unsaved, and failure states.
5. Refreshing or reopening restores the last durably saved accepted version.
6. Only one active editor session should be supported initially. If the same project changes elsewhere, Mirai should detect the conflict instead of silently overwriting newer state.

### E. History and recovery

- The user sees a chronological history with operation name, timestamp, and thumbnail where useful.
- Undo and redo continue to select immutable versions in a linear history.
- The user can reopen a previous version for comparison or make it current according to the existing linear-history rules.
- Failed and discarded attempts do not enter accepted history.
- Deleting a project uses a recoverable archive/trash period before permanent asset removal.

### F. Export and return

1. The user chooses the accepted version and export format.
2. Mirai exports without another AI call.
3. Returning to the dashboard shows the updated thumbnail and timestamp.
4. The project can be reopened later with its original, versions, operations, masks, and referenced overlay assets intact.

## 3. Core product areas to build

| Area | First-release capability |
|---|---|
| Authentication | Sign up, log in/out, verification, password reset, session management |
| User workspace | One personal workspace per account, profile and account settings |
| Project library | Create, list, open, rename, duplicate, archive, restore, and delete projects |
| Cloud persistence | Durable project metadata, operations, versions, masks, and asset references |
| Image storage | Private original images, accepted versions, masks, overlays, and thumbnails |
| Upload system | Validation, progress, retry, limits, and resumable upload later if needed |
| Editor integration | Load cloud projects, autosave accepted edits, conflict protection, recovery states |
| History | Persist and reload the current linear immutable history model |
| AI execution | Authenticated server-side requests, per-user limits, cost controls, retries, and auditability |
| Export | Download the selected accepted version; optional asynchronous export for large work later |
| Account controls | Usage, storage, privacy, data export, and account deletion |
| Operations | Deployment, logs, metrics, error tracking, backups, migrations, and support tooling |
| Trust and safety | Access control, private assets, abuse controls, content policy, retention, and deletion |

## 4. Recommended data and storage model

Mirai needs more than one storage mechanism because structured records and large image files have different needs.

### Primary database: PostgreSQL

Use a managed PostgreSQL database as the system of record for structured metadata. It is a good fit for users, projects, ordered versions, edit operations, ownership, quotas, and billing records because these entities are relational and need transactions and reliable constraints.

Initial records should include:

- `users` and authentication identities;
- `workspaces` and workspace membership, even if v1 has only one owner;
- `projects` with owner/workspace, name, status, current version, and timestamps;
- `image_assets` with storage key, media type, dimensions, checksum, size, and lifecycle status;
- `image_versions` with project, parent version, asset, and creating operation;
- `edit_operations` with type, status, parameters, input/output versions, and request correlation;
- `mask_assets` and overlay-asset references;
- `ai_usage_events` for provider cost and user limits;
- `subscriptions` or credit records when paid plans are introduced;
- audit/security events that are useful for account recovery and support.

Do not store full PNG/JPEG data or large mask byte arrays in PostgreSQL. Store references and verified metadata there.

### Binary storage: private object storage

Use S3-compatible private object storage for originals, accepted versions, masks, overlays, thumbnails, and export artifacts. Objects should use opaque keys rather than user filenames. Access should be granted through short-lived signed requests or an authenticated application route.

The current immutable-asset rule maps well to object storage: write each original or accepted output once, reference it from PostgreSQL, and never replace it in place.

### Optional infrastructure, only when needed

- **Job queue:** for long-running AI edits, thumbnail generation, cleanup, or exports that cannot reliably complete inside one web request.
- **Redis or managed equivalent:** for queue coordination, rate limiting, and short-lived state—not as the system of record.
- **CDN:** for efficient delivery of authorized image previews.
- **Email provider:** verification, password recovery, usage warnings, and transactional messages.
- **Payment provider:** subscriptions, invoices, and checkout; Mirai should retain its own normalized entitlement and usage records.

## 5. Important product rules

- Every project and asset is scoped to an authenticated workspace; guessing an ID must never grant access.
- The original and every accepted image asset remain immutable.
- An accepted edit still creates exactly one operation and one image version.
- Temporary browser drafts and discarded previews do not become durable history.
- Image assets are private by default.
- Export reads an accepted stored version and never invokes the image provider.
- Database and object-storage writes must be coordinated so partial saves can be detected and recovered.
- Account deletion and project deletion must remove both metadata and binary assets according to a documented retention policy.
- Provider credentials remain server-side, and every paid AI request is attributed to a user and project.
- Development diagnostics currently contain private images and prompts; production diagnostics need strict access, redaction, retention, and per-user boundaries before they can be enabled.

## 6. Suggested delivery journey

### Phase 0 — Product decisions

Agree on the first customer, free versus paid launch, image/storage limits, supported upload sizes, retention rules, privacy promises, and whether login is required before a trial edit.

**Outcome:** a fixed first-release boundary and measurable success criteria.

### Phase 1 — Production foundation

Create hosted environments, managed PostgreSQL, private object storage, secrets management, database migrations, automated deployment, monitoring, backups, and a recovery procedure.

**Outcome:** Mirai can be deployed safely even before accounts are exposed.

### Phase 2 — Accounts and ownership

Add authentication, sessions, user/workspace records, route protection, ownership checks, account settings, and basic account deletion.

**Outcome:** two users cannot see or modify each other’s data.

### Phase 3 — Cloud project persistence

Replace the local SQLite/filesystem repository with a cloud storage implementation behind the existing project/storage boundary. Persist projects, originals, versions, operations, masks, overlays, and thumbnails. Add autosave status and conflict handling.

**Outcome:** a user can save, refresh, log out, log back in, and continue the same project without losing accepted history.

### Phase 4 — Project dashboard

Add the authenticated dashboard, new-project flow, recent projects, search/sort, rename, duplicate, archive, restore, and deletion.

**Outcome:** a user can manage multiple projects without project IDs or local files.

### Phase 5 — Production AI and usage controls

Move AI work into authenticated, metered execution with per-user limits, request idempotency, retry behavior, abuse protection, cost monitoring, and background jobs where required.

**Outcome:** AI features remain reliable and cannot create uncontrolled provider cost.

### Phase 6 — Export, billing, and lifecycle

Harden export/download, introduce plans or credits if required, show usage, support billing failures, add trash retention, data export, and complete account deletion.

**Outcome:** the product has a complete customer and data lifecycle.

### Phase 7 — Launch readiness

Run authorization, privacy, accessibility, performance, browser, backup-restore, failure-recovery, and end-to-end tests. Add support workflows, terms/privacy content, incident handling, and operational dashboards.

**Outcome:** Mirai is supportable as a public product rather than only deployable software.

## 7. Minimum viable cloud release

The smallest credible release should include:

- email or social login;
- one personal workspace;
- dashboard with multiple projects;
- upload or AI-create project;
- private cloud asset storage;
- autosaved accepted edits and reloadable immutable history;
- rename, archive/delete, and export;
- basic AI/storage limits;
- monitoring, backups, privacy controls, and account deletion.

It should deliberately exclude team collaboration, public sharing, folders, comments, branching history, mobile apps, batch processing, and advanced organization until the personal end-to-end journey is stable.

## 8. Decisions to make before implementation

1. Can an anonymous visitor try the editor before signing up, or is authentication required first?
2. Is the first release free with hard limits, credit-based, subscription-based, or invite-only?
3. What are the maximum image dimensions, file size, storage per user, and monthly AI allowance?
4. How long are deleted projects, failed AI artifacts, and request diagnostics retained?
5. Is access personal-only, or must the first schema support organization/team ownership immediately?
6. Does autosave cover only accepted operations, or should resumable temporary drafts become a product requirement?

## 9. Recommended starting point

Start with one vertical cloud slice rather than building every platform subsystem separately:

```text
Sign up → create one project → upload one image → accept one edit
→ persist its immutable history → log out/in → reopen → export
```

Once that slice is dependable, add dashboard management, limits/billing, lifecycle controls, and launch hardening. It exercises the most important boundaries early while preserving the editor behavior Mirai already has.
