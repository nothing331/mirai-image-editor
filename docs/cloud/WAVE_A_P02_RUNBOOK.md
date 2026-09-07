# Wave A P02 deployment and rollback runbook

**Status:** Live walkthrough complete for the recorded P02 application revision.
**Target:** Render Free staging with fake AI and disabled project persistence, backed only by a bounded Supabase readiness check.

## What this foundation does

P02 makes deployment configuration explicit and repeatable. It does not turn the existing local editor into a cloud product. In `staging` and `beta` modes, Mirai starts only when the configuration is safe, exposes only health routes, and refuses local SQLite/filesystem persistence. Authentication and Supabase-backed projects begin in later delivery units.

## Environment matrix

| Mode | Persistence | AI | Public API surface | Data |
|---|---|---|---|---|
| `local` | `local` | Fake by default; developer may deliberately configure OpenAI | Existing local editor APIs | Local SQLite and `.local-edit` assets |
| `ci` | `local` and disposable | Fake only in the workflow | Test process only | Synthetic fixtures |
| `staging` | `disabled` | Forced off; both providers fake | `/api/health/live` and `/api/health/ready` only | Supabase health check only |
| `beta` | `disabled` until cloud persistence is implemented | Forced off during Wave A | Health routes only | No user project persistence yet |

`disabled` is deliberate. Choosing it prevents a cloud deployment from appearing successful while writing projects to Render's ephemeral disk.

## Required Render settings

`render.yaml` is the canonical service skeleton:

- Node 24.19.0 on the Free 0.1 CPU / 512 MB plan in Singapore;
- `npm ci && npm run build` followed by `npm run start:cloud`;
- `/api/health/live` as the platform health check;
- a 60-second shutdown window;
- the P01 limits: 2,048 maximum edge, 4,194,304 pixels, and one heavy request at a time;
- fake providers, disabled AI, disabled project persistence, and the retired P01 benchmark switched off.

Set these service-specific values in Render; never commit their real values:

| Variable | Example shape | Sensitivity |
|---|---|---|
| `MIRAI_CANONICAL_URL` | `https://service-name.onrender.com` | Public |
| `MIRAI_ALLOWED_ORIGINS` | Same exact origin; comma-separate additional approved origins | Public |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://project-ref.supabase.co` | Public identifier |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Current `sb_publishable_...` key, or the existing legacy `anon` key during transition | Browser-safe when RLS is enabled, but still environment-specific |

Do not install `OPENAI_API_KEY`, a Supabase secret/service-role key, or database credentials in the Render web service during P02. The current staging service uses the project's browser-safe legacy `anon` key because no replacement publishable key exists yet; it must never use `service_role`. Migration credentials belong only in the protected GitHub environment described below.

## Clean deployment walkthrough

1. Start from a clean checkout of the P02 revision and run `npm ci`.
2. Copy `.env.example` only for local development. Confirm `npm run cloud:config:check` succeeds.
3. Sync or manually reproduce `render.yaml`. Enter the four service-specific values above.
4. Confirm `CLOUD_SPIKE_ENABLED=false` and `CLOUD_SPIKE_ISOLATED_DEPLOYMENT=false`.
5. Deploy the exact Git commit and record the Render deployment ID.
6. Confirm `/api/health/live` returns HTTP 200 with only `status` and `releaseId`.
7. Confirm `/api/health/ready` returns HTTP 200 with only `status`, `mode`, and `releaseId`.
8. Confirm an unfinished route such as `/api/projects` returns HTTP 404 with `Cache-Control: no-store`.
9. In a local or CI shell, run the configuration checker with one deliberately unsafe staging value and confirm it exits non-zero before `next start`. Do not interrupt the live service merely to prove this guard.
10. Record the successful release, rollback target, checks, and any deviations in this file.

The readiness request uses the publishable key to call Supabase Auth's health endpoint and aborts after at most four seconds. Its failure response is only `{ "status": "not-ready" }`; upstream URLs, keys, and error bodies are never returned.

## Migration procedure

Application startup never applies migrations. The manual **Apply Supabase migrations** GitHub workflow is the only repository-provided execution path in P02. It:

1. requires a fixed `staging` or `beta` target;
2. enters the matching GitHub Environment, where required reviewers can be configured;
3. requires the exact confirmation `apply-staging` or `apply-beta`;
4. links with Supabase CLI 2.116.0;
5. runs `db push --dry-run` before `db push`;
6. serializes runs per target so two migrations cannot race.

Create matching GitHub Environments and store these secrets in each one:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_REF`

The P01 migration was applied through the SQL Editor before this workflow existed. Before the first workflow execution against that same project, an owner must link the project, confirm the live schema matches `20260906142411_cloud_spike_foundation.sql`, and record that migration once with:

```bash
npx --yes supabase@2.116.0 migration repair 20260906142411 --status applied --linked
npx --yes supabase@2.116.0 db push --linked --dry-run
```

Do not use remote reset, seed a beta database, or repair migration history without first comparing the exact live schema. Future remote changes must originate as reviewed migration files, not ad hoc dashboard edits.

## Rollback

Application rollback is independent of database migration execution:

1. In Render, open the last known-good deployment recorded below.
2. Select **Rollback** and wait until `/api/health/live` passes.
3. Verify `/api/health/ready` and the 404 boundary for `/api/projects`.
4. Do not automatically reverse a database migration. Use additive expand/migrate/contract changes so the previous application revision remains compatible.
5. If readiness fails because Supabase is unavailable, keep the last safe application release and investigate the dependency; never enable local persistence as a fallback.

## Troubleshooting

- **Startup reports unsafe configuration:** read the named variable errors. Values are deliberately omitted. Compare the environment with the matrix rather than bypassing validation.
- **Liveness fails:** inspect Render startup logs for the configuration error or port binding failure.
- **Readiness returns 503:** verify the Supabase URL and publishable key, project state, and network reachability. The application will not disclose the upstream error publicly.
- **Projects route returns 404:** expected in P02 staging/beta. Cloud project APIs are not enabled until authentication and durable persistence exist.
- **Migration workflow reports history mismatch:** stop. Compare the live schema and migration history; do not use `migration repair` as a generic retry.
- **Free instance wakes slowly:** expected after inactivity. P01 observed more than 30 seconds; this is not a readiness failure once the process is running.

## Deployment record

| Item | Result |
|---|---|
| P02 application commit | `9bb678fcec43b170c938c1eb37a719d3035d8eef` |
| Render deployment ID | `dep-daf6i88enrgs73e49ggg` |
| Previous rollback deployment | `dep-daf680bbc2fs73csvabg` (`7abe43e`) |
| Liveness | HTTP 200, `status=live`, matching release ID, `Cache-Control: no-store` |
| Readiness | HTTP 200, `status=ready`, `mode=staging`, matching release ID, `Cache-Control: no-store` |
| Unsafe-route denial | `/api/projects` returned HTTP 404 with `Cache-Control: no-store` |
| Clean local verification | 38 files / 182 tests, lint, typecheck, and production build passed |
| GitHub CI | Pending P02 pull request |

## Resource and cost posture

| Resource | Owner | Cost posture | P02 use |
|---|---|---|---|
| GitHub repository/environments | Repository owner | Existing account; no paid action authorized | CI and manual protected migration path |
| Render `mirai-image-editor` | Workspace owner | Free instance only | Staging runtime and health verification |
| Supabase project `vfpafxzczdblsbsslhcg` | Organization owner | Free project only | Bounded readiness; existing synthetic P01 objects are cleaned |
| Cloudflare R2 | Not activated | No payment method and no billing exposure | Not used |
| OpenAI | No credential installed in cloud | No paid call authorized | Not used |
