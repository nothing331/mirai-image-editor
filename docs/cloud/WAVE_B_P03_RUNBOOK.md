# Wave B P03 accounts and eligibility runbook

**Status:** Implementation and local verification complete; remote migration and real staging OAuth walkthrough pending.
**Target:** The existing Render staging service and Supabase Free project, with fake AI and cloud project persistence still disabled.

## What P03 adds

P03 adds an identity and admission boundary, not cloud image projects. Google sign-in proves who a visitor is. A separate Mirai profile decides whether that identity is pending, active, or revoked and whether it is a member or owner.

```text
Google identity
      ↓
Supabase session
      ↓
Mirai profile status ── pending/rejected/revoked → no product access
      ↓ active
Protected application capability
```

An owner can approve a request or create an email-bound invitation. Both paths activate the same account and create exactly one five-image initial allowance grant. Repeating either path does not replenish the allowance.

## Secrets and public values

| Variable | Location | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Render and local environment | Public Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Render and local environment | Browser-safe publishable key; RLS remains mandatory |
| `SUPABASE_SECRET_KEY` | Render secret only | Narrow server administration used for idempotent profile setup and owner bootstrap |
| `MIRAI_OWNER_EMAILS` | Render secret only | Comma-separated verified Google emails allowed to bootstrap as owners |
| `MIRAI_AUTH_ENABLED` | `true` in Render; optional locally | Switches the root page from the local editor to the cloud account journey |

Never put the Supabase secret key or owner list in a `NEXT_PUBLIC_` variable, source file, pull-request comment, screenshot, or chat message. The application validates that privileged keys are not accidentally public.

## 1. Apply the reviewed database migration

The migration is `supabase/migrations/20260914044852_accounts_and_access.sql`. It creates profiles, access requests, invitations, one-time allowance grants, audit records, row-level-security policies, the signup trigger, and hardened transactional functions.

Use the repository's manual **Apply Supabase migrations** GitHub workflow described in the P02 runbook:

1. Select the same protected `staging` GitHub Environment used for P02.
2. Enter the exact confirmation `apply-staging`.
3. Review the dry-run output before the workflow performs `db push`.
4. Confirm the migration appears in Supabase migration history.

Do not paste pieces of this migration into the SQL Editor or let application startup apply it. The workflow keeps schema history reviewable and prevents concurrent pushes.

## 2. Configure Google OAuth

In Google Cloud Console, create or select an OAuth consent screen and a **Web application** OAuth client. Request only the ordinary identity scopes Supabase needs (`openid`, email, and profile). Configure:

- authorized JavaScript origins for the exact Render origin and the local origin used for development;
- authorized redirect URI `https://PROJECT_REF.supabase.co/auth/v1/callback`, replacing `PROJECT_REF` with the Supabase project reference.

Copy the Google client ID and secret directly into **Supabase Dashboard → Authentication → Providers → Google**, then enable the provider. Do not put the Google client secret in Render or this repository; Supabase owns the provider exchange.

In **Supabase Dashboard → Authentication → URL Configuration** set:

- Site URL to the exact Render origin;
- an exact production redirect URL ending in `/auth/callback`;
- `http://localhost:3000/**` in **Redirect URLs** for local development. Mirai's callback includes a `next` query parameter, so allowing only the bare `/auth/callback` URL can miss the actual redirect. Keep the production Render callback exact.

Avoid wildcard production redirects. Google may keep an external consent screen in testing mode until its publishing requirements are satisfied; list each intended staging tester when Google requires it.

## 3. Configure Render

Keep every existing P02 safety setting, including fake providers, disabled AI, disabled project persistence, and the closed API surface. Add or verify:

```text
MIRAI_AUTH_ENABLED=true
MIRAI_OWNER_EMAILS=<the owner's verified Google email>
SUPABASE_SECRET_KEY=<Supabase server secret key>
```

The owner email comparison is normalized and server-only. It is based on Supabase's verified Google identity, never on user-editable metadata. On the owner's first successful callback, the server idempotently creates the profile and invokes a service-role-only owner bootstrap function.

Deploy only after the migration and OAuth configuration are ready. Otherwise startup intentionally fails on missing Mirai variables, or sign-in returns a retryable provider/setup error.

## 4. Local verification

Run the database checks with the pinned CLI and local Supabase stack:

```bash
npx --yes supabase@2.116.0 db reset --local
npx --yes supabase@2.116.0 db lint --local --schema public,mirai_private --level warning --fail-on error
npx --yes supabase@2.116.0 db advisors --local --type security --level warn --fail-on error
npx --yes supabase@2.116.0 test db --local supabase/tests/accounts_and_access_test.sql
```

Run application verification:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

The account browser test needs authentication enabled but does not automate Google itself:

```bash
MIRAI_AUTH_ENABLED=true \
MIRAI_OWNER_EMAILS=owner@example.com \
SUPABASE_SECRET_KEY=server-only-secret-key-placeholder \
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=publishable-key-placeholder-value \
MIRAI_CANONICAL_URL=http://127.0.0.1:3000 \
npx playwright test e2e/account.spec.ts
```

## 5. Real staging acceptance walkthrough

Use separate Google test identities for the owner and member. Do not automate around Google's login protections.

1. Open `/sign-in`, sign in as the configured owner, and confirm `/welcome` reports role `owner` and an allowance of five.
2. Sign out, use the member identity, request access, and confirm the pending page remains pending after refresh and repeat login.
3. Sign back in as the owner, approve the request twice, then confirm only one allowance row exists and the member still has five—not ten.
4. As the owner, create an invitation for a second member. Copy the link once, sign in with the matching Google email, claim it, and confirm the account becomes active.
5. Try the same invitation with a different Google email and confirm it fails without revealing or activating the intended account.
6. Revoke a member. Confirm the member can still prove identity but returns to the revoked access page and cannot request access again.
7. Confirm `/api/projects`, AI, and diagnostic APIs still return the fail-closed 404 because P04–P17 are not implemented.
8. Confirm liveness/readiness remain 200 and authenticated pages send private, non-cacheable responses.
9. Sign out, use browser Back, then sign in as another account. Confirm no previous identity details remain visible. Full account-specific draft cleanup is completed in P09.

Record the Render deployment, application commit, successful identities by anonymous test label, and each check result. Never record real emails, cookies, invitation tokens, or keys.

## Failure and rollback

- **Google reports a redirect mismatch:** compare the Google callback URI and Supabase redirect allowlist character for character, including scheme and path.
- **A callback redirects to `localhost` on Render:** verify the deployment includes the canonical-origin callback fix and that `MIRAI_CANONICAL_URL` is the exact public Render origin. The application must not derive post-callback redirects from Render's internal request origin.
- **Sign-in returns `provider`:** verify the Google provider is enabled and its client credentials are current in Supabase.
- **Sign-in returns `callback`:** start again; the PKCE code may be missing, expired, or already consumed.
- **Sign-in returns `setup`:** verify the migration was applied and the Render secret key is for the same Supabase project.
- **The owner remains a member:** verify the normalized Google email exactly matches `MIRAI_OWNER_EMAILS`, then retry sign-in. Do not update the role through browser-visible metadata.
- **A user sees pending forever:** approve the request or issue a matching invitation from the owner page; signing in never self-approves.

For application rollback, select the previous recorded Render release. Do not reverse the P03 migration automatically: it is additive and the P02 release does not query these tables. Set `MIRAI_AUTH_ENABLED=false` only as a deliberate temporary account-surface shutdown while the old fail-closed P02 API boundary remains in place.

## Known limits after P03

- No cloud projects or image uploads exist until P04–P07.
- The five-image row is an eligibility grant; durable consumption and global spending admission arrive in P14.
- Invitations are owner-copied links; no email service is configured.
- Account data export and deletion arrive in P12–P13.
- Account-specific browser draft cleanup and stronger account-switch recovery arrive in P09.
- Real AI credentials remain absent and all cloud providers remain fake.
