# Invitation-only launch

This launch gate collects Google-authenticated access requests without opening the image editor. It is separate from account approval and from the AI enablement flag. Its default is off, preserving ordinary local/cloud behavior.

## Configuration

Use the reviewed revision with matching Supabase migrations and the existing production account configuration. Set these server-side values in Render and redeploy:

```text
MIRAI_APP_MODE=beta
MIRAI_AUTH_ENABLED=true
MIRAI_INVITATION_MODE=true
MIRAI_AI_ENABLED=false
MIRAI_PERSISTENCE_MODE=disabled
IMAGE_EDIT_PROVIDER=fake
ASSET_GENERATION_PROVIDER=fake
```

Remove `OPENAI_API_KEY` from this deployment. Keep the configured canonical HTTPS URL, allowed origins, public Supabase values, server-only Supabase credential and owner email list. Do not prefix the invitation flag or privileged credentials with `NEXT_PUBLIC_`. Startup rejects malformed flags, authentication off, AI on, real providers or an installed OpenAI credential while invitation mode is enabled. `MIRAI_PERSISTENCE_MODE=disabled` closes local disk persistence; invitation mode closes the cloud product separately.

## Available surfaces

| Route | Access |
|---|---|
| `/` | Public landing and static demonstration assets |
| `/sign-in` | Google sign-in, callback errors and sign-out receipt |
| `/auth/callback` | Existing Google OAuth callback |
| `/access` | Signed-in request, pending/rejected/revoked/approved status and invitation claim |
| `/admin/access` | Existing owner-only approval, rejection, invitations and revocation |
| `/api/health/live`, `/api/health/ready` | Existing health checks |

Next static resources, the public brand/demo images and image optimization remain available. No additional public pages are introduced. Future help/privacy pages must be explicitly added to the page allowlist when implemented.

Other page GET/HEAD requests redirect to `/access` using the canonical application origin; signed-out visitors continue to Google sign-in. Other page mutations and every non-health API return a private, non-cacheable 404. The API matcher covers image-looking paths as well. Project and asset application helpers also reject product access, and the shared eligible-account check blocks product Server Actions even if invoked against an allowed page. Owner commands continue to require the database owner role; the owner has no editor bypass.

Approval or invitation claim still activates the profile and records its normal one-time allowance. An active account sees “Access approved” and the workspace-opening explanation, without a request/claim button. OAuth return paths cannot send members into the product; an active owner may return to access management. No request, approval, history, project or credit is reset by changing the flag. Existing signed asset URLs keep their ordinary short expiry; the launch flag cannot retract prior downloads.

Scheduled/manual maintenance continues directly against Supabase through its existing protected workflow; the browser cleanup API is closed. Account settings/export/deletion pages and APIs are closed too, so provide a support-based applicant data-removal process until a dedicated withdrawal feature exists. Automated invitation email remains outside this feature.

## Verification

Run the normal lint/type/unit/build checks. With disposable local Supabase running, run:

```bash
npm run test:e2e:invitation
```

The runner obtains only local stack credentials, forces invitation mode and fake providers, removes any inherited OpenAI key, builds, and runs invitation and landing browser checks. It creates and deletes synthetic test identities; it never uses hosted customer data or paid providers. Tests cover signed-out/pending/approved/owner boundaries, actual request and owner approval actions, matching invitation claim, one 25-credit grant, sign-out, stale product return paths, mobile approved status, static assets, health checks and direct API/page mutations. Existing runtime, account and Proxy unit tests also cover returning to normal routing when the flag is off.

Before publishing, record the deployed commit and confirm the same flow on Render with controlled Google identities. Verify request persistence across login, exact OAuth redirects, private caching, pending/revoked states, owner-only administration, product denial for approved accounts, and mobile/keyboard access. Local browser tests use password-created synthetic identities to exercise sessions; they do not qualify the real Google consent configuration.

## Opening the product or rollback

After the applicable product release gates pass, set `MIRAI_INVITATION_MODE=false` and redeploy. Normal account eligibility resumes; disabling invitation mode does not enable AI. Keep `MIRAI_AI_ENABLED=false` until its separate funded hosted gate passes. New or revoked accounts still need ordinary owner approval.

To close product access again, set the flag true with the required safe configuration and redeploy. For code rollback, select the recorded previous compatible release; no database migration is added by this feature. Browsers may retain an already rendered old page, but subsequent product requests are blocked by the current server gate.
