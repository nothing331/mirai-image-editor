BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

INSERT INTO auth.users (id, email, is_sso_user, is_anonymous)
VALUES
 ('88888888-8888-4888-8888-888888888888', 'editor-a@example.com', false, false),
 ('99999999-9999-4999-8999-999999999999', 'editor-b@example.com', false, false);
UPDATE public.profiles SET status = 'active'
WHERE id IN ('88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999');
INSERT INTO public.asset_uploads
  (id, owner_id, request_key, state, declared_bytes, reserved_bytes,
   actual_bytes, original_name, original_mime, source_sha256, base_sha256,
   source_bytes, base_bytes, width, height, staging_key, source_key, base_key)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888',
  gen_random_uuid(), 'ready', 100, 31457380, 200, 'original.png', 'image/png',
  repeat('a',64), repeat('b',64), 100, 100, 10, 10, 'stage-a', 'source-a', 'base-a');
SET LOCAL ROLE service_role;
SELECT public.mirai_create_cloud_project(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Editor');
SELECT public.mirai_reserve_cloud_edit_asset(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 repeat('1',64), repeat('2',64), 500, 10, 10);
UPDATE public.cloud_edit_assets SET state = 'ready' WHERE id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
SELECT throws_ok($$ SELECT public.mirai_accept_cloud_edit(
 '99999999-9999-4999-8999-999999999999', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', gen_random_uuid(), gen_random_uuid(),
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', gen_random_uuid(), repeat('1',64),
 'recolor', '{}'::jsonb, 10, 10, 'AQ==', false) $$,
 'P0001', 'owned active project not found', 'foreign owner cannot accept edit');
SELECT throws_ok($$ SELECT public.mirai_accept_cloud_edit(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', repeat('1',64),
 'recolor', '{}'::jsonb, 10, 10, 'AQ==', false) $$,
 'P0001', 'edit input is not current', 'stale input cannot advance history');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_edit_operations $$,
 ARRAY[0::bigint], 'failed edits create no operation');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_project_versions $$,
 ARRAY[1::bigint], 'failed edits create no version');
SELECT public.mirai_accept_cloud_edit(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'ffffffff-ffff-4fff-8fff-ffffffffffff',
 '11111111-1111-4111-8111-111111111111', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', repeat('1',64),
 'recolor', '{"color":"#ff0000"}'::jsonb, 10, 10, 'AQ==', false);
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_edit_operations $$,
 ARRAY[1::bigint], 'acceptance creates one operation');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_project_versions $$,
 ARRAY[2::bigint], 'acceptance creates one version');
SELECT results_eq($$ SELECT current_version_id FROM public.cloud_projects WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
 ARRAY['ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid], 'current pointer selects accepted version');
SELECT results_eq($$ SELECT (public.mirai_accept_cloud_edit(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', gen_random_uuid(), gen_random_uuid(),
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', repeat('1',64),
 'recolor', '{}'::jsonb, 10, 10, 'AQ==', false)).output_version_id $$,
 ARRAY['ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid], 'lost acknowledgement returns first receipt');
SELECT results_eq($$ SELECT count(*)::bigint FROM public.cloud_project_versions $$,
 ARRAY[2::bigint], 'retry adds no version');
SELECT throws_ok($$ SELECT public.mirai_accept_cloud_edit(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', gen_random_uuid(), gen_random_uuid(),
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', repeat('3',64),
 'recolor', '{}'::jsonb, 10, 10, 'AQ==', false) $$,
 'P0001', 'edit request key reused with different payload', 'request key rejects a changed payload');
SELECT public.mirai_select_cloud_version(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
SELECT results_eq($$ SELECT current_version_id FROM public.cloud_projects WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
 ARRAY['cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid], 'undo selects original');
SELECT results_eq($$ SELECT head_version_id FROM public.cloud_projects WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
 ARRAY['ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid], 'undo retains redo head');
SELECT public.mirai_select_cloud_version(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'ffffffff-ffff-4fff-8fff-ffffffffffff');
SELECT results_eq($$ SELECT current_version_id FROM public.cloud_projects WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' $$,
 ARRAY['ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid], 'redo restores accepted version');
SELECT public.mirai_select_cloud_version(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
SELECT public.mirai_reserve_cloud_edit_asset(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
 repeat('4',64), repeat('5',64), 400, 7, 10);
UPDATE public.cloud_edit_assets SET state = 'ready' WHERE id = '22222222-2222-4222-8222-222222222222';
SELECT throws_ok($$ SELECT public.mirai_accept_cloud_edit(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444',
 '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333', repeat('4',64),
 'crop', '{}'::jsonb, 10, 10, 'AQ==', false) $$,
 'P0001', 'redo replacement requires acknowledgement', 'branch replacement needs explicit acknowledgement');
SELECT public.mirai_accept_cloud_edit(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444',
 '55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222',
 '33333333-3333-4333-8333-333333333333', repeat('4',64),
 'crop', '{}'::jsonb, 10, 10, 'AQ==', true);
SELECT results_eq($$ SELECT active FROM public.cloud_project_versions WHERE id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' $$,
 ARRAY[false], 'replaced redo is detached from active history');
SELECT results_eq($$ SELECT width FROM public.cloud_project_versions WHERE id = '44444444-4444-4444-8444-444444444444' $$,
 ARRAY[7], 'dimension-changing edit keeps output size');
SELECT throws_ok($$ SELECT public.mirai_select_cloud_version(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'ffffffff-ffff-4fff-8fff-ffffffffffff') $$,
 'P0001', 'active version not found', 'detached future cannot be selected');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
SELECT throws_ok($$ SELECT count(*)::bigint FROM public.cloud_edit_assets $$,
 '42501', NULL, 'browser roles cannot list edit assets');
SELECT throws_ok($$ SELECT public.mirai_select_cloud_version(
 '88888888-8888-4888-8888-888888888888', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') $$,
 '42501', NULL, 'browser roles cannot move history');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
