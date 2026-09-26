# Wave C personal product and maintenance

**Status:** P08–P13 and the P18 dependency are implemented together on `codex/wave-c-personal-product`. Local database and browser verification passed. Hosted migration, protected maintenance credentials, and the staging walkthrough below remain open.

## Release sequence

1. Review the single Wave C PR, the additive `20260926180939_wave_c_lifecycle.sql` migration, CI, and this runbook. Record the current Render release and take a Supabase database backup. The migration adds project trash state, restricted lifecycle/export commands, a private export bucket, and maintenance tasks. Do not run migrations during app startup.
2. Apply the migration to **staging** with the protected **Apply Supabase migrations** workflow and verify it previews exactly the Wave C migration. Deploy the matching branch to Render only after the migration succeeds. Keep AI disabled and the existing canonical URL, allowed origin, Supabase keys, and active account settings. Confirm live/readiness HTTP 200.
3. In the protected GitHub `staging` environment, set `SUPABASE_URL` to that project's API URL and `SUPABASE_SECRET_KEY` to its server-side secret key. Neither belongs in repository files or `NEXT_PUBLIC_` variables. Run **Cloud maintenance** manually against staging. The workflow runs nightly for staging after it is merged to the default branch; beta remains a manual target until its secrets and release gates are configured. A missing secret must fail the job rather than silently skip cleanup.
4. Use disposable approved accounts and projects for the following walkthrough. Do not use production images. Confirm signed-out, foreign, pending, and revoked users cannot list trash, rename, sign thumbnails/originals, request exports, or start deletion.

## Staging acceptance walkthrough

- **Library (P08):** Create up to five projects with different names and dimensions. Check thumbnail fidelity and missing-thumbnail fallback, updated/name sort, literal name search, load more, empty search, a long name, and a narrow viewport. Rename one and verify its image/history IDs remain the same. Verify a sixth active project is refused.
- **Drafts (P09):** Change a local edit without applying it, wait for “Draft on device,” reload, and choose Restore. Check the image/version pointer did not advance. Repeat with paint and a pending save whose response is lost; retry with the same receipt. Open another account and confirm the prior account's draft is not offered. Try browser storage denial/eviction and confirm the UI warns instead of claiming a cloud save. Sign out in one tab and verify drafts are purged in another. Test project navigation and browser close warnings.
- **Export (P10):** Download accepted PNG and JPEG from an image with transparency and verify dimensions/background, filenames, and no model request. Download the exact original and compare its checksum/media type with the uploaded file. Verify export stays tied to the selected accepted version even when a preview is visible.
- **Trash and maintenance (P11/P18):** Trash a project; verify active reads/saves fail and bytes remain charged. Restore before the deadline and verify the original/current/history are intact. Trash again and request permanent deletion. Run maintenance; verify private source/base/edit/staging objects are absent before project rows and quota are released. Interrupt after some object deletes and rerun; the task must finish safely. Confirm restore fails once purge starts. Create expired original and old uncommitted edit reservations, then run maintenance to prove orphan reconciliation. Inspect failed tasks and workflow logs without logging private bytes.
- **Account (P12):** Update display name and verify email/role cannot be changed through that route. Compare usage with database asset records, including reserved and trashed bytes. Try account deletion with an old session; it must require a new sign-in. After a fresh sign-in, request deletion and record the support reference. Confirm all app commands fail immediately from another tab and that no completion email is promised. Run maintenance until projects, orphan assets, exports, invitations, Auth identity, and profile are removed.
- **Portable export (P13):** Request an account export. Run maintenance and download the private archive from the 60-second signed link. Extract it and check profile, project manifest, retained operations/versions, exact originals, normalized bases, and accepted PNGs. Verify another account cannot request the result, the archive expires after seven days, a missing asset fails without a partial ready result, and deletion during an export prevents publication and eventually removes any uploaded archive.

## Local verification

```bash
npx --yes supabase@2.116.0 start
npx --yes supabase@2.116.0 db reset --local
npx --yes supabase@2.116.0 db lint --local --schema public,mirai_private --level warning --fail-on error
npx --yes supabase@2.116.0 db advisors --local --type security --level warn --fail-on error
npx --yes supabase@2.116.0 test db --local supabase/tests/wave_c_lifecycle_test.sql
npx --yes supabase@2.116.0 test db --local supabase/tests/wave_c_account_test.sql
npm run lint && npm run typecheck && npm test && npm run build
```

The cloud Playwright suite needs disposable local Supabase settings from `supabase status -o json`, `MIRAI_APP_MODE=local`, `MIRAI_PERSISTENCE_MODE=local`, `MIRAI_AUTH_ENABLED=true`, `MIRAI_AI_ENABLED=false`, `MIRAI_CANONICAL_URL=http://127.0.0.1:3000`, `MIRAI_ALLOWED_ORIGINS=http://127.0.0.1:3000`, and `E2E_CLOUD=1`. Run `npm run test:e2e -- e2e/cloud-editor.spec.ts` after a fresh local database reset. The suite creates disposable users/assets, verifies a readable tar.gz, and deletes its final account fixture.

## Recovery and limits

- If the app release fails after migration, roll Render back to the previous release. Keep the additive schema; do not reverse it while trash or task rows exist. Do not remove private objects by hand without checking their references.
- A purge or export task is leased and retried. Ten failed task attempts require operator inspection and a deliberate retry after fixing the cause. Project bytes remain charged and purging projects remain inaccessible while cleanup is incomplete.
- The first runner cleans incomplete original/edit transfers and expired export results. It deliberately retains detached accepted redo versions because they still have operation/receipt references; define reference-safe pruning before releasing their quota.
- The account archive is produced on the maintenance runner, bounded by the existing 100 MiB account asset limit, 20 MiB manifest limit, and 150 MiB archive limit. A larger future allowance needs streaming upload rather than raising these numbers blindly.
- IndexedDB drafts are device-local and best effort. A browser may deny or evict them. The server's current version and commit receipt always take precedence.
- A 60-second signed image/export URL cannot be revoked after issuance, and downloaded files cannot be recalled. Account deletion blocks fresh application access immediately; the receipt page does not promise an email or an exact completion time.
