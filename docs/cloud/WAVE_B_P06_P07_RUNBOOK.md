# Wave B P06/P07 cloud editing and history

**Status:** Implemented and locally verified on the combined review branch. Staging migration, deployment, and real-account walkthrough are pending.

P06 accepts deterministic browser edits as private immutable PNG versions with one operation and one idempotent receipt per save. P07 stores the selected current version and exposes undo, redo, original, and paged history. The existing editor canvas and direct-edit inspectors are reused at `/projects/[id]`; AI actions remain disabled in cloud mode.

## Release sequence

1. Review the branch diff, CI checks, migration `supabase/migrations/20260926120637_cloud_edit_history.sql`, and this runbook. Confirm the target Supabase project, take a database backup, and record the current Render release. The migration extends the P05 schema and adds service-role functions; it does not rewrite original image objects.
2. Apply the migration to **staging** with the protected **Apply Supabase migrations** GitHub workflow. Do not run a migration in the Render startup command. If the migration fails, stop before deploying the new application version and inspect the SQL error; do not retry by editing live tables manually.
3. Deploy the same branch to staging after the migration. Preserve the P02/P03/P04 configuration: `MIRAI_APP_MODE=staging`, `MIRAI_AUTH_ENABLED=true`, `MIRAI_PERSISTENCE_MODE=disabled`, the existing Supabase URL/publishable/secret keys and origin settings, and `MIRAI_AI_ENABLED=false`. Check `/api/health/live` and `/api/health/ready` for HTTP 200.
4. Use an approved account with a disposable project. Open it, make a selection recolor or Monochrome edit, review the proposed pixels, and accept. Wait for **Saved to cloud**, then refresh and compare the same pixels and dimensions. Confirm the database has one new active version, one operation, one committed asset, and one receipt.
5. Undo, refresh, redo, then choose Original and refresh again. Make another edit from Original; confirm the warning that it replaces the redo future. Verify the old future is absent from active history and cannot be selected, while the original object and prior accepted assets are not overwritten.
6. Save a Crop or Resize and verify undo/redo restores the correct image dimensions. Open History and load older entries if available. Confirm the page loads metadata in batches of 20 and downloads only the selected version's pixels.
7. Test an interrupted save in a disposable session: block the edit response after the server commits, leaving the tab open, then use **Retry save**. The same receipt should return and no second version should appear. Test a failed save: the proposal remains visible and can be retried or discarded. Check anonymous, foreign, pending, and revoked access to project, history, version, image, and edit routes.

## Local verification

Run against the disposable local Supabase stack only:

```bash
npx --yes supabase@2.116.0 start
npx --yes supabase@2.116.0 db reset --local
npx --yes supabase@2.116.0 db lint --local --schema public,mirai_private --level warning --fail-on error
npx --yes supabase@2.116.0 db advisors --local --type security --level warn --fail-on error
npx --yes supabase@2.116.0 test db --local supabase/tests/cloud_edit_history_test.sql
MIRAI_EDIT_INTEGRATION=1 npx vitest run src/server/cloud-projects/cloud-edit-history.integration.test.ts
npm run lint && npm run typecheck && npm test && npm run build
```

The Storage integration test reads local Supabase connection settings via the CLI and creates disposable fixture rows. The optional browser test also needs the local Supabase URL, publishable key, and secret key from `supabase status -o json`, plus `MIRAI_APP_MODE=local`, `MIRAI_AUTH_ENABLED=true`, `MIRAI_CANONICAL_URL=http://127.0.0.1:3000`, `MIRAI_ALLOWED_ORIGINS=http://127.0.0.1:3000,http://localhost:3000`, `MIRAI_PERSISTENCE_MODE=local`, `MIRAI_AI_ENABLED=false`, and `E2E_CLOUD=1`. Then run `npx playwright test e2e/cloud-editor.spec.ts`. Reset the disposable database before running older pgTAP suites that assume no integration fixtures.

## Recovery and limits

- If the app deploy fails after the additive migration, roll back the Render release. Keep the migration applied; prior P05 code can still read the original project rows. Do not reverse the migration automatically or delete accepted objects.
- A lost response is recovered with the same tab's pending image, request key, and asset ID. A full tab close loses the pending proposal; account-scoped durable drafts belong to P09. Browser unload warning is best effort.
- Edit assets count against the 100 MiB per-account and 700 MiB managed-global storage limits. Reserved or uploaded assets from failed saves and detached redo versions stay charged until P18 reconciliation. They are retained to avoid deleting data that a retry or audit may need.
- Opening a project decodes the original and selected current image. History lists at most 20 metadata records per request; other version pixels are fetched only when selected. An unavailable current asset is an error, never a silent reset.
- Accepted text and image watermark pixels survive as flattened PNGs. A watermark's separate uploaded PNG source is kept only in the active browser session, so reopening cannot adjust that same source overlay. The operation record retains its parameters; the server validates dimensions and outside-mask pixels but does not replay browser fonts.
- Current cloud export downloads the accepted PNG directly from the editor; P10 adds full format, background, filename, and original-download controls. P08 adds richer project library management. P15–P17 add cloud AI edits and allowance enforcement.
