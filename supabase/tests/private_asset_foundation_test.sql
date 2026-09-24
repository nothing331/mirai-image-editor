BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(13);

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous)
VALUES
  ('44444444-4444-4444-8444-444444444444', 'asset-a@example.com', false, false),
  ('55555555-5555-4555-8555-555555555555', 'asset-b@example.com', false, false);
UPDATE public.profiles SET status = 'active'
WHERE id IN ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555');

SELECT results_eq(
  $$ SELECT count(*)::bigint FROM storage.buckets
     WHERE id IN ('mirai-asset-staging', 'mirai-assets') AND public = false $$,
  ARRAY[2::bigint], 'both asset buckets are private'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
SELECT throws_ok($$ SELECT count(*)::bigint FROM public.asset_uploads $$,
  '42501', NULL, 'clients cannot inspect reservation rows');
SELECT throws_ok(
  $$ SELECT public.mirai_reserve_original_upload(
    '44444444-4444-4444-8444-444444444444',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a.png', 'image/png', 100) $$,
  '42501', NULL, 'clients cannot invoke reservation function'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM storage.objects
     WHERE bucket_id IN ('mirai-asset-staging', 'mirai-assets') $$,
  ARRAY[0::bigint], 'clients cannot list private objects'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.mirai_reserve_original_upload(
  '44444444-4444-4444-8444-444444444444',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a.png', 'image/png', 100);
SELECT public.mirai_reserve_original_upload(
  '44444444-4444-4444-8444-444444444444',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'a.png', 'image/png', 100);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.asset_uploads
     WHERE owner_id = '44444444-4444-4444-8444-444444444444' $$,
  ARRAY[1::bigint], 'idempotent reservation creates one row'
);
SELECT throws_ok(
  $$ SELECT public.mirai_reserve_original_upload(
    '44444444-4444-4444-8444-444444444444',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'changed.png', 'image/png', 100) $$,
  'P0001', 'request key reused with different upload',
  'request key cannot be reused for another source'
);
SELECT results_eq(
  $$ SELECT state::text FROM public.asset_uploads
     WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  ARRAY['reserved'], 'new assets begin reserved'
);
SELECT throws_ok(
  $$ SELECT public.mirai_finish_original_upload(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '44444444-4444-4444-8444-444444444444',
    repeat('a', 64), repeat('b', 64), 100, 200, 10, 10) $$,
  'P0001', 'upload not finalizing', 'only finalizing rows can commit'
);
UPDATE public.asset_uploads SET state = 'finalizing'
WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SELECT public.mirai_finish_original_upload(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '44444444-4444-4444-8444-444444444444',
  repeat('a', 64), repeat('b', 64), 100, 200, 10, 10);
SELECT results_eq(
  $$ SELECT state::text || ':' || actual_bytes::text FROM public.asset_uploads
     WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  ARRAY['ready:300'], 'finalization records committed bytes exactly'
);
SELECT public.mirai_finish_original_upload(
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '44444444-4444-4444-8444-444444444444',
  repeat('a', 64), repeat('b', 64), 100, 200, 10, 10);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.asset_uploads WHERE state = 'ready' $$,
  ARRAY[1::bigint], 'repeated finalization returns one asset record'
);
SELECT throws_ok(
  $$ SELECT public.mirai_finish_original_upload(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '55555555-5555-4555-8555-555555555555',
    repeat('a', 64), repeat('b', 64), 100, 200, 10, 10) $$,
  'P0001', 'upload not found', 'another account cannot finalize the upload'
);
SELECT results_eq(
  $$ SELECT count(*)::bigint FROM public.asset_uploads WHERE staging_deleted_at IS NULL $$,
  ARRAY[1::bigint], 'staging cleanup remains explicitly tracked'
);
SELECT public.mirai_reserve_original_upload(
  '44444444-4444-4444-8444-444444444444',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'ffffffff-ffff-4fff-8fff-ffffffffffff', 'b.png', 'image/png', 10485760);
SELECT public.mirai_reserve_original_upload(
  '44444444-4444-4444-8444-444444444444',
  '99999999-9999-4999-8999-999999999999',
  '88888888-8888-4888-8888-888888888888', 'c.png', 'image/png', 10485760);
SELECT throws_ok(
  $$ SELECT public.mirai_reserve_original_upload(
    '44444444-4444-4444-8444-444444444444',
    '77777777-7777-4777-8777-777777777777',
    '66666666-6666-4666-8666-666666666666', 'd.png', 'image/png', 10485760) $$,
  'P0001', 'account storage allowance reached',
  'reserved uploads count against the per-account quota'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
