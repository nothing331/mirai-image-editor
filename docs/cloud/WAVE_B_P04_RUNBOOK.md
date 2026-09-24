# Wave B P04 private original assets

**Status:** Implemented and verified locally; staging rollout remains after P03 activation.

P04 stores an uploaded original and a normalized editor base as two private immutable assets. It does not yet create a cloud project or connect the existing editor. P05 consumes the finalized receipt.

## Transport and resource decision

The approved 10 MiB source limit is enforced by the application upload route before forwarding bytes to Storage. The route requires an exact `Content-Length` and caps the stream independently. This uses Render bandwidth and memory for each upload; it is appropriate for the small beta. Direct signed uploads can reduce server transit later, after an enforceable size/rate bound is demonstrated. The server reserves the declared source bytes plus a 30 MiB maximum editor base before allowing a transfer. Current controls cap one account at 100 MiB and all managed asset reservations at 700 MiB. These are conservative starting controls; monitor real Storage usage, including previous spike objects and backups outside the managed ledger.

The original is stored byte for byte. The derived PNG applies EXIF orientation, converts to sRGB, and retains oriented pixel dimensions. Unsupported format, animation, a 2,048-pixel edge violation, more than 4,194,304 pixels, an unreadable image, or a derived PNG above 30 MiB is rejected. The file name and declared MIME type never determine the stored image's validity by themselves.

## Activate after P03

1. Complete the P03 migration and real Google OAuth walkthrough first.
2. Review and apply `supabase/migrations/20260924083937_private_asset_foundation.sql` through the protected **Apply Supabase migrations** workflow. It creates two private buckets, reservation records, and service-role-only quota/finalization functions. Do not copy the server secret into browser configuration.
3. Deploy the application with P02's cloud safety settings, including disabled cloud project persistence and fake/disabled AI. The Proxy opens only the P04 asset routes and owner cleanup route; existing local project and AI APIs remain closed.
4. Sign in as an active approved account. Reserve with `POST /api/original-uploads` using a UUID `requestKey`, source name, `image/png` or `image/jpeg`, and exact `bytes`. Send the file to `PUT /api/original-uploads/{id}` with the exact `Content-Length`. Call `POST /api/original-uploads/{id}/finalize`, then read either `GET /api/original-uploads/{id}?role=source` or `?role=base` to receive a 60-second URL. Use the same browser origin and session cookies on mutations.
5. Verify original download bytes match the upload, oriented base dimensions match the receipt, and repeating reservation/upload/finalization returns the same asset rather than a replacement.
6. Test anonymous access and a second active account against the row, both read roles, and the Storage keys. They must fail. Test an over-limit body, malformed file, expired reservation, same request key with different metadata, and concurrent reservations near quota.
7. Call owner-only `POST /api/internal/assets-cleanup` after creating an expired synthetic reservation. Confirm storage objects are removed before quota is released. Until P18 schedules maintenance, invoke this endpoint during staging operations and monitor stale reservations. Never delete a `ready` source or base through cleanup.

## Recovery and boundaries

- An interrupted PUT may be retried with the same bytes. A stale `uploading` record becomes retryable after five minutes. Storage keys are never overwritten.
- A lost finalization response may be retried. Matching checksums return the existing receipt; mismatched bytes fail closed.
- A failed cleanup leaves the row in `cleaning`, still charged against quota, and a later owner cleanup call retries removal.
- A successful finalization followed by failed staging deletion leaves the receipt ready but reports a retryable error. A repeat finalization or owner cleanup removes the staged copy.
- P04 has no user-facing upload UI, project record, automatic cleanup scheduler, or generated-original path. Those belong to later delivery units.

## Verification

With local Docker/Supabase running:

```bash
npx --yes supabase db reset --local
npx --yes supabase db lint --local --schema public,mirai_private --level warning --fail-on error
npx --yes supabase db advisors --local --type security --level warn --fail-on error
npx --yes supabase test db --local supabase/tests/private_asset_foundation_test.sql
MIRAI_ASSET_INTEGRATION=1 npx vitest run src/server/assets/original-assets.integration.test.ts
npx vitest run src/server/assets/original-assets.test.ts
npm run lint && npm run typecheck && npm run build
```

The local Storage integration checks exact source bytes, idempotent reserve/finalize, staging deletion, anonymous read denial, and foreign owner denial. Remote rollout remains a separate acceptance gate because local tests cannot prove Render transfer behavior or real staging OAuth.
