-- Wave D: shared welcome credits, durable paid attempts, fenced stages and private results.
alter table public.account_allowance_grants drop constraint account_allowance_grants_granted_quantity_check;
-- The beta has not consumed AI yet. Upgrade the existing grant once; approval still uses ON CONFLICT DO NOTHING.
update public.account_allowance_grants set granted_quantity = 25;
alter table public.account_allowance_grants add constraint account_allowance_grants_granted_quantity_check check (granted_quantity = 25);


create table public.ai_control (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  committed_microusd bigint not null default 0 check (committed_microusd >= 0),
  budget_microusd bigint not null default 0 check (budget_microusd >= 0)
);
insert into public.ai_control default values;
create table public.ai_creation_sessions (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique (owner_id, id)
);
create table public.ai_attempts (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid,
  input_version_id uuid,
  creation_session_id uuid,
  workflow text not null check (workflow in ('remove','replace','restyle','transform','extend','extend-analysis','creation')),
  executor_id uuid not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  status text not null default 'running' check (status in ('running','unknown','ready','failed','accepted','discarded','expired','cleaning')),
  credit_state text not null check (credit_state in ('reserved','spent','released','none')),
  storage_bytes bigint not null check (storage_bytes between 0 and 41943040),
  budget_reserved bigint not null check (budget_reserved >= 0),
  result_key text not null unique,
  lease_until timestamptz not null default now() + interval '5 minutes',
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_project_id uuid,
  check ((workflow = 'creation' and project_id is null and input_version_id is null and creation_session_id is not null)
    or (workflow <> 'creation' and project_id is not null and input_version_id is not null and creation_session_id is null)),
  foreign key (owner_id, creation_session_id) references public.ai_creation_sessions(owner_id,id) on delete cascade
);
create index ai_attempts_owner_recent on public.ai_attempts(owner_id,created_at desc);
create index ai_attempts_project on public.ai_attempts(project_id);
create index ai_attempts_cleanup on public.ai_attempts(expires_at) where storage_bytes > 0;
create table public.ai_stage_attempts (
  attempt_id uuid not null references public.ai_attempts(id) on delete cascade,
  ordinal integer not null check (ordinal between 1 and 3),
  stage text not null check (stage in ('replace-plan','transform-plan','transform-fidelity','extend-analysis','image')),
  status text not null default 'running' check (status in ('running','succeeded','failed','unknown')),
  cost_microusd bigint not null check (cost_microusd >= 0),
  provider_request_id text,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration)='object'),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage)='object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (attempt_id, ordinal)
);
create table public.ai_extend_analysis (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null,
  input_version_id uuid not null,
  cache_version text not null,
  analysis jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, project_id, input_version_id, cache_version)
);
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('mirai-ai-results','mirai-ai-results',false,41943040,array['application/json'])
on conflict (id) do nothing;

create function public.mirai_ai_storage(target_owner uuid default null) returns bigint
language sql security invoker set search_path = '' as $$
 select coalesce(sum(storage_bytes),0) from public.ai_attempts where target_owner is null or owner_id = target_owner;
$$;
create function public.mirai_ai_usage(target_owner uuid) returns jsonb
language sql security invoker set search_path = '' as $$
 select jsonb_build_object('granted',coalesce((select granted_quantity from public.account_allowance_grants
 where account_id=target_owner and allowance_key='initial-ai-images'),0),
 'spent',(select count(*) from public.ai_attempts where owner_id=target_owner and credit_state='spent'),
 'pending',(select count(*) from public.ai_attempts where owner_id=target_owner and credit_state='reserved'),
 'enabled',(select enabled from public.ai_control where id));
$$;
create function public.mirai_admit_ai(
 target_owner uuid, target_id uuid, target_project uuid, target_input uuid,
 target_session uuid, target_workflow text, target_digest text, target_budget bigint, target_executor uuid
) returns public.ai_attempts language plpgsql security invoker set search_path = '' as $$
declare result public.ai_attempts; allowance integer; used bigint; storage_used bigint; planned_bytes bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 if not exists(select 1 from public.profiles where id=target_owner and status='active') then raise exception 'account is not eligible'; end if;
 if target_workflow='creation' then
   if not exists(select 1 from public.ai_creation_sessions where id=target_session and owner_id=target_owner and project_id is null and expires_at>now()) then raise exception 'creation session not found'; end if;
   if (select count(*) from public.cloud_projects where owner_id=target_owner and status='active')>=5 then raise exception 'project allowance reached'; end if;
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
 if (select count(*) from public.ai_attempts where owner_id=target_owner and created_at>now()-interval '1 hour')>=60 then raise exception 'AI hourly rate limit reached'; end if;
 -- An expired request may still be purchasing provider work. It remains busy until reconciled.
 if exists(select 1 from public.ai_attempts where status in ('running','unknown')) then raise exception 'AI is busy'; end if;
 select granted_quantity into allowance from public.account_allowance_grants where account_id=target_owner and allowance_key='initial-ai-images';
 select count(*) into used from public.ai_attempts where owner_id=target_owner and credit_state in ('reserved','spent');
 if allowance is null or used>=allowance then raise exception 'AI credit allowance reached'; end if;
 if target_workflow='extend-analysis' and (select count(*) from public.ai_attempts where owner_id=target_owner and workflow='extend-analysis')>=25
   then raise exception 'AI planning allowance reached'; end if;
 if target_budget<0 or target_budget+(select coalesce(sum(budget_reserved),0) from public.ai_attempts)
   +(select committed_microusd from public.ai_control where id)
   >(select budget_microusd from public.ai_control where id) then raise exception 'global AI budget reached'; end if;
 planned_bytes := case when target_workflow='extend-analysis' then 65536 else 41943040 end;
 select coalesce(sum(case when state='ready' then actual_bytes+case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end),0)
 into storage_used from public.asset_uploads where owner_id=target_owner and state in ('reserved','uploading','uploaded','finalizing','cleaning','ready');
 storage_used := storage_used + (select coalesce(sum(bytes),0) from public.cloud_edit_assets where owner_id=target_owner) + public.mirai_ai_storage(target_owner);
 if storage_used+planned_bytes>104857600 then raise exception 'account storage allowance reached'; end if;
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
create function public.mirai_start_ai_stage(target_owner uuid,target_id uuid,target_stage text,target_cost bigint,target_configuration jsonb default '{}'::jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare a public.ai_attempts; ordinal integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 select * into a from public.ai_attempts where id=target_id and owner_id=target_owner for update;
 if not found or a.status<>'running' or a.lease_until<=now() then raise exception 'AI lease expired'; end if;
 if not (select enabled from public.ai_control where id)
 or not exists(select 1 from public.profiles where id=target_owner and status='active')
 or (a.project_id is not null and not exists(select 1 from public.cloud_projects where id=a.project_id and owner_id=target_owner and status='active' and current_version_id=a.input_version_id))
 then raise exception 'AI access revoked'; end if;
 if target_cost<0 or target_cost>a.budget_reserved then raise exception 'AI stage budget reached'; end if;
 select count(*)+1 into ordinal from public.ai_stage_attempts where attempt_id=target_id;
 if ordinal > (case when a.workflow='transform' then 3 when a.workflow='replace' then 2 else 1 end) then raise exception 'AI stage allowance reached'; end if;
 insert into public.ai_stage_attempts(attempt_id,ordinal,stage,cost_microusd,configuration) values(target_id,ordinal,target_stage,target_cost,target_configuration);
 -- Keep the total reservation until completion; finished stages reduce the remaining portion.
 return ordinal;
end;
$$;
create function public.mirai_finish_ai_stage(target_owner uuid,target_id uuid,target_ordinal integer,target_status text,target_provider text,target_usage jsonb default '{}'::jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare cost bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 if target_status not in ('succeeded','failed','unknown') then raise exception 'invalid stage outcome'; end if;
 update public.ai_stage_attempts s set status=target_status,completed_at=now(),provider_request_id=left(target_provider,200),usage=target_usage,
 cost_microusd=case when target_status='failed' then 0 else cost_microusd end
 where s.attempt_id=target_id and s.ordinal=target_ordinal and s.status='running'
 and exists(select 1 from public.ai_attempts where id=target_id and owner_id=target_owner)
 returning case when target_status='failed' then 0 else cost_microusd end into cost;
 if not found then raise exception 'AI stage already settled'; end if;
 -- Failed known stages conservatively retain their original ceiling in the request reservation until finish.
 if cost>0 then
   update public.ai_control set committed_microusd=committed_microusd+cost where id;
   update public.ai_attempts set budget_reserved=budget_reserved-cost where id=target_id; end if;
end;
$$;
create function public.mirai_finish_ai(target_owner uuid,target_id uuid,target_status text,target_bytes bigint)
returns public.ai_attempts language plpgsql security invoker set search_path = '' as $$
declare a public.ai_attempts;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 select * into a from public.ai_attempts where id=target_id and owner_id=target_owner for update;
 if not found or a.status<>'running' then raise exception 'AI completion fenced'; end if;
 if target_status not in ('ready','failed','unknown') then raise exception 'invalid AI outcome'; end if;
 if target_status='ready' then
   if a.lease_until<=now() or not exists(select 1 from public.profiles where id=target_owner and status='active')
   or (a.project_id is not null and not exists(select 1 from public.cloud_projects where id=a.project_id and owner_id=target_owner and status='active' and current_version_id=a.input_version_id)) then raise exception 'AI completion fenced'; end if;
   if target_bytes<1 or target_bytes>a.storage_bytes or not exists(select 1 from storage.objects where bucket_id='mirai-ai-results' and name=a.result_key)
     then raise exception 'stored AI result required'; end if;
   if exists(select 1 from public.ai_stage_attempts where attempt_id=target_id and status in ('running','unknown')) then raise exception 'AI stage outcome unknown'; end if;
 end if;
 if exists(select 1 from public.ai_stage_attempts where attempt_id=target_id and status in ('running','unknown')) then target_status:='unknown'; end if;
 update public.ai_attempts set status=target_status,
 credit_state=case when a.credit_state='none' then 'none' when target_status='ready' then 'spent' when target_status='failed' then 'released' else 'reserved' end,
 storage_bytes=case when target_status='ready' then target_bytes else storage_bytes end,
 budget_reserved=case when target_status='unknown' then budget_reserved else 0 end,
 expires_at=case when target_status='ready' then now()+interval '24 hours' else expires_at end,updated_at=now()
 where id=target_id returning * into a;
 return a;
end;
$$;

alter table public.ai_control enable row level security;
alter table public.ai_creation_sessions enable row level security;
alter table public.ai_attempts enable row level security;
alter table public.ai_stage_attempts enable row level security;
alter table public.ai_extend_analysis enable row level security;
revoke all on public.ai_control,public.ai_creation_sessions,public.ai_attempts,public.ai_stage_attempts,public.ai_extend_analysis from public,anon,authenticated;
grant all on public.ai_control,public.ai_creation_sessions,public.ai_attempts,public.ai_stage_attempts,public.ai_extend_analysis to service_role;
revoke all on function public.mirai_ai_storage(uuid),public.mirai_ai_usage(uuid),public.mirai_admit_ai(uuid,uuid,uuid,uuid,uuid,text,text,bigint,uuid),public.mirai_start_ai_stage(uuid,uuid,text,bigint,jsonb),public.mirai_finish_ai_stage(uuid,uuid,integer,text,text,jsonb),public.mirai_finish_ai(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.mirai_ai_storage(uuid),public.mirai_ai_usage(uuid),public.mirai_admit_ai(uuid,uuid,uuid,uuid,uuid,text,text,bigint,uuid),public.mirai_start_ai_stage(uuid,uuid,text,bigint,jsonb),public.mirai_finish_ai_stage(uuid,uuid,integer,text,text,jsonb),public.mirai_finish_ai(uuid,uuid,text,bigint) to service_role;

create or replace function public.mirai_decide_access(request_id uuid, decision text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  request_record public.access_requests;
  result public.profiles;
begin
  if actor is null or not mirai_private.is_owner() then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if decision not in ('approve', 'reject') then
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;

  select * into request_record
  from public.access_requests
  where id = request_id
  for update;

  if request_record.id is null then
    raise exception 'access request not found' using errcode = 'P0002';
  end if;

  if decision = 'approve' then
    update public.profiles
    set status = 'active', updated_at = now()
    where id = request_record.requester_id
    returning * into result;

    update public.access_requests
    set status = 'approved', decided_at = coalesce(decided_at, now()), decided_by = coalesce(decided_by, actor), updated_at = now()
    where id = request_record.id and status <> 'approved';

    insert into public.account_allowance_grants (account_id, allowance_key, granted_quantity, granted_by)
    values (request_record.requester_id, 'initial-ai-images', 25, actor)
    on conflict (account_id, allowance_key) do nothing;

    insert into public.access_audit_log (actor_id, subject_id, action, access_request_id)
    select actor, request_record.requester_id, 'access_approved', request_record.id
    where request_record.status <> 'approved';
  else
    if request_record.status = 'approved' then
      raise exception 'approved access must be revoked explicitly' using errcode = '22023';
    end if;

    update public.access_requests
    set status = 'rejected', decided_at = coalesce(decided_at, now()), decided_by = coalesce(decided_by, actor), updated_at = now()
    where id = request_record.id;

    select * into result from public.profiles where id = request_record.requester_id;

    insert into public.access_audit_log (actor_id, subject_id, action, access_request_id)
    select actor, request_record.requester_id, 'access_rejected', request_record.id
    where request_record.status <> 'rejected';
  end if;

  return result;
end;
$$;

create or replace function public.mirai_claim_invitation(invite_token text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_account_id uuid := (select auth.uid());
  account_email text;
  invitation_record public.invitations;
  result public.profiles;
begin
  if current_account_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select email into account_email from public.profiles where id = current_account_id;
  select * into invitation_record
  from public.invitations
  where token_hash = extensions.digest(invite_token, 'sha256')
  for update;

  if invitation_record.id is null
    or invitation_record.status <> 'pending'
    or invitation_record.expires_at <= now()
    or invitation_record.email <> account_email then
    raise exception 'invitation is invalid or expired' using errcode = '42501';
  end if;

  update public.invitations
  set status = 'claimed', claimed_by = current_account_id, claimed_at = now(), updated_at = now()
  where id = invitation_record.id;

  update public.profiles
  set status = 'active', updated_at = now()
  where id = current_account_id
  returning * into result;

  insert into public.account_allowance_grants (account_id, allowance_key, granted_quantity, granted_by)
  values (current_account_id, 'initial-ai-images', 25, invitation_record.invited_by)
  on conflict (account_id, allowance_key) do nothing;

  update public.access_requests
  set status = 'approved', decided_at = coalesce(decided_at, now()), decided_by = coalesce(decided_by, invitation_record.invited_by), updated_at = now()
  where requester_id = current_account_id and status <> 'approved';

  insert into public.access_audit_log (actor_id, subject_id, action, invitation_id)
  values (current_account_id, current_account_id, 'invitation_claimed', invitation_record.id);

  return result;
end;
$$;

create or replace function public.mirai_bootstrap_owner(target_account_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.profiles;
begin
  update public.profiles
  set account_role = 'owner', status = 'active', updated_at = now()
  where id = target_account_id
  returning * into result;

  if result.id is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  insert into public.account_allowance_grants (account_id, allowance_key, granted_quantity, granted_by)
  values (target_account_id, 'initial-ai-images', 25, target_account_id)
  on conflict (account_id, allowance_key) do nothing;

  insert into public.access_audit_log (actor_id, subject_id, action)
  select target_account_id, target_account_id, 'owner_bootstrapped'
  where not exists (
    select 1 from public.access_audit_log
    where subject_id = target_account_id and action = 'owner_bootstrapped'
  );

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
  if original_usage + edit_usage + public.mirai_ai_storage(target_owner) + target_bytes > 104857600 then raise exception 'account storage allowance reached'; end if;
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
  if original_usage + edit_usage + public.mirai_ai_storage(target_owner) + requested_reserve > 104857600 then raise exception 'account storage allowance reached'; end if;
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
    'limitBytes', 104857600,
    'activeProjects', (select count(*) from public.cloud_projects
      where owner_id = target_owner and status = 'active'),
    'projectLimit', 5
  );
$$;

alter table public.ai_attempts add column accepted_output_id uuid;
alter table public.ai_creation_sessions add column project_id uuid;
alter table public.cloud_edit_operations add column method text not null default 'local' check (method in ('local','generative'));
alter table public.cloud_edit_operations drop constraint cloud_edit_operations_kind_check;
alter table public.cloud_edit_operations add constraint cloud_edit_operations_kind_check check (kind in ('recolor','paint','crop','resize','rotate','flip','text','watermark','transform','remove','replace','restyle','extend'));

create or replace function public.mirai_accept_cloud_edit(
  target_owner uuid, target_project uuid, target_input uuid,
  target_output uuid, target_operation uuid, target_asset uuid,
  target_request_key uuid, target_digest text, target_kind text,
  target_parameters jsonb, target_mask_width integer, target_mask_height integer,
  target_mask_base64 text, target_replace_future boolean
) returns public.cloud_commit_receipts
language plpgsql security invoker set search_path = '' as $$
declare project_row public.cloud_projects;
declare asset_row public.cloud_edit_assets;
declare input_row public.cloud_project_versions;
declare existing public.cloud_commit_receipts;
declare receipt public.cloud_commit_receipts;
declare next_sequence bigint;
declare ai_row public.ai_attempts;
begin
  select * into project_row from public.cloud_projects
    where id = target_project and owner_id = target_owner and status = 'active' for update;
  if not found or not exists (select 1 from public.profiles where id = target_owner and status = 'active') then
    raise exception 'owned active project not found';
  end if;
  select * into existing from public.cloud_commit_receipts
    where owner_id = target_owner and project_id = target_project and request_key = target_request_key;
  if found then
    if existing.digest <> target_digest then raise exception 'edit request key reused with different payload'; end if;
    return existing;
  end if;
  if target_parameters ? 'diagnosticRequestId' then
    select * into ai_row from public.ai_attempts where id=(target_parameters->>'diagnosticRequestId')::uuid and owner_id=target_owner for update;
    if not found or ai_row.project_id<>target_project or ai_row.input_version_id<>target_input or ai_row.workflow<>target_kind
      or ai_row.status<>'ready' or ai_row.expires_at<=now() then raise exception 'ready owned AI result required'; end if;
  elsif target_kind in ('remove','replace','restyle','extend') then raise exception 'AI result required';
  end if;
  if project_row.current_version_id <> target_input then raise exception 'edit input is not current'; end if;
  if project_row.current_version_id <> project_row.head_version_id and not target_replace_future then
    raise exception 'redo replacement requires acknowledgement';
  end if;
  select * into input_row from public.cloud_project_versions
    where project_id = target_project and owner_id = target_owner and id = target_input and active;
  if not found then raise exception 'active input version not found'; end if;
  select * into asset_row from public.cloud_edit_assets
    where id = target_asset and project_id = target_project and owner_id = target_owner
      and request_key = target_request_key and digest = target_digest and state in ('ready', 'committed') for update;
  if not found then raise exception 'ready edit asset not found'; end if;
  if target_kind not in ('recolor','paint','crop','resize','rotate','flip','text','watermark','transform','remove','replace','restyle','extend')
    or target_parameters is null or pg_catalog.jsonb_typeof(target_parameters) <> 'object'
    or target_mask_width <> input_row.width or target_mask_height <> input_row.height
    or target_mask_base64 is null or pg_catalog.length(target_mask_base64) < 1 then
    raise exception 'invalid edit operation';
  end if;
  if project_row.current_version_id <> project_row.head_version_id then
    update public.cloud_project_versions set active = false
      where project_id = target_project and sequence > input_row.sequence and active;
  end if;
  select coalesce(max(sequence), 0) + 1 into next_sequence
    from public.cloud_project_versions where project_id = target_project;
  insert into public.cloud_project_versions
    (id, project_id, owner_id, upload_id, edit_asset_id, parent_version_id, kind, width, height, sequence)
  values (target_output, target_project, target_owner, null, target_asset, target_input,
    'edit', asset_row.width, asset_row.height, next_sequence);
  insert into public.cloud_edit_operations
    (id, project_id, owner_id, input_version_id, output_version_id, kind, method,
     parameters, mask_width, mask_height, mask_deflate)
  values (target_operation, target_project, target_owner, target_input, target_output,
    target_kind, case when ai_row.id is null then 'local' else 'generative' end, target_parameters, target_mask_width, target_mask_height,
    pg_catalog.decode(target_mask_base64, 'base64'));
  update public.cloud_edit_assets set state = 'committed', updated_at = now()
    where id = target_asset;
  update public.cloud_projects set current_version_id = target_output,
    head_version_id = target_output, revision = revision + 1, updated_at = now()
    where id = target_project and owner_id = target_owner
    returning * into project_row;
  insert into public.cloud_commit_receipts
    (owner_id, project_id, request_key, digest, input_version_id,
     output_version_id, operation_id, revision)
  values (target_owner, target_project, target_request_key, target_digest,
    target_input, target_output, target_operation, project_row.revision)
  returning * into receipt;
  if ai_row.id is not null then
    update public.ai_attempts set status='accepted',accepted_output_id=target_output,updated_at=now() where id=ai_row.id;
  end if;
  return receipt;
end;
$$;

create function public.mirai_use_ai_original(target_owner uuid,target_attempt uuid,target_upload uuid,target_name text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare a public.ai_attempts; s public.ai_creation_sessions; p public.cloud_projects;
begin
 select * into a from public.ai_attempts where id=target_attempt and owner_id=target_owner and workflow='creation';
 if not found then raise exception 'creation attempt not found'; end if;
 select * into s from public.ai_creation_sessions where id=a.creation_session_id and owner_id=target_owner for update;
 if s.project_id is not null then return s.project_id; end if;
 if a.status<>'ready' or a.expires_at<=now() then raise exception 'creation result expired'; end if;
 if not exists(select 1 from public.asset_uploads where id=target_upload and owner_id=target_owner and request_key=target_attempt and state='ready') then raise exception 'generated original not found'; end if;
 p:=public.mirai_create_cloud_project(target_owner,gen_random_uuid(),gen_random_uuid(),target_upload,target_name);
 update public.ai_creation_sessions set project_id=p.id where id=s.id;
 update public.ai_attempts set status='accepted',accepted_project_id=p.id,updated_at=now() where id=a.id;
 return p.id;
end;
$$;
revoke all on function public.mirai_use_ai_original(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.mirai_use_ai_original(uuid,uuid,uuid,text) to service_role;

-- Lease expiry never assumes cancellation or restores uncertain credits/spend.
create function public.mirai_expire_ai_leases() returns void
language plpgsql security invoker set search_path = '' as $$
declare a public.ai_attempts; unsettled bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 for a in select * from public.ai_attempts where status='running' and lease_until<=now() for update loop
   select coalesce(sum(cost_microusd),0) into unsettled from public.ai_stage_attempts where attempt_id=a.id and status='running';
   update public.ai_control set committed_microusd=committed_microusd+unsettled where id;
   update public.ai_stage_attempts set status='unknown',completed_at=now() where attempt_id=a.id and status='running';
   update public.ai_attempts set status='unknown',budget_reserved=budget_reserved-unsettled,updated_at=now() where id=a.id;
 end loop;
end;
$$;
create function public.mirai_claim_ai_cleanup(target_id uuid) returns text
language plpgsql security invoker set search_path = '' as $$
declare a public.ai_attempts;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 select * into a from public.ai_attempts where id=target_id for update;
 if not found or a.storage_bytes=0 or a.status in ('running','unknown') then return null; end if;
 if a.status not in ('failed','discarded','cleaning') and a.expires_at>now()
   and exists(select 1 from public.profiles where id=a.owner_id and status='active') then return null; end if;
 update public.ai_attempts set status='cleaning',updated_at=now() where id=a.id;
 return a.result_key;
end;
$$;
create function public.mirai_finish_ai_cleanup(target_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 if exists(select 1 from public.ai_attempts a join storage.objects o on o.bucket_id='mirai-ai-results' and o.name=a.result_key where a.id=target_id)
 then raise exception 'AI objects still exist'; end if;
 update public.ai_attempts set storage_bytes=0,status=case when credit_state='released' then 'failed' else 'expired' end,updated_at=now() where id=target_id and status='cleaning';
end;
$$;
-- Operator-only audited reconciliation. Failure restores user credit, never erases uncertain provider cost.
create table public.ai_reconciliation_log (
 id uuid primary key default gen_random_uuid(), attempt_id uuid not null,
 outcome text not null, reason text not null check (char_length(reason) between 10 and 1000), created_at timestamptz not null default now()
);
alter table public.ai_reconciliation_log enable row level security;
revoke all on public.ai_reconciliation_log from public,anon,authenticated;
grant select,insert on public.ai_reconciliation_log to service_role;
create function public.mirai_reconcile_ai(target_id uuid,target_outcome text,target_bytes bigint,target_reason text)
returns void language plpgsql security invoker set search_path = '' as $$
declare a public.ai_attempts; unsettled bigint;
begin
 perform pg_catalog.pg_advisory_xact_lock(770041);
 select * into a from public.ai_attempts where id=target_id and status='unknown' for update;
 if not found or a.lease_until>now() then raise exception 'expired unknown AI attempt required'; end if;
 if target_outcome not in ('ready','failed') then raise exception 'invalid reconciliation outcome'; end if;
 if target_outcome='ready' and (target_bytes<1 or target_bytes>a.storage_bytes
   or not exists(select 1 from storage.objects where bucket_id='mirai-ai-results' and name=a.result_key)
   or not exists(select 1 from public.profiles where id=a.owner_id and status='active')
   or (a.project_id is not null and not exists(select 1 from public.cloud_projects where id=a.project_id and owner_id=a.owner_id and status='active' and current_version_id=a.input_version_id)))
 then raise exception 'owned stored result required'; end if;
 select coalesce(sum(cost_microusd),0) into unsettled from public.ai_stage_attempts where attempt_id=a.id and status='running';
 update public.ai_control set committed_microusd=committed_microusd+unsettled where id;
 insert into public.ai_reconciliation_log(attempt_id,outcome,reason) values(a.id,target_outcome,target_reason);
 update public.ai_stage_attempts set status=case when target_outcome='ready' then 'succeeded' else 'unknown' end,completed_at=coalesce(completed_at,now()) where attempt_id=a.id and status='running';
 update public.ai_attempts set status=target_outcome,budget_reserved=0,
 credit_state=case when credit_state='none' then 'none' when target_outcome='ready' then 'spent' else 'released' end,
 storage_bytes=case when target_outcome='ready' then target_bytes else storage_bytes end,
 expires_at=case when target_outcome='ready' then now()+interval '24 hours' else expires_at end,updated_at=now() where id=a.id;
end;
$$;
revoke all on function public.mirai_expire_ai_leases(),public.mirai_claim_ai_cleanup(uuid),public.mirai_finish_ai_cleanup(uuid),public.mirai_reconcile_ai(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.mirai_expire_ai_leases(),public.mirai_claim_ai_cleanup(uuid),public.mirai_finish_ai_cleanup(uuid),public.mirai_reconcile_ai(uuid,text,bigint,text) to service_role;

-- Reuse one live, unattached session instead of allowing an unbounded session-creation endpoint.
create function public.mirai_create_ai_session(target_owner uuid) returns uuid
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
 if (select count(*) from public.cloud_projects where owner_id=target_owner and status='active')>=5 then raise exception 'project allowance reached'; end if;
 if (public.mirai_ai_usage(target_owner)->>'granted')::integer <=
    (public.mirai_ai_usage(target_owner)->>'spent')::integer+(public.mirai_ai_usage(target_owner)->>'pending')::integer then raise exception 'AI credit allowance reached'; end if;
 insert into public.ai_creation_sessions(id,owner_id) values(gen_random_uuid(),target_owner) returning id into session_id;
 return session_id;
end;
$$;
revoke all on function public.mirai_create_ai_session(uuid) from public,anon,authenticated;
grant execute on function public.mirai_create_ai_session(uuid) to service_role;
