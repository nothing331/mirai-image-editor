BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

INSERT INTO auth.users (id, email, raw_user_meta_data, is_sso_user, is_anonymous)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'owner@example.com', '{"full_name":"Owner"}', false, false),
  ('22222222-2222-4222-8222-222222222222', 'member@example.com', '{"full_name":"Member"}', false, false),
  ('33333333-3333-4333-8333-333333333333', 'invitee@example.com', '{"full_name":"Invitee"}', false, false);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.profiles $$,
  ARRAY[3::bigint],
  'auth signups create exactly one pending Mirai profile each'
);

SET LOCAL ROLE service_role;
SELECT public.mirai_bootstrap_owner('11111111-1111-4111-8111-111111111111');
RESET ROLE;

SELECT results_eq(
  $$ SELECT status::text || ':' || account_role::text FROM public.profiles WHERE id = '11111111-1111-4111-8111-111111111111' $$,
  ARRAY['active:owner'],
  'server bootstrap creates one active owner'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT public.mirai_request_access();

SELECT results_eq(
  $$ SELECT status::text FROM public.access_requests WHERE requester_id = '22222222-2222-4222-8222-222222222222' $$,
  ARRAY['pending'],
  'an authenticated account can create only a pending request'
);

SELECT throws_ok(
  $$ SELECT public.mirai_decide_access((SELECT id FROM public.access_requests WHERE requester_id = '22222222-2222-4222-8222-222222222222'), 'approve') $$,
  '42501',
  'owner access required',
  'a member cannot approve their own request'
);

SELECT throws_ok(
  $$ UPDATE public.profiles SET account_role = 'owner' WHERE id = '22222222-2222-4222-8222-222222222222' $$,
  '42501',
  NULL,
  'a member cannot assign their own owner role'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT public.mirai_decide_access(
  (SELECT id FROM public.access_requests WHERE requester_id = '22222222-2222-4222-8222-222222222222'),
  'approve'
);

SELECT results_eq(
  $$ SELECT status::text FROM public.profiles WHERE id = '22222222-2222-4222-8222-222222222222' $$,
  ARRAY['active'],
  'owner approval activates the requested account'
);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.account_allowance_grants WHERE account_id = '22222222-2222-4222-8222-222222222222' AND granted_quantity = 5 $$,
  ARRAY[1::bigint],
  'approval creates one five-image grant'
);

SELECT public.mirai_decide_access(
  (SELECT id FROM public.access_requests WHERE requester_id = '22222222-2222-4222-8222-222222222222'),
  'approve'
);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.account_allowance_grants WHERE account_id = '22222222-2222-4222-8222-222222222222' $$,
  ARRAY[1::bigint],
  'repeated approval cannot duplicate the allowance grant'
);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.access_audit_log WHERE subject_id = '22222222-2222-4222-8222-222222222222' AND action = 'access_approved' $$,
  ARRAY[1::bigint],
  'repeated approval records one approval event'
);

CREATE TEMP TABLE issued_invitation AS
SELECT * FROM public.mirai_create_invitation('invitee@example.com');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
SELECT public.mirai_claim_invitation((SELECT invite_token FROM issued_invitation));

SELECT results_eq(
  $$ SELECT status::text FROM public.profiles WHERE id = '33333333-3333-4333-8333-333333333333' $$,
  ARRAY['active'],
  'a matching Google identity can claim its invitation'
);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.account_allowance_grants WHERE account_id = '33333333-3333-4333-8333-333333333333' AND granted_quantity = 5 $$,
  ARRAY[1::bigint],
  'an invitation claim creates one five-image grant'
);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.profiles $$,
  ARRAY[1::bigint],
  'RLS lets a member read only their own profile'
);

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.access_audit_log $$,
  ARRAY[0::bigint],
  'RLS hides owner audit records from members'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.profiles $$,
  ARRAY[3::bigint],
  'the owner can inspect all account profiles'
);

SELECT public.mirai_revoke_access('22222222-2222-4222-8222-222222222222');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
SELECT throws_ok(
  $$ SELECT public.mirai_request_access() $$,
  '42501',
  'account is revoked',
  'a revoked account cannot request access again'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
