# Wave D: controlled AI and shared welcome credits

**Status:** P14, P15a, P15b, P16 and P17 are implemented on `codex/wave-d-controlled-ai`. Local database, private Storage, fake-provider integration and browser checks cover every workflow. No real provider calls, hosted migration or AI activation were performed for this delivery. Funding and hosted qualification remain release gates.

## Product policy

- Invited members: five active projects; 25 one-time welcome AI credits shared across the account, with no reset or per-project partition.
- Active admin (`owner`) accounts have no project, welcome-credit, account-storage, hourly-attempt or lifetime-analysis allowance. The service-only database exemption reads the current trusted profile; browser input cannot enable it. Usage still records attempts and provider spending. Global funding, the off switch, execution concurrency, temporary result retention and global storage capacity apply to everyone.
- One credit per produced AI preview across creation, Remove, Replace, Restyle, generative Transform and Extend. Accept/discard/undo/delete do not refund produced work.
- Known generation failure restores the credit; transport timeout, server interruption and unknown outcomes keep it pending until reconciliation.
- Local processing, plain Monochrome and export use no credits. Exhaustion and the AI off switch leave them available.
- Extend's first owned source analysis consumes provider budget, with a lifetime cap of 25 analyses per member, and requires an available preview credit. Cached frame changes buy no new analysis and deduct no credit.

## Migration and safe release sequence

1. Review all Wave D contracts and concern-separated changes. Back up the target database and record the current application release. Verify Wave B/C migrations are present. Apply `20261002122038_wave_d_ai_admission.sql` then `20261002170436_owner_unlimited_allowances.sql` once through the protected migration workflow, never on app startup.
2. This migration upgrades the previously unconsumed five-image grants to 25 and replaces approval/invitation/bootstrap functions without replenishment. It creates service-only RLS-protected attempts/stages/sessions/analysis/accounting, a private result bucket, generative history acceptance and fenced cleanup/reconciliation. Original and accepted image bytes stay immutable. Review upgrade compatibility against the actual target schema before applying.
3. Deploy the matching app with real AI off. Retain `MIRAI_AI_ENABLED=false`, fake providers and no OpenAI key. The singleton database gate defaults to `enabled=false,budget_microusd=0`; a migration cannot fund or enable paid work. Check health, login, owned projects, local Save, undo/reopen and export.
4. Ensure protected maintenance uses this runner revision. Run **Cloud maintenance** manually in staging; its nightly staging schedule handles expired leases/results. Beta remains a manual workflow target until configured. Unknown attempts need operator evidence and cannot be automatically retried or refunded. Daily maintenance is cleanup, not an execution worker; operators may run it promptly after an interrupted request.
5. Qualify with fake providers and disposable accounts first. Set runtime AI enabled and database `enabled=true,budget_microusd=0` only for this isolated fake test. Verify the provider names are both fake and no real key is installed. Never carry test fixtures or test gate changes into the real target.
6. Before real AI, obtain a specific funding amount and define reviewed worst-case image/text stage ceilings. One USD is 1,000,000 integer micro-USD. Set the service-only database budget deliberately; credits granted to users are not a funding budget. Do not reset `committed_microusd`, delete accounting to free spend, or silently lift the ceiling.
7. Under that explicitly authorized smoke budget, measure representative maximum-envelope Remove/Replace, three-stage Transform, uncached/cached Extend and every creation aspect. Record wall time, peak RSS, cold start, provider correlation/usage, returned dimensions, private result recovery after a lost response, shutdown fencing and known/unknown failures. Compare with the target Render timeout/memory limits. No paid calls belong in ordinary CI. Set `MIRAI_AI_HOST_QUALIFIED=true` only after this evidence passes; the flag is a gate, not proof.
8. Configure server-only key/providers, positive `MIRAI_AI_IMAGE_STAGE_MICROUSD` and `MIRAI_AI_TEXT_STAGE_MICROUSD`, supported low/medium edit quality and edit and Extend provider input edges at most 1,536. Enable both runtime and database gates for an invited rollout after passing qualification. Requalify ceilings and host behavior when models, quality, dimensions or provider pricing change. If requests cannot reliably finish, leave AI off and separately approve a durable executor.

## Execution and accounting

Requests execute within their HTTP handler after durable admission. There is no detached promise or background worker. Database admission serializes across users and reserves one credit, all planned provider stages and storage before work. A rolling member cap of 60 attempts per hour also bounds failure/retry storms. One global running/unknown attempt blocks another; an executor ID fences racing handlers with the same key. Every subsequent stage rechecks active account/current source, lease and remaining reservation.

The installed SDK uses `maxRetries: 0` and a 60-second timeout per call. Text stages set `max_output_tokens: 4096`. The complete request may span up to three sequential calls inside a five-minute lease; host qualification must cover the total pipeline. Browser retries retain the same key and retrieve status/results before buying anything again. An unknown outcome can temporarily block all new AI work; local operations remain available.

`ai_stage_attempts` keeps only status, stage, provider correlation, sanitized numeric usage and effective configuration. Provider costs use conservative reviewed stage ceilings: succeeded or unknown stages retain their ceiling, confirmed provider rejections release theirs, and known downstream failure can restore the user credit without erasing paid stage cost. `ai_control.committed_microusd` survives account deletion. This is a conservative spend cutoff, not exact invoice reconciliation; compare it with provider billing externally and never increase the budget implicitly.

Results are private JSON with complete normalized PNGs and authoritative acceptance evidence. A generated result is stored and marked ready before success is returned. Recovery lasts 24 hours; max envelope is 40 MiB per preview and 64 KiB per analysis. Reservations and retained bytes count toward the existing 100 MiB member account and 700 MiB global quota; owners have no account storage allowance. Confirmed failure/discard attempts immediate deletion, with maintenance retry. Accepted history uses its own immutable PNG and survives result expiry. Storage is released only after physical absence is verified.

## Recovery and operator reconciliation

Use the owner-scoped `/api/ai/attempts/[id]` read for status/results; it performs no model call. The editor offers saved previews only against their original current version and never replaces another draft. Creation reopens the device-scoped session/request; choosing Use image is idempotent, creates one project original and zero operations. A session already attached cannot create another project. Generated creation recovery on another device has no session picker in this version.

Run maintenance to fence expired running leases. Inspect the stage status and provider request reference through service-only access; do not log images, full prompts, keys or raw provider exceptions. Confirm the provider outcome and inspect the private stored result before reconciliation. A lease must have expired, the attempt must be unknown, and an evidence-backed reason of 10–1,000 characters is required:

```bash
# Supply SUPABASE_URL and SUPABASE_SECRET_KEY through protected environment secrets.
node scripts/cloud-ai/reconcile.mjs REQUEST_UUID ready "Provider completed; verified owned stored candidate and acceptance evidence"
node scripts/cloud-ai/reconcile.mjs REQUEST_UUID failed "Provider confirmed there is no recoverable result"
node scripts/cloud-maintenance/run.mjs
```

`ready` requires an owned stored result and active/current source; it cannot fabricate fidelity evidence. `failed` restores the user credit and releases remaining reservations but preserves already committed provider ceilings. Reconciliation writes a minimal audit record. Never upload a made-up candidate to unblock an attempt. Account purge waits for running/unknown work to be reconciled, deletes private result objects, then removes owner rows; the funding aggregate remains.

## Repeatable local qualification

Use a **disposable local Supabase stack**; these tests create accounts/assets and the browser exhaustion test spends synthetic fixture credits. Node/npm versions come from `.nvmrc` and `package.json`.

```bash
npx --yes supabase@2.116.0 start
npx --yes supabase@2.116.0 db reset --local
npx --yes supabase@2.116.0 db lint --local --schema public,mirai_private --level warning --fail-on error
npx --yes supabase@2.116.0 db advisors --local --type security --level warn --fail-on error
npx --yes supabase@2.116.0 test db --local
npm run test:cloud-ai
npm run test:e2e:cloud-ai
npm run lint
npm run typecheck
npm test
npm run build
```

The browser helper derives dummy keys from `supabase status -o json` internally, uses fake providers, builds the production app and runs on port 3100. CI tests real local Postgres/Storage with fake providers and never invokes a paid model.

Local checks cover strict dimensions/masks/configuration, ownership/origin/ineligible denial, 25-credit exhaustion, racing same-key execution and competing admission, known rejection/downstream failure/unknown timeout, process fencing, persistent global spend, result-before-success, cleanup accounting, preview recovery, exact protected pixels, complete review candidate, server-owned Transform fidelity, Extend plan tampering/cache, one-original creation, local editing/export after exhaustion, and existing cloud lifecycle flows. Repeat these hosted with disposable data before rollout; fake timing is not representative model latency.

## Authenticated real-AI testing on localhost

Use the local Next.js app with an existing staging Supabase project to exercise the full Google login, invitations, private projects, shared credits, admin exemptions and durable AI flow. Supabase and provider calls still use hosted services; Docker is unnecessary for this setup. Verify all repository migrations, including both Wave D migrations, are applied through the protected migration workflow before starting.

Configure the ignored `.env` or `.env.local` with the matching staging public URL/publishable key, server-only secret key, owner email and OpenAI key, plus:

```dotenv
MIRAI_APP_MODE=local
MIRAI_PERSISTENCE_MODE=disabled
MIRAI_AUTH_ENABLED=true
MIRAI_AI_ENABLED=true
MIRAI_CANONICAL_URL=http://localhost:3000
MIRAI_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
MIRAI_AI_HOST_QUALIFIED=false
IMAGE_EDIT_PROVIDER=openai
ASSET_GENERATION_PROVIDER=openai
OPENAI_IMAGE_QUALITY=low
OPENAI_IMAGE_MAX_EDGE=1024
OPENAI_EXTEND_PROVIDER_MAX_EDGE=1024
# Supply reviewed positive stage ceilings; they reserve spending, not exact invoice prices.
MIRAI_AI_IMAGE_STAGE_MICROUSD=<image-stage ceiling in micro-USD>
MIRAI_AI_TEXT_STAGE_MICROUSD=<text-stage ceiling in micro-USD>
```

The local qualification exception requires `local` mode, a loopback canonical origin included in allowed origins, exclusively loopback allowed origins, and no Render runtime/service markers. Remote origins, CI, staging and beta retain the hosted qualification requirement. Local requests still enforce authentication, ownership, member credits, positive stage ceilings, database funding, storage and concurrency. It is not a hosted smoke-test exemption and does not resolve first-run Render qualification.

In Supabase Authentication → URL Configuration, retain the deployed Site URL and add `http://localhost:3000/**` to Redirect URLs. This includes Mirai's `/auth/callback?next=...`. The existing Google provider credentials and Supabase callback stay in place. Use `localhost` consistently for sign-in so cookies and redirect origins agree.

After obtaining a specific test budget, inspect `public.ai_control` and configure its total `budget_microusd` and `enabled=true` through service-only access. A five-dollar total is 5,000,000 micro-USD. Never reset `committed_microusd`; existing spend consumes that total. This gate and budget affect every app connected to the same Supabase project, including Render. Stage-ceiling accounting is conservative and can stop testing before actual invoiced spend reaches the total; compare provider usage/billing to validate the estimates.

```bash
nvm use
npm run dev -- --hostname 127.0.0.1
```

Open `http://localhost:3000`, sign in with the configured owner Google account, and verify Unlimited in My projects. Test both new-project paths, one real preview, accept/discard, undo/reopen and export. Use another browser profile with an invited Google account to check 25 shared credits and the five-project member cap. Do not auto-exhaust 25 real credits: use the fake-provider suite for exhaustion/failure cases. No paid generation is triggered by opening the page or studio. Disable the shared database AI gate when the test session is over.

## Off switch and rollback

Set database `ai_control.enabled=false` to stop new attempts/stages promptly; keep the current runtime configured while resolving in-flight work. Ready stored previews can still be inspected and accepted through owned routes. To remove real provider configuration completely, also disable runtime AI, set providers to fake, remove the OpenAI key and redeploy; local reads/saves/export remain available. Preserve the additive schema, receipts, private results and accounting during app rollback. An older app may again display the former grant wording, so verify welcome/settings against the deployed revision.

This delivery does not complete Wave E alerting, backup/restore, credential rotation or integrated hosted release qualification.
