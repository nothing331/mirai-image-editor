BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(16);

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous)
VALUES ('88888888-8888-4888-8888-888888888888', 'lifecycle@example.com', false, false),
  ('99999999-9999-4999-8999-999999999999', 'other-lifecycle@example.com', false, false);
UPDATE public.profiles SET status = 'active'
  WHERE id IN ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999');

INSERT INTO public.asset_uploads
  (id, owner_id, request_key, state, declared_bytes, reserved_bytes,
   actual_bytes, original_name, original_mime, source_sha256, base_sha256,
   source_bytes, base_bytes, width, height, staging_key, source_key, base_key)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888',
  gen_random_uuid(), 'ready', 100, 31457380, 300, 'photo.png', 'image/png',
  repeat('a', 64), repeat('b', 64), 100, 200, 10, 10, 'stage-a', 'source-a', 'base-a');

SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.mirai_trash_project(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  '42501', NULL, 'browser role cannot trash projects directly');
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.mirai_create_cloud_project('88888888-8888-4888-8888-888888888888',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Photo');
SELECT results_eq($$ SELECT status FROM public.cloud_projects
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  ARRAY['active'::text], 'project starts active');
SELECT public.mirai_reserve_cloud_edit_asset(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  repeat('1',64), repeat('2',64), 500, 10, 10);
UPDATE public.cloud_edit_assets SET state = 'ready' WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT public.mirai_accept_cloud_edit(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  '11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', repeat('1',64),
  'recolor', '{}'::jsonb, 10, 10, 'AQ==', false);
SELECT results_eq($$ SELECT count(*)::integer FROM public.cloud_edit_operations
  WHERE project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  ARRAY[1::integer], 'fixture has one immutable accepted edit');
SELECT results_eq($$ SELECT public.mirai_claim_orphan_edit_cleanup(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd') IS NULL $$,
  ARRAY[true], 'committed edit asset cannot be claimed as orphan');
SELECT public.mirai_reserve_cloud_edit_asset(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
  repeat('3',64), repeat('4',64), 500, 10, 10);
UPDATE public.cloud_edit_assets SET updated_at = now() - interval '25 hours'
  WHERE id = '22222222-2222-4222-8222-222222222222';
SELECT results_eq($$ SELECT state FROM public.mirai_claim_orphan_edit_cleanup(
  '22222222-2222-4222-8222-222222222222') $$,
  ARRAY['cleaning'::text], 'stale uncommitted edit is fenced before cleanup');
SELECT results_eq($$ SELECT public.mirai_finish_orphan_edit_cleanup(
  '22222222-2222-4222-8222-222222222222') $$,
  ARRAY[true], 'unreferenced asset record is released after object absence');
SELECT results_eq($$ SELECT status FROM public.mirai_trash_project(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  ARRAY['trash'::text], 'trash immediately blocks active access');
SELECT results_eq($$ SELECT count(*)::integer FROM public.asset_uploads
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  ARRAY[1::integer], 'trash retains charged original');
SELECT throws_ok($$ SELECT public.mirai_restore_project(
  '99999999-9999-4999-8999-999999999999', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  'P0001', 'owned project not found', 'another owner cannot restore');
SELECT results_eq($$ SELECT status FROM public.mirai_restore_project(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  ARRAY['active'::text], 'owner can restore before purge');
SELECT public.mirai_trash_project('88888888-8888-4888-8888-888888888888',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
SELECT results_eq($$ SELECT kind FROM public.mirai_request_project_purge(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  ARRAY['project-purge'::text], 'permanent delete queues maintenance');
SELECT throws_ok($$ SELECT public.mirai_restore_project(
  '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') $$,
  'P0001', 'project cannot be restored', 'purging project cannot be restored');
SELECT public.mirai_claim_maintenance_task();
SELECT public.mirai_finish_project_purge((SELECT id FROM public.mirai_maintenance_tasks
  WHERE project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
SELECT results_eq($$ SELECT count(*)::integer FROM public.cloud_projects
  WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  ARRAY[0::integer], 'purge removes project and versions');
SELECT results_eq($$ SELECT count(*)::integer FROM public.cloud_edit_assets
  WHERE project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  ARRAY[0::integer], 'purge removes accepted edit asset records');
SELECT results_eq($$ SELECT count(*)::integer FROM public.asset_uploads
  WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' $$,
  ARRAY[0::integer], 'purge releases original record');
SELECT results_eq($$ SELECT status FROM public.mirai_maintenance_tasks
  WHERE project_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
  ARRAY['complete'::text], 'purge task is recorded complete');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
