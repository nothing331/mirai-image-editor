BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(15);

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous)
VALUES
  ('66666666-6666-4666-8666-666666666666', 'project-a@example.com', false, false),
  ('77777777-7777-4777-8777-777777777777', 'project-b@example.com', false, false);
UPDATE public.profiles SET status = 'active'
WHERE id IN ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777');

INSERT INTO public.asset_uploads
  (id, owner_id, request_key, state, declared_bytes, reserved_bytes,
   actual_bytes, original_name, original_mime, source_sha256, base_sha256,
   source_bytes, base_bytes, width, height, staging_key, source_key, base_key)
SELECT gen_random_uuid(), '66666666-6666-4666-8666-666666666666', gen_random_uuid(),
  CASE WHEN n = 7 THEN 'uploaded'::public.mirai_asset_state ELSE 'ready'::public.mirai_asset_state END,
  100, 31457380, CASE WHEN n = 7 THEN NULL ELSE 300 END,
  'project-' || n || '.png', 'image/png',
  CASE WHEN n = 7 THEN NULL ELSE repeat('a', 64) END,
  CASE WHEN n = 7 THEN NULL ELSE repeat('b', 64) END,
  CASE WHEN n = 7 THEN NULL ELSE 100 END,
  CASE WHEN n = 7 THEN NULL ELSE 200 END,
  CASE WHEN n = 7 THEN NULL ELSE 10 END,
  CASE WHEN n = 7 THEN NULL ELSE 10 END,
  gen_random_uuid()::text, gen_random_uuid()::text, gen_random_uuid()::text
FROM generate_series(1, 7) AS n;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '66666666-6666-4666-8666-666666666666', true);
SELECT throws_ok($$ SELECT count(*)::bigint FROM public.cloud_projects $$,
  '42501', NULL, 'clients cannot list project rows directly');
SELECT throws_ok($$ SELECT count(*)::bigint FROM public.cloud_project_versions $$,
  '42501', NULL, 'clients cannot inspect version rows directly');
SELECT throws_ok($$ SELECT public.mirai_create_cloud_project(
  '66666666-6666-4666-8666-666666666666', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'Hidden') $$,
  '42501', NULL, 'clients cannot call the project creation function');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT throws_ok($$ SELECT public.mirai_create_cloud_project(
  '66666666-6666-4666-8666-666666666666', gen_random_uuid(), gen_random_uuid(),
  (SELECT id FROM public.asset_uploads WHERE original_name = 'project-7.png'), 'Unready') $$,
  'P0001', 'ready upload not found', 'unfinished upload cannot create a project');
SELECT throws_ok($$ SELECT public.mirai_create_cloud_project(
  '77777777-7777-4777-8777-777777777777', gen_random_uuid(), gen_random_uuid(),
  (SELECT id FROM public.asset_uploads WHERE original_name = 'project-1.png'), 'Foreign') $$,
  'P0001', 'ready upload not found', 'another account cannot attach an upload');

SELECT public.mirai_create_cloud_project(
  '66666666-6666-4666-8666-666666666666',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  (SELECT id FROM public.asset_uploads WHERE original_name = 'project-1.png'), 'First');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_projects $$,
  ARRAY[1::bigint], 'ready original creates one project');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_project_versions $$,
  ARRAY[1::bigint], 'creation also commits one original version');
SELECT results_eq($$ SELECT width::integer FROM public.cloud_project_versions
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  ARRAY[10::integer], 'initial version keeps normalized dimensions');
SELECT throws_ok($$ UPDATE public.cloud_project_versions SET width = 12
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '42501', NULL, 'service role cannot mutate an immutable version');
SELECT throws_ok($$ DELETE FROM public.cloud_project_versions
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  '42501', NULL, 'service role cannot delete an immutable version');
SELECT results_eq($$ SELECT (public.mirai_create_cloud_project(
  '66666666-6666-4666-8666-666666666666', gen_random_uuid(), gen_random_uuid(),
  (SELECT id FROM public.asset_uploads WHERE original_name = 'project-1.png'), 'First')).id $$,
  ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid], 'repeat attach returns same project');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_project_versions $$,
  ARRAY[1::bigint], 'repeat attach adds no version');
SELECT throws_ok($$ SELECT public.mirai_create_cloud_project(
  '66666666-6666-4666-8666-666666666666', gen_random_uuid(), gen_random_uuid(),
  (SELECT id FROM public.asset_uploads WHERE original_name = 'project-1.png'), 'Changed') $$,
  'P0001', 'upload already attached with another name', 'retry cannot silently rename');

DO $$ DECLARE n integer; BEGIN
  FOR n IN 2..5 LOOP
    PERFORM public.mirai_create_cloud_project(
      '66666666-6666-4666-8666-666666666666', gen_random_uuid(), gen_random_uuid(),
      (SELECT id FROM public.asset_uploads WHERE original_name = 'project-' || n || '.png'),
      'Project ' || n);
  END LOOP;
END $$;
SELECT throws_ok($$ SELECT public.mirai_create_cloud_project(
  '66666666-6666-4666-8666-666666666666', gen_random_uuid(), gen_random_uuid(),
  (SELECT id FROM public.asset_uploads WHERE original_name = 'project-6.png'), 'Sixth') $$,
  'P0001', 'project allowance reached', 'sixth active project is rejected');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_projects $$,
  ARRAY[5::bigint], 'project cap leaves existing five intact');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
