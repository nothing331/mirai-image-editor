# Access approval and invitation email

Owner approval saves account eligibility and the one-time credit grant, then sends an approval email. Creating an invitation saves its 14-day, Google-email-bound link, then emails that same link. Mail is request-bound over Resend HTTPS, with no background worker or SMTP requirement. Failure never rolls back saved access or replenishes credits.

## Setup

1. Create a Resend account and verify a sender domain, including the DNS records Resend requires. Use a sending-only API key scoped to that domain where available. Resend's development sender is not a substitute for a verified domain when emailing arbitrary users. See [domain setup](https://resend.com/docs/dashboard/domains/introduction).
2. Apply `20261013042536_access_notification_email.sql` through the protected migration workflow, after the existing account migrations. The migration adds owner-readable, RLS-protected receipts and owner-checked claim/completion functions; it does not change eligibility, credit grants, or existing invitation tokens.
3. Add these server-only Render values and redeploy:

   ```text
   MIRAI_EMAIL_ENABLED=true
   MIRAI_EMAIL_FROM=hello@your-verified-domain.example
   RESEND_API_KEY=<your-server-only-key>
   ```

   Enter the address alone for `MIRAI_EMAIL_FROM`; Mirai supplies the display name. Keep Google authentication, the canonical application URL, owner configuration and Supabase credentials configured. Never prefix the API key with `NEXT_PUBLIC_`. Email is disabled by default in local development/CI and does not require AI to be enabled.
4. In staging, use a controlled recipient to approve a request and issue an invitation. Confirm receipt, matching-Google-email instructions, link/expiry, sign-in, owner-only retry controls and mobile layout. The email adapts its wording to `MIRAI_INVITATION_MODE=true`: approval still does not open the editor. Do not copy a real invite link into public issue reports.

## Delivery and retry

- “Email sent” means Resend accepted the request; spam filtering, bounce or inbox delivery is not verified by Mirai. Check Resend's records for delivery issues. No webhook/delivery dashboard is included.
- Approval email retry is available beside an active member who has an approved request. It reads the approved request/profile and sends to the database email; it does not invoke approval again. A stored sent receipt suppresses another provider request.
- The invitation form retains the generated link when email fails. **Retry invitation email** reuses its token, validates the current hash/email/expiry in the database, and does not replace the invitation. Copying the link for manual delivery remains available.
- Submitting **Send invitation** again creates a replacement token for the address and invalidates its previous link. This is distinct from retrying delivery. After leaving/reloading the form, its one-time raw token is unavailable; intentionally create a replacement invitation if required. Only token hashes are stored in the database.
- Receipts contain event identifiers, content hashes, fenced attempts and provider references, not message bodies, raw tokens or API keys. Deleting the associated request/invitation cascades its receipts; account deletion removes approval receipts through its request records.
- Known provider rejection is retryable. A network timeout, malformed success response, 409, server failure or unconfirmed receipt write remains uncertain. A two-minute lease prevents concurrent sends. A retry of unchanged content uses the same Resend idempotency key.
- Resend retains idempotency keys for [24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys). Mirai conservatively refuses uncertain retries after 23 hours, or after the message content/configuration changes. Check provider evidence before reconciling the receipt; do not blindly delete it to resend. There is no automatic retry schedule or guaranteed exactly-once inbox delivery.
- For operator reconciliation, inspect the matching `access_email_deliveries` row and the Resend request using `mirai-access/<delivery_id>`. With verified provider acceptance, a service-only update may mark that exact event/delivery `sent` and record its provider ID. Only after confirmed rejection/no dispatch may it be marked `failed` for a safe owner retry. Preserve the event/delivery reference when investigating; do not mark an uncertain send failed merely because no message appeared in an inbox.

## Verification

Run lint, type checks, unit tests and build. With a **disposable local** Supabase stack containing the migration, run:

```bash
npx --yes supabase@2.116.0 test db --local supabase/tests/access_email_test.sql
npm run test:e2e:access-email
```

For a separately located local stack, set `MIRAI_TEST_SUPABASE_DIR` to its directory. The browser runner rejects a non-loopback API URL, uses synthetic users, replaces the Resend request with a test interceptor, and deletes its identities/artifacts. It cannot send real email. Coverage includes real owner forms, approval with one grant/send, failed invitation send, same-link retry, desktop and phone overflow, plus database recipient/expiry/role checks, concurrent claims, fenced completion, idempotency and uncertain retry limits.

To turn mail off, set `MIRAI_EMAIL_ENABLED=false` and redeploy. Approval and manual invitation links continue working; the owner sees that automatic email is disabled. Remove the provider key if no longer needed. Keep the additive migration when rolling back code; no application startup migration runs.
