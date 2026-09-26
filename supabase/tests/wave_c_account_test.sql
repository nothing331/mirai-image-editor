BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous)
VALUES ('12121212-1212-4212-8212-121212121212', 'account-lifecycle@example.com', false, false),
  ('34343434-3434-4434-8434-343434343434', 'another-account@example.com', false, false);
UPDATE public.profiles SET status = 'active'
  WHERE id IN ('12121212-1212-4212-8212-121212121212', '34343434-3434-4434-8434-343434343434');
INSERT INTO auth.sessions (id, user_id, created_at)
VALUES ('56565656-5656-4656-8656-565656565656', '12121212-1212-4212-8212-121212121212', now() - interval '1 minute'),
  ('78787878-7878-4878-8878-787878787878', '12121212-1212-4212-8212-121212121212', now() - interval '1 hour');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.mirai_request_account_deletion(
  '12121212-1212-4212-8212-121212121212', '56565656-5656-4656-8656-565656565656') $$,
  '42501', NULL, 'browser role cannot request account deletion directly');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT results_eq($$ SELECT (public.mirai_account_usage(
  '12121212-1212-4212-8212-121212121212')->>'usedBytes')::integer $$,
  ARRAY[0::integer], 'usage aggregates owned reservations without a page cap');
SELECT results_eq($$ SELECT public.mirai_recent_session(
  '12121212-1212-4212-8212-121212121212', '56565656-5656-4656-8656-565656565656') $$,
  ARRAY[true], 'fresh session is accepted');
SELECT results_eq($$ SELECT public.mirai_recent_session(
  '12121212-1212-4212-8212-121212121212', '78787878-7878-4878-8878-787878787878') $$,
  ARRAY[false], 'old session is rejected');
SELECT results_eq($$ SELECT public.mirai_recent_session(
  '34343434-3434-4434-8434-343434343434', '56565656-5656-4656-8656-565656565656') $$,
  ARRAY[false], 'another account cannot borrow a fresh session');
SELECT throws_ok($$ SELECT public.mirai_request_account_deletion(
  '12121212-1212-4212-8212-121212121212', '78787878-7878-4878-8878-787878787878') $$,
  'P0001', 'recent sign-in required', 'old sign-in cannot delete account');
SELECT results_eq($$ SELECT kind FROM public.mirai_request_account_export(
  '12121212-1212-4212-8212-121212121212') $$,
  ARRAY['account-export'::text], 'active account can queue portable export');
SELECT public.mirai_request_account_export('12121212-1212-4212-8212-121212121212');
SELECT results_eq($$ SELECT count(*)::integer FROM public.mirai_maintenance_tasks
  WHERE kind = 'account-export' and owner_id = '12121212-1212-4212-8212-121212121212' $$,
  ARRAY[1::integer], 'repeated export requests share pending task');
SELECT public.mirai_request_account_deletion(
  '12121212-1212-4212-8212-121212121212', '56565656-5656-4656-8656-565656565656');
SELECT results_eq($$ SELECT status::text FROM public.profiles
  WHERE id = '12121212-1212-4212-8212-121212121212' $$,
  ARRAY['revoked'::text], 'deletion immediately disables account');
SELECT throws_ok($$ SELECT public.mirai_request_account_export(
  '12121212-1212-4212-8212-121212121212') $$,
  'P0001', 'active account not found', 'deleted account cannot queue export');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
