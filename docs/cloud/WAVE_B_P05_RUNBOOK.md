# Wave B P05 cloud projects

**Status:** Implemented and verified locally and on staging. Hosted migration, the primary account walkthrough, and second-account project denial passed on 2026-09-26.

P05 saves a finalized P04 upload as one owned project and initial immutable version. Approved accounts see a minimal My projects list at `/projects` and reopen the normalized original at `/projects/[id]`. P06/P07 extend that project view with cloud editing and history; local SQLite editing remains unavailable in staging/beta.

## Release sequence

1. Confirm P03 accounts and P04 private assets are deployed and healthy. Back up the target database and identify the target Supabase project and branch/release before migration.
2. Review `supabase/migrations/20260926072932_cloud_projects.sql`, then apply it with the protected **Apply Supabase migrations** GitHub workflow to the intended staging Supabase project. Do not run a database migration at Render app startup.
3. Deploy this branch to the staging Render service after the migration. Keep `MIRAI_PERSISTENCE_MODE=disabled`, fake/disabled AI, the P02 cloud safety settings, and the P03/P04 Supabase credentials. P05 uses its own Supabase project routes; it does not enable the local `/api/projects` API.
4. Sign in with an approved Google account. Go to `/projects`; an empty account should show the New project action. Upload a valid PNG or JPEG under 10 MiB, with at most 2,048 pixels per edge, give it a name, and wait for its project URL.
5. Confirm the project appears in My projects and displays the original's normalized dimensions. Copy `/projects/{id}`, sign out, sign back in, and reopen that URL. Refresh it after a minute to verify a fresh short-lived image URL is issued.
6. Sign in as a second approved account and request the first project's URL and `GET /api/cloud-projects/{id}`. Both must return no project. Anonymous API requests must return 401, and a pending/revoked account must be denied.
7. Test interrupted upload and attach retries. An unfinished upload must not appear in My projects. A successful finalize followed by a failed attach can be retried in the same account/tab; repeated attach returns one project and one initial version. The sixth project must be rejected.

## Local verification

Run local Supabase and the code checks:

```bash
npx --yes supabase@2.116.0 start
npx --yes supabase@2.116.0 db reset --local
npx --yes supabase@2.116.0 test db --local supabase/tests/cloud_projects_test.sql
npm run lint && npm run typecheck && npm test && npm run build
```

For browser testing at `http://localhost:3000`, set `MIRAI_APP_MODE=local`, `MIRAI_AUTH_ENABLED=true`, `MIRAI_CANONICAL_URL=http://localhost:3000`, `MIRAI_ALLOWED_ORIGINS=http://localhost:3000`, the matching Supabase URL/publishable and secret keys, and `MIRAI_OWNER_EMAILS` in a local-only `.env`. Keep `MIRAI_PERSISTENCE_MODE=local` for the standalone local editor. Google OAuth must allow the localhost callback with its `next` query parameter; the local Supabase stack does not supply Google credentials automatically. See the [P04 runbook](./WAVE_B_P04_RUNBOOK.md) for the full local environment matrix.

## Staging verification, 2026-09-26

- Render readiness returned HTTP 200 in staging for release `d67f80e2cdc737d4b1ee0a43054b12c042ee7526` with `Cache-Control: no-store`.
- Supabase project `vfpafxzczdblsbsslhcg` reports migration `20260926072932_cloud_projects` applied.
- An approved account uploaded one JPEG through the hosted UI. My projects showed one entry, and its stable project URL displayed the normalized original at 674 × 850 pixels. The image remained visible after a fresh page load.
- Signing out redirected to sign-in. Opening that project URL while signed out redirected to `/sign-in?next=/projects/{id}`; Google sign-in returned to the same project. The My projects list still showed one project.
- Anonymous `GET /api/cloud-projects` and `GET /api/cloud-projects/{id}` returned 401. The legacy `/api/projects` route returned 404.
- A read-only hosted database check found one project, one initial version, one ready upload, and a valid owner/project/current-version relationship for the uploaded project.
- The product owner reported that opening the first account's project from a second approved account was denied. The second-account API request was not separately observed by the agent; the read query filters by authenticated owner, and automated checks cover foreign-owner attach and direct table access.
- Both PR CI jobs passed, including cloud migration, RLS, Storage, and pgTAP tests. The pgTAP suite covers unfinished uploads, foreign-owner attach, idempotent retry, immutable initial versions, and the five-project cap.

Hosted interrupted-transfer/retry and five-project-cap behavior were not exercised against the real user's account; they are covered by automated tests.

## Recovery and limits

- Browser retries preserve a finalized or finalizing upload ID in account-scoped tab session storage. Retry with the same project name. The server's database attach function is idempotent and transactional.
- A transfer stopped before finalization can be cancelled; expired reservations are reconciled by the P04 owner cleanup path. A finalized upload that never attaches still counts toward storage quota until later orphan cleanup work. Check project capacity before uploading; the database enforces the final count under concurrency.
- List/read APIs return metadata only to the active owner. Image reads use a 60-second signed URL and `no-store` page/API responses. A project URL remains stable even though the image URL changes.
- P08 adds richer library controls. The P06/P07 editor and history release procedure is in [its runbook](./WAVE_B_P06_P07_RUNBOOK.md).
