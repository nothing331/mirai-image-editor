# Cloud Wave A implementation-readiness specification

**Status:** Approved; P01 implementation started. GitHub, Render, region, and Supabase provisioning are complete.
**Prepared:** 6 September 2026.
**Parent plan:** [CLOUD_IMPLEMENTATION_PLAN.md](./CLOUD_IMPLEMENTATION_PLAN.md)
**Confirmed scope:** **Wave A — Confirm the foundation**.

## 1. Purpose

Wave A answers the expensive architectural questions before Mirai is coupled to cloud services:

1. Can the exact Next.js, Node, Sharp, Supabase, and selected private object-storage stack run reliably on the proposed Render service?
2. What image-size and request-duration envelope is safe on that runtime?
3. Can Mirai be deployed reproducibly with configuration that fails closed, synthetic data only, and paid AI disabled?

Wave A is complete only when its claims are supported by recorded measurements and repeatable deployment evidence. A successful build alone is insufficient.

## 2. Scope

### 2.1 P01 — isolated feasibility spike

P01 will create a deliberately narrow, non-production proof using synthetic fixtures. It consists of:

- a production-mode Linux build and start using the repository's pinned Node `24.19.0`, npm `11.17.x`, Next.js `16.3.2`, and Sharp `0.35.3`;
- a private Supabase test project proving a minimal metadata write/read and authenticated ownership boundary;
- a private object-storage test bucket proving server-side object write/read/delete and a short-lived authorized browser transfer;
- a synthetic image-processing benchmark across representative image sizes;
- a worst-supported-image benchmark that records peak memory, processing time, request time, output size, and failure behavior;
- the longest representative fake-provider pipeline executed through an HTTP request;
- cold-start, restart, ephemeral-filesystem, timeout, and shutdown observations on Render;
- a written verdict: proceed with the proposed envelope, reduce the envelope, change the host, or require a later durable executor for real AI.

The spike must not expose the repository's existing unauthenticated project or diagnostic routes. It must not use production data, real user images, or a paid AI provider.

### 2.2 P02 — reproducible cloud foundation

P02 begins only after the P01 verdict is accepted. It consists of:

- explicit local, CI, staging, and invited-beta environment modes;
- startup validation for required configuration and incompatible settings;
- deployment configuration for the chosen Render runtime;
- a cheap liveness endpoint and a bounded readiness check that disclose no secrets or user data;
- an expanded `.env.example` containing names and safe descriptions, never credentials;
- CI proof for locked installation, lint, type-check, tests, production build, and cloud-foundation checks;
- migration and deployment skeletons that do not apply schema changes automatically on every app start;
- release identification and documented rollback steps;
- confirmation that cloud mode cannot silently fall back to local SQLite or local filesystem persistence;
- setup and troubleshooting documentation sufficient for a second clean deployment.

### 2.3 Explicit non-goals

Wave A does **not** implement:

- the customer-facing Google sign-in or onboarding journey;
- invitations, access requests, profiles, or owner administration;
- the project library or cloud editor persistence;
- production database schemas for projects/history;
- real AI calls, AI allowances, metering, or background jobs;
- custom-domain launch work, public policy pages, trash, backups, or account deletion;
- migration of existing local test projects.

Those capabilities begin in P03 or later delivery units. Wave A may use a synthetic authentication fixture or a minimal isolated auth proof, but it must not be presented as the finished authentication feature.

## 3. Proposed spike architecture

```text
Synthetic browser/client
        |
        v
Isolated Next.js service on Render
   |             |              |
   |             |              +-- fake AI pipeline only
   |             +-- private object-storage test objects
   +-- Supabase test metadata/auth proof
```

All resources are isolated from future beta data. Object keys and database rows use an environment-specific prefix or dedicated resource. Test objects are safe to delete after evidence is captured.

## 4. Dependencies and ownership

### 4.1 What the repository already provides

- a pinned Node runtime in `.nvmrc` and npm version in `package.json`;
- locked JavaScript dependencies;
- Next.js production build/start scripts;
- Sharp-based server image processing;
- fake image-edit and asset-generation providers;
- lint, type-check, unit/integration, build, and manual Playwright workflows;
- synthetic test fixtures and existing editor invariants;
- a server-side provider boundary, so no real AI key is needed for Wave A.

### 4.2 What the user must own or decide

| Dependency | Needed for | User action | Secret handling |
|---|---|---|---|
| GitHub repository/admin access | Render connection and protected CI settings | **Complete:** repository is connected through the plugin | Do not send a personal access token in chat |
| Render workspace | P01 runtime test and P02 staging deployment | **Complete:** a new web service is deployed with fake AI | Store service variables in Render; do not enable real AI |
| Supabase organization/project | P01 metadata/auth and proposed storage proof | **Complete:** a new organization/project exists and is connected through the plugin | Put URL/publishable key and server-only key in the appropriate secret stores; never commit them |
| Private object storage | P01 object-transfer proof | **Approved:** use Supabase Storage for zero-billing Wave A | Use a private, isolated bucket and narrowly scoped access |
| Cost posture | Stop/go protection | **Confirmed:** free-tier-only, with no payment-method or future-overage exposure | No paid service activation, automatic upgrade, or real AI is authorized |
| Region choice | Latency and data location | **Complete:** selected by the user | Record as configuration/decision, not a secret |
| Operator/recovery owner | Account continuity | Name who retains MFA/recovery codes for GitHub, Render, Supabase, and Cloudflare | Recovery codes stay offline, not in the repository |

The user has completed the initial GitHub, Render, Supabase, and region setup. Account creation, accepting payment terms, entering payment details, MFA, and recovery-code custody remain user actions.

### 4.3 Zero-billing storage decision

Cloudflare R2 currently requires activation of a usage-based subscription. Its Standard tier includes monthly no-charge allowances, but usage above those allowances is billable and the free allowance is not a hard spending cap. Cloudflare accepts PayPal, but an empty PayPal balance is not a reliable cost control: charges can still become an outstanding account balance, access can be suspended after payment failure, and R2 data may eventually be deleted if the payment issue is not resolved.

Therefore, this specification recommends:

1. Do not activate R2 and do not add a card or empty PayPal account for Wave A.
2. Use a private bucket in the already-created Supabase Free project for P01/P02.
3. Cap Mirai's Wave A fixture storage well below Supabase's included 1 GB file-storage allowance and clean up every benchmark run.
4. Reassess R2 before a larger invited beta if measured image history cannot fit safely within Supabase Storage's free envelope.

This material change from the parent plan's former Render + Supabase Postgres/Auth + R2 architecture was approved on 6 September 2026. The parent plan's D04, P01/P02 storage wording, capacity assumptions, and later P04 design are revised consistently; R2-specific immutability, signed-transfer, CORS, and cost tests become Supabase Storage equivalents.

### 4.4 Not required from the user yet

- Google OAuth client ID/secret;
- a custom domain or DNS access;
- an OpenAI API key or real-provider test budget;
- production user email addresses or images;
- privacy-policy/legal wording;
- backup encryption keys or alert destinations.

These should not delay P01. Requesting them now would unnecessarily widen the blast radius of the spike.

## 5. Configuration contract

Implementation will settle exact variable names in P02. The contract must cover these categories:

- application environment/mode, canonical URL, release ID, and allowed origins;
- `AI_ENABLED=false` plus explicit fake provider selection;
- Supabase URL and browser-safe publishable key;
- server-only Supabase credential for narrowly scoped spike operations;
- selected object-storage endpoint/project, private test bucket or namespace, and scoped server credentials;
- upload byte, image edge, total pixel, concurrency, signing-TTL, and request-time limits;
- optional benchmark enablement restricted to the isolated environment;
- health/readiness behavior.

Configuration validation must reject missing required values, browser exposure of server secrets, a production-like mode paired with local persistence, or real AI enabled without a separately approved gate.

## 6. Benchmark design

### 6.1 Fixtures

Use generated, non-sensitive PNG/JPEG fixtures including:

- small control images;
- representative 1,024 px and 2,048 px images;
- incompressible/noisy images to avoid unrealistically favorable file sizes;
- transparency and JPEG orientation cases relevant to normalization;
- one deliberately over-limit input to prove bounded rejection.

The proposed 2,048 px edge / 4,194,304-pixel envelope is a hypothesis, not an acceptance criterion.

### 6.2 Measurements

For each relevant case record:

- cold or warm start;
- input dimensions and encoded bytes;
- processing stages and output dimensions;
- wall-clock duration;
- peak resident memory where the platform permits observation;
- object-storage transferred bytes and request count;
- HTTP response status and whether the result remained recoverable;
- cleanup result;
- relevant Render instance type and release ID.

Run heavy cases serially because the proposed beta begins with one global heavy-processing slot. Add enough headroom for duplicated RGBA buffers, Sharp buffers, masks, and encoded outputs; do not infer safety from file size alone.

### 6.3 P01 decision rule

Recommend **proceed** only if:

- build/start works on the actual Render Linux runtime;
- a representative request completes inside observed host constraints with defensible memory/time headroom;
- failure and over-limit inputs are bounded rather than crashing or hanging the service;
- Supabase database/auth and the selected object store work without local durable state;
- private objects are not anonymously readable;
- test cleanup is repeatable;
- the longest fake pipeline has an honest request-bound behavior.

Otherwise recommend one of: reduce the supported image envelope, use paid/larger compute, change host, or keep real AI disabled pending a durable executor. Any such material change requires user approval before P02 assumes it.

## 7. Security and safety constraints

- Default deny: no production route is made public merely to run a benchmark.
- Synthetic data only; never copy current local project files to cloud storage.
- AI providers remain fake, and no paid-provider credential is installed.
- Supabase privileged and object-storage secret credentials remain server-side.
- Object storage is private; authorized transfers use short-lived permissions and tested access controls/CORS.
- Logs and CI artifacts exclude credentials, signed URLs, image bodies, cookies, and raw private content.
- Render's filesystem is treated as ephemeral and never as the source of truth.
- Benchmark endpoints or scripts are disabled or removed from ordinary deployments after P01.
- Resource cleanup is idempotent and limited to the explicit Wave A test namespace.

## 8. Delivery plan

### 8.1 Review checkpoint — approve this specification

Before code changes, confirm:

1. Supabase Storage replaces R2 for the zero-billing Wave A architecture.
2. Wave A includes P01 and P02, delivered separately.
3. The operator/recovery owner is identified before release operations are configured.

### 8.2 P01 pull request — feasibility spike

Expected concern-separated commits:

1. `test(cloud-spike): add synthetic runtime and image benchmarks`
2. `chore(cloud-spike): add isolated service integration harness`
3. `docs(cloud-spike): record measurements and hosting verdict`

The exact sequence may change after source inspection, but P01 remains a repository/spike delivery and must not smuggle in customer-facing cloud features.

### 8.3 User checkpoint — accept the P01 verdict

P02 does not proceed automatically if P01 recommends a different host, paid runtime, lower image limit, or new executor. The user approves the resulting product/cost change first.

### 8.4 P02 pull request — reproducible foundation

Expected concern-separated commits:

1. `build(cloud-runtime): add validated deployment configuration`
2. `test(cloud-runtime): enforce environment and health contracts`
3. `docs(cloud-runtime): document deployment and rollback`

P02 updates `PROJECT.md` only for approved project-wide cloud architecture decisions. It updates README/configuration guidance and this plan's status based on evidence. It does not mark P03+ features as implemented.

## 9. Acceptance criteria

### P01 acceptance

- [ ] Pinned dependency installation and production build succeed on the target Linux runtime.
- [ ] Next.js starts on the assigned host/port and survives a controlled restart.
- [ ] Sharp processes every accepted synthetic fixture; over-limit work fails safely.
- [ ] Peak memory and timing are recorded for each envelope case.
- [ ] Cold-start and longest fake-pipeline behavior are recorded.
- [ ] A private object can be uploaded, verified, read with authorization, and deleted using the approved storage service.
- [ ] Anonymous and wrong-scope object access fail.
- [ ] A Supabase metadata/auth ownership proof succeeds and a foreign-user read fails.
- [ ] No paid AI call, production data, or local-disk durability is used.
- [ ] Cleanup succeeds and leaves no unexplained test resources.
- [ ] The report gives a supported-envelope and request-execution verdict.

### P02 acceptance

- [ ] Local, CI, staging, and beta modes are explicit and documented.
- [ ] Configuration fails fast and safely for missing or conflicting values.
- [ ] Cloud mode cannot silently use local SQLite/filesystem persistence.
- [ ] Liveness is cheap; readiness is bounded and non-sensitive.
- [ ] Deployment from a clean checkout is repeatable with AI disabled.
- [ ] CI uses synthetic/disposable fixtures and contains no beta secrets/data.
- [ ] Migration execution is protected and separate from app startup.
- [ ] Release ID, rollback target, and verification result are recorded.
- [ ] A second clean-deployment walkthrough succeeds from the documentation.

## 10. Deliverables

Wave A should leave behind:

- one P01 measurement report with raw commands/fixture descriptions and a verdict;
- benchmark and integration tests safe to rerun;
- one P02 deployment/configuration foundation;
- a safe `.env.example` and environment matrix;
- health/readiness checks;
- CI evidence;
- a deployment and rollback runbook;
- updated parent-plan status and approved architecture documentation;
- a list of resources created, their owners, recurring cost posture, and cleanup state.

## 11. Risks and tradeoffs

| Risk | Consequence | Mitigation / decision point |
|---|---|---|
| Render Free sleeps and can restart | Slow first request; request-bound work may be interrupted | Measure it in P01; never promise always-on behavior |
| Render filesystem is ephemeral | Existing SQLite/assets would disappear | Prove all spike durability in Supabase database/storage; fail closed in cloud mode |
| Current Node 24 requirement is unsupported or unstable on target | Build/runtime failure | Verify before changing versions; changing runtime is an explicit P01 verdict |
| Sharp/image buffers exceed memory | Crashes or unsafe concurrency | Measure worst cases; reduce image envelope or choose larger compute |
| Direct signed upload cannot enforce the intended byte bound | Storage/abuse exposure | Prove the selected service's transfer boundary in P04; do not advertise a hard limit prematurely |
| R2 requires a metered subscription | Conflicts with the guaranteed-zero-billing requirement | Do not activate R2; Supabase Storage substitution is approved |
| Supabase Free Storage is limited to 1 GB | Small capacity for immutable image histories | Keep Wave A synthetic and tiny; measure amplification; revisit storage before broader beta |
| Free-service limits change | Plan becomes stale | Record observed plan/instance/date and re-check before launch |
| Spike code leaks into public routes | Security exposure | Isolate and disable/remove it; test route availability in P02 |

## 12. Information needed to start

Wave A started after the user confirmed:

1. **Complete:** Supabase Storage replaces R2 for Wave A and the initial zero-cost architecture.
2. **Complete:** the intended work is Wave A.
3. **Complete:** GitHub, Render, and Supabase are connected/provisioned.
4. **Complete:** the primary region is selected.
5. **Complete:** the cost posture is free-tier-only with no billing exposure.

Credentials should never be pasted into this document or chat. They should be entered directly into the relevant provider dashboard or protected secret store when the implementation reaches that step.
