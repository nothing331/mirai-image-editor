-- Owners have no account allowances. Global funding, capacity and execution gates remain enforced.
create function public.mirai_has_unlimited_account(target_owner uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.profiles
    where id = target_owner and status = 'active' and account_role = 'owner');
$$;
revoke all on function public.mirai_has_unlimited_account(uuid) from public, anon, authenticated;
grant execute on function public.mirai_has_unlimited_account(uuid) to service_role;


create or replace function public.mirai_ai_usage(target_owner uuid) returns jsonb
language sql security invoker set search_path = '' as $$
 select jsonb_build_object('unlimited',public.mirai_has_unlimited_account(target_owner),'granted',coalesce((select granted_quantity from public.account_allowance_grants
 where account_id=target_owner and allowance_key='initial-ai-images'),0),
 'spent',(select count(*) from public.ai_attempts where owner_id=target_owner and credit_state='spent'),
 'pending',(select count(*) from public.ai_attempts where owner_id=target_owner and credit_state='reserved'),
 'enabled',(select enabled from public.ai_control where id));
$$;

create or replace function public.mirai_admit_ai(
 target_owner uuid, target_id uuid, target_project uuid, target_input uuid,
 target_session uuid, target_workflow text, target_digest text, target_budget bigint, target_executor uuid
) returns public.ai_attempts language plpgsql security invoker set search_path = '' as $$
declare result public.ai_attempts; allowance integer; used bigint; storage_used bigint; planned_bytes bigint; unlimited boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 if not exists(select 1 from public.profiles where id=target_owner and status='active') then raise exception 'account is not eligible'; end if;
 unlimited := public.mirai_has_unlimited_account(target_owner);
 if target_workflow='creation' then
   if not exists(select 1 from public.ai_creation_sessions where id=target_session and owner_id=target_owner and project_id is null and expires_at>now()) then raise exception 'creation session not found'; end if;
   if not unlimited and (select count(*) from public.cloud_projects where owner_id=target_owner and status='active')>=5 then raise exception 'project allowance reached'; end if;
 else
   if not exists(select 1 from public.cloud_projects p join public.cloud_project_versions v
     on v.id=target_input and v.project_id=p.id and v.owner_id=p.owner_id and v.active
     where p.id=target_project and p.owner_id=target_owner and p.status='active' and p.current_version_id=target_input)
     then raise exception 'current owned project not found'; end if;
 end if;
 select * into result from public.ai_attempts where id=target_id;
 if found then
   if result.owner_id<>target_owner then raise exception 'attempt not found'; end if;
   if result.digest<>target_digest or result.workflow<>target_workflow or result.project_id is distinct from target_project
      or result.input_version_id is distinct from target_input or result.creation_session_id is distinct from target_session
      then raise exception 'AI request key reused'; end if;
   return result;
 end if;
 if not (select enabled from public.ai_control where id) then raise exception 'AI is disabled'; end if;
 if not unlimited and (select count(*) from public.ai_attempts where owner_id=target_owner and created_at>now()-interval '1 hour')>=60 then raise exception 'AI hourly rate limit reached'; end if;
 -- An expired request may still be purchasing provider work. It remains busy until reconciled.
 if exists(select 1 from public.ai_attempts where status in ('running','unknown')) then raise exception 'AI is busy'; end if;
 select granted_quantity into allowance from public.account_allowance_grants where account_id=target_owner and allowance_key='initial-ai-images';
 select count(*) into used from public.ai_attempts where owner_id=target_owner and credit_state in ('reserved','spent');
 if not unlimited and (allowance is null or used>=allowance) then raise exception 'AI credit allowance reached'; end if;
 if not unlimited and target_workflow='extend-analysis' and (select count(*) from public.ai_attempts where owner_id=target_owner and workflow='extend-analysis')>=25
   then raise exception 'AI planning allowance reached'; end if;
 if target_budget<0 or target_budget+(select coalesce(sum(budget_reserved),0) from public.ai_attempts)
   +(select committed_microusd from public.ai_control where id)
   >(select budget_microusd from public.ai_control where id) then raise exception 'global AI budget reached'; end if;
 planned_bytes := case when target_workflow='extend-analysis' then 65536 else 41943040 end;
 select coalesce(sum(case when state='ready' then actual_bytes+case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end),0)
 into storage_used from public.asset_uploads where owner_id=target_owner and state in ('reserved','uploading','uploaded','finalizing','cleaning','ready');
 storage_used := storage_used + (select coalesce(sum(bytes),0) from public.cloud_edit_assets where owner_id=target_owner) + public.mirai_ai_storage(target_owner);
 if not unlimited and storage_used+planned_bytes>104857600 then raise exception 'account storage allowance reached'; end if;
 select coalesce(sum(case when state='ready' then actual_bytes+case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end),0)
 into storage_used from public.asset_uploads where state in ('reserved','uploading','uploaded','finalizing','cleaning','ready');
 storage_used := storage_used + (select coalesce(sum(bytes),0) from public.cloud_edit_assets) + public.mirai_ai_storage(null);
 if storage_used+planned_bytes>734003200 then raise exception 'global storage allowance reached'; end if;
 insert into public.ai_attempts(id,owner_id,project_id,input_version_id,creation_session_id,workflow,digest,executor_id,credit_state,storage_bytes,budget_reserved,result_key)
 values(target_id,target_owner,target_project,target_input,target_session,target_workflow,target_digest,target_executor,
 case when target_workflow='extend-analysis' then 'none' else 'reserved' end,planned_bytes,target_budget,target_owner::text||'/'||target_id::text||'/result.json') returning * into result;
 return result;
end;
$$;

create or replace function public.mirai_reserve_cloud_edit_asset(
  target_owner uuid, target_project uuid, target_id uuid, target_request_key uuid,
  target_digest text, target_sha text, target_bytes integer,
  target_width integer, target_height integer
) returns public.cloud_edit_assets
language plpgsql security invoker set search_path = '' as $$
declare result public.cloud_edit_assets;
declare original_usage bigint;
declare edit_usage bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(770041);
  select * into result from public.cloud_edit_assets
    where owner_id = target_owner and project_id = target_project and request_key = target_request_key;
  if found then
    if result.digest <> target_digest or result.sha256 <> target_sha or result.bytes <> target_bytes
      or result.width <> target_width or result.height <> target_height then
      raise exception 'edit request key reused with different payload';
    end if;
    return result;
  end if;
  if not exists (select 1 from public.profiles where id = target_owner and status = 'active')
    or not exists (select 1 from public.cloud_projects where id = target_project and owner_id = target_owner and status = 'active') then
    raise exception 'owned active project not found';
  end if;
  if target_bytes < 1 or target_bytes > 31457280 or target_width < 1 or target_height < 1
    or target_width > 2048 or target_height > 2048 or target_width::bigint * target_height > 4194304
    or target_digest !~ '^[0-9a-f]{64}$' or target_sha !~ '^[0-9a-f]{64}$' then
    raise exception 'edit asset outside allowed envelope';
  end if;
  select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
    into original_usage from public.asset_uploads where owner_id = target_owner
      and state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready');
  select coalesce(sum(bytes), 0) into edit_usage from public.cloud_edit_assets where owner_id = target_owner;
  if not public.mirai_has_unlimited_account(target_owner) and original_usage + edit_usage + public.mirai_ai_storage(target_owner) + target_bytes > 104857600 then raise exception 'account storage allowance reached'; end if;
  select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
    into original_usage from public.asset_uploads
      where state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready');
  select coalesce(sum(bytes), 0) into edit_usage from public.cloud_edit_assets;
  if original_usage + edit_usage + public.mirai_ai_storage(null) + target_bytes > 734003200 then raise exception 'global storage allowance reached'; end if;
  insert into public.cloud_edit_assets
    (id, owner_id, project_id, request_key, digest, storage_key, sha256, bytes, width, height)
  values (target_id, target_owner, target_project, target_request_key, target_digest,
    target_owner::text || '/' || target_project::text || '/edits/' || target_id::text || '.png',
    target_sha, target_bytes, target_width, target_height)
  returning * into result;
  return result;
end;
$$;

create or replace function public.mirai_reserve_original_upload(
  target_owner uuid, target_id uuid, target_request_key uuid,
  target_name text, target_mime text, target_bytes integer
) returns public.asset_uploads
language plpgsql security invoker set search_path = '' as $$
declare result public.asset_uploads;
declare requested_reserve bigint;
declare original_usage bigint;
declare edit_usage bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(770041);
  select * into result from public.asset_uploads where owner_id = target_owner and request_key = target_request_key;
  if found then
    if result.declared_bytes <> target_bytes or result.original_name <> target_name
      or result.original_mime <> target_mime then raise exception 'request key reused with different upload'; end if;
    return result;
  end if;
  if not exists (select 1 from public.profiles where id = target_owner and status = 'active') then raise exception 'account is not eligible'; end if;
  if target_bytes < 1 or target_bytes > 10485760 then raise exception 'upload exceeds byte limit'; end if;
  requested_reserve := target_bytes::bigint + 31457280;
  select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
    into original_usage from public.asset_uploads where owner_id = target_owner
      and state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready');
  select coalesce(sum(bytes), 0) into edit_usage from public.cloud_edit_assets where owner_id = target_owner;
  if not public.mirai_has_unlimited_account(target_owner) and original_usage + edit_usage + public.mirai_ai_storage(target_owner) + requested_reserve > 104857600 then raise exception 'account storage allowance reached'; end if;
  select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
    into original_usage from public.asset_uploads
      where state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready');
  select coalesce(sum(bytes), 0) into edit_usage from public.cloud_edit_assets;
  if original_usage + edit_usage + public.mirai_ai_storage(null) + requested_reserve > 734003200 then raise exception 'global storage allowance reached'; end if;
  insert into public.asset_uploads
    (id, owner_id, request_key, original_name, original_mime, declared_bytes,
     reserved_bytes, staging_key, source_key, base_key)
  values (target_id, target_owner, target_request_key, target_name, target_mime,
    target_bytes, requested_reserve,
    target_owner::text || '/' || target_id::text || '/source',
    target_owner::text || '/' || target_id::text || '/original',
    target_owner::text || '/' || target_id::text || '/base.png')
  returning * into result;
  return result;
end;
$$;

create or replace function public.mirai_account_usage(target_owner uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'usedBytes',
      (select coalesce(sum(case when state = 'ready'
        then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end
        else reserved_bytes end), 0) from public.asset_uploads
        where owner_id = target_owner and state in
          ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready'))
      + (select coalesce(sum(bytes), 0) from public.cloud_edit_assets where owner_id = target_owner) + public.mirai_ai_storage(target_owner),
    'ai', public.mirai_ai_usage(target_owner),
    'limitBytes', case when public.mirai_has_unlimited_account(target_owner) then null else 104857600 end,
    'activeProjects', (select count(*) from public.cloud_projects
      where owner_id = target_owner and status = 'active'),
    'projectLimit', case when public.mirai_has_unlimited_account(target_owner) then null else 5 end
  );
$$;

create or replace function public.mirai_create_cloud_project(
  target_owner uuid, target_id uuid, target_version_id uuid,
  target_upload_id uuid, target_name text
) returns public.cloud_projects
language plpgsql security invoker set search_path = '' as $$
declare result public.cloud_projects;
declare ready_upload public.asset_uploads;
begin
  perform 1 from public.profiles where id = target_owner and status = 'active' for update;
  if not found then raise exception 'account is not eligible'; end if;
  select * into result from public.cloud_projects
    where owner_id = target_owner and original_upload_id = target_upload_id;
  if found then
    if result.name <> target_name then raise exception 'upload already attached with another name'; end if;
    return result;
  end if;
  select * into ready_upload from public.asset_uploads
    where id = target_upload_id and owner_id = target_owner and state = 'ready';
  if not found then raise exception 'ready upload not found'; end if;
  if not public.mirai_has_unlimited_account(target_owner) and (select count(*) from public.cloud_projects where owner_id = target_owner and status = 'active') >= 5 then
    raise exception 'project allowance reached';
  end if;
  if target_name is null or char_length(target_name) not between 1 and 80
    or btrim(target_name) <> target_name then raise exception 'invalid project name'; end if;
  insert into public.cloud_projects
    (id, owner_id, name, original_upload_id, current_version_id, head_version_id)
  values (target_id, target_owner, target_name, target_upload_id, target_version_id, target_version_id)
  returning * into result;
  insert into public.cloud_project_versions
    (id, project_id, owner_id, upload_id, parent_version_id, kind, width, height)
  values (target_version_id, target_id, target_owner, target_upload_id, null,
    'original', ready_upload.width, ready_upload.height);
  return result;
end;
$$;

create or replace function public.mirai_restore_project(target_owner uuid, target_project uuid)
returns public.cloud_projects language plpgsql security invoker set search_path = '' as $$
declare result public.cloud_projects;
begin
  perform 1 from public.profiles where id = target_owner and status = 'active' for update;
  if not found then raise exception 'account is not eligible'; end if;
  select * into result from public.cloud_projects
    where id = target_project and owner_id = target_owner for update;
  if not found then raise exception 'owned project not found'; end if;
  if result.status = 'active' then return result; end if;
  if result.status <> 'trash' or result.purge_after <= now() then raise exception 'project cannot be restored'; end if;
  if not public.mirai_has_unlimited_account(target_owner) and (select count(*) from public.cloud_projects where owner_id = target_owner and status = 'active') >= 5 then
    raise exception 'project allowance reached';
  end if;
  update public.cloud_projects set status = 'active', deleted_at = null,
    purge_after = null, updated_at = now() where id = target_project returning * into result;
  return result;
end;
$$;

create or replace function public.mirai_create_ai_session(target_owner uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare session_id uuid;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 if not exists(select 1 from public.profiles where id=target_owner and status='active') then raise exception 'account is not eligible'; end if;
 select s.id into session_id from public.ai_creation_sessions s
 where s.owner_id=target_owner and s.project_id is null
 and (s.expires_at>now() or exists(select 1 from public.ai_attempts a where a.creation_session_id=s.id and a.status in ('running','unknown')))
 order by s.created_at desc limit 1;
 if found then return session_id; end if;
 if not (select enabled from public.ai_control where id) then raise exception 'AI is disabled'; end if;
 if not public.mirai_has_unlimited_account(target_owner) and (select count(*) from public.cloud_projects where owner_id=target_owner and status='active')>=5 then raise exception 'project allowance reached'; end if;
 if not public.mirai_has_unlimited_account(target_owner) and (public.mirai_ai_usage(target_owner)->>'granted')::integer <=
    (public.mirai_ai_usage(target_owner)->>'spent')::integer+(public.mirai_ai_usage(target_owner)->>'pending')::integer then raise exception 'AI credit allowance reached'; end if;
 insert into public.ai_creation_sessions(id,owner_id) values(gen_random_uuid(),target_owner) returning id into session_id;
 return session_id;
end;
$$;
