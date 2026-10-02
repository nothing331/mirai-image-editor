-- A trashed project remains owned and charged until the maintenance runner
-- confirms every private object has been removed.
alter table public.cloud_projects drop constraint cloud_projects_status_check;
alter table public.cloud_projects add constraint cloud_projects_status_check
  check (status in ('active', 'trash', 'purging'));
alter table public.cloud_projects add column deleted_at timestamptz;
alter table public.cloud_projects add column purge_after timestamptz;
create index cloud_projects_owner_trash on public.cloud_projects (owner_id, deleted_at desc, id)
  where status = 'trash';
create index cloud_projects_due_purge on public.cloud_projects (purge_after, id)
  where status = 'trash';

create table public.mirai_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('project-purge', 'account-purge', 'account-export')),
  owner_id uuid not null,
  project_id uuid,
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  result_key text,
  result_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((kind = 'project-purge' and project_id is not null) or kind <> 'project-purge')
);
create unique index mirai_maintenance_project_once on public.mirai_maintenance_tasks (project_id)
  where kind = 'project-purge';
create index mirai_maintenance_ready on public.mirai_maintenance_tasks (next_attempt_at, id)
  where status in ('pending', 'running');
alter table public.mirai_maintenance_tasks enable row level security;
revoke all on public.mirai_maintenance_tasks from public, anon, authenticated;
grant select, insert, update on public.mirai_maintenance_tasks to service_role;

create function public.mirai_trash_project(target_owner uuid, target_project uuid)
returns public.cloud_projects language plpgsql security invoker set search_path = '' as $$
declare result public.cloud_projects;
begin
  select * into result from public.cloud_projects
    where id = target_project and owner_id = target_owner for update;
  if not found then raise exception 'owned project not found'; end if;
  if result.status = 'purging' then raise exception 'project purge already started'; end if;
  if result.status = 'trash' then return result; end if;
  update public.cloud_projects set status = 'trash', deleted_at = now(),
    purge_after = now() + interval '30 days', updated_at = now()
    where id = target_project returning * into result;
  return result;
end;
$$;

create function public.mirai_restore_project(target_owner uuid, target_project uuid)
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
  if (select count(*) from public.cloud_projects where owner_id = target_owner and status = 'active') >= 5 then
    raise exception 'project allowance reached';
  end if;
  update public.cloud_projects set status = 'active', deleted_at = null,
    purge_after = null, updated_at = now() where id = target_project returning * into result;
  return result;
end;
$$;

create function public.mirai_request_project_purge(target_owner uuid, target_project uuid)
returns public.mirai_maintenance_tasks language plpgsql security invoker set search_path = '' as $$
declare result public.mirai_maintenance_tasks;
declare project_row public.cloud_projects;
begin
  select * into project_row from public.cloud_projects
    where id = target_project and owner_id = target_owner for update;
  if not found then raise exception 'owned project not found'; end if;
  if project_row.status = 'active' then raise exception 'trash project first'; end if;
  update public.cloud_projects set status = 'purging', updated_at = now() where id = target_project;
  insert into public.mirai_maintenance_tasks (kind, owner_id, project_id)
    values ('project-purge', target_owner, target_project)
    on conflict (project_id) where kind = 'project-purge' do nothing;
  select * into result from public.mirai_maintenance_tasks
    where kind = 'project-purge' and project_id = target_project;
  return result;
end;
$$;

create function public.mirai_claim_maintenance_task()
returns public.mirai_maintenance_tasks language plpgsql security invoker set search_path = '' as $$
declare result public.mirai_maintenance_tasks;
begin
  select * into result from public.mirai_maintenance_tasks
    where ((status = 'pending' and next_attempt_at <= now())
      or (status = 'running' and lease_until < now()))
      and (kind <> 'account-purge' or not exists
        (select 1 from public.cloud_projects where owner_id = public.mirai_maintenance_tasks.owner_id))
      and (kind <> 'account-purge' or not exists
        (select 1 from public.mirai_maintenance_tasks pending_export
          where pending_export.owner_id = public.mirai_maintenance_tasks.owner_id
            and pending_export.kind = 'account-export'
            and pending_export.lease_until > now()))
    order by next_attempt_at, id for update skip locked limit 1;
  if not found then return null; end if;
  update public.mirai_maintenance_tasks set status = 'running', attempts = attempts + 1,
    lease_until = now() + interval '20 minutes', updated_at = now()
    where id = result.id returning * into result;
  return result;
end;
$$;

create function public.mirai_fail_maintenance_task(target_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.mirai_maintenance_tasks set status = case when attempts >= 10 then 'failed' else 'pending' end,
    next_attempt_at = now() + make_interval(mins => least(60, 2 ^ least(attempts, 6))::integer),
    lease_until = null, updated_at = now()
    where id = target_id and status = 'running';
end;
$$;

create function public.mirai_finish_project_purge(target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.mirai_maintenance_tasks;
declare version_row record;
declare upload_id uuid;
begin
  select * into task_row from public.mirai_maintenance_tasks
    where id = target_id and kind = 'project-purge' and status = 'running' for update;
  if not found then raise exception 'running purge task not found'; end if;
  perform 1 from public.cloud_projects where id = task_row.project_id and owner_id = task_row.owner_id
    and status = 'purging' for update;
  if not found then raise exception 'purging project not found'; end if;
  select original_upload_id into upload_id from public.cloud_projects where id = task_row.project_id;
  if exists (select 1 from storage.objects o join public.asset_uploads u
      on o.name in (u.source_key, u.base_key) and o.bucket_id = 'mirai-assets'
      where u.id = upload_id)
    or exists (select 1 from storage.objects o join public.asset_uploads u
      on o.name = u.staging_key and o.bucket_id = 'mirai-asset-staging'
      where u.id = upload_id)
    or exists (select 1 from storage.objects o join public.cloud_edit_assets a
      on o.name = a.storage_key and o.bucket_id = 'mirai-assets'
      where a.project_id = task_row.project_id) then
    raise exception 'private project objects remain';
  end if;
  delete from public.cloud_commit_receipts where project_id = task_row.project_id;
  delete from public.cloud_edit_operations where project_id = task_row.project_id;
  for version_row in select id from public.cloud_project_versions
    where project_id = task_row.project_id order by sequence desc loop
    delete from public.cloud_project_versions where id = version_row.id;
  end loop;
  delete from public.cloud_edit_assets where project_id = task_row.project_id;
  delete from public.cloud_projects where id = task_row.project_id;
  delete from public.asset_uploads where id = upload_id and owner_id = task_row.owner_id;
  update public.mirai_maintenance_tasks set status = 'complete', lease_until = null,
    completed_at = now(), updated_at = now() where id = target_id;
end;
$$;

revoke all on function public.mirai_trash_project(uuid,uuid), public.mirai_restore_project(uuid,uuid),
  public.mirai_request_project_purge(uuid,uuid), public.mirai_claim_maintenance_task(),
  public.mirai_fail_maintenance_task(uuid), public.mirai_finish_project_purge(uuid)
  from public, anon, authenticated;
grant execute on function public.mirai_trash_project(uuid,uuid), public.mirai_restore_project(uuid,uuid),
  public.mirai_request_project_purge(uuid,uuid), public.mirai_claim_maintenance_task(),
  public.mirai_fail_maintenance_task(uuid), public.mirai_finish_project_purge(uuid)
  to service_role;

-- Refreshing an access token does not make an old session a recent sign-in.
create function public.mirai_recent_session(target_owner uuid, target_session uuid)
returns boolean language sql security definer set search_path = '' as $$
  select exists (select 1 from auth.sessions
    where id = target_session and user_id = target_owner
      and created_at >= now() - interval '10 minutes');
$$;
revoke all on function public.mirai_recent_session(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mirai_recent_session(uuid,uuid) to service_role;

create function public.mirai_request_account_deletion(target_owner uuid, target_session uuid)
returns public.mirai_maintenance_tasks language plpgsql security invoker set search_path = '' as $$
declare result public.mirai_maintenance_tasks;
declare project_row record;
begin
  if not public.mirai_recent_session(target_owner, target_session) then
    raise exception 'recent sign-in required';
  end if;
  perform 1 from public.profiles where id = target_owner and status = 'active' for update;
  if not found then raise exception 'active account not found'; end if;
  update public.profiles set status = 'revoked', updated_at = now() where id = target_owner;
  update public.mirai_maintenance_tasks set status = 'failed',
    updated_at = now() where owner_id = target_owner and kind = 'account-export'
      and status in ('pending', 'running');
  for project_row in select id from public.cloud_projects where owner_id = target_owner for update loop
    update public.cloud_projects set status = 'purging', updated_at = now() where id = project_row.id;
    insert into public.mirai_maintenance_tasks (kind, owner_id, project_id)
      values ('project-purge', target_owner, project_row.id)
      on conflict (project_id) where kind = 'project-purge' do nothing;
  end loop;
  insert into public.mirai_maintenance_tasks (kind, owner_id, next_attempt_at)
    values ('account-purge', target_owner, now() + interval '1 minute') returning * into result;
  return result;
end;
$$;
create unique index mirai_maintenance_account_purge_once on public.mirai_maintenance_tasks (owner_id)
  where kind = 'account-purge';
revoke all on function public.mirai_request_account_deletion(uuid,uuid) from public, anon, authenticated;
grant execute on function public.mirai_request_account_deletion(uuid,uuid) to service_role;

create function public.mirai_finish_account_purge(target_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare task_row public.mirai_maintenance_tasks;
begin
  select * into task_row from public.mirai_maintenance_tasks
    where id = target_id and kind = 'account-purge' and status = 'running' for update;
  if not found then raise exception 'running account purge not found'; end if;
  if exists (select 1 from public.cloud_projects where owner_id = task_row.owner_id)
    or exists (select 1 from public.asset_uploads where owner_id = task_row.owner_id)
    or exists (select 1 from public.profiles where id = task_row.owner_id)
    or exists (select 1 from auth.users where id = task_row.owner_id) then
    raise exception 'account data remains';
  end if;
  update public.mirai_maintenance_tasks set status = 'complete', lease_until = null,
    completed_at = now(), updated_at = now() where id = target_id;
end;
$$;
revoke all on function public.mirai_finish_account_purge(uuid) from public, anon, authenticated;
grant execute on function public.mirai_finish_account_purge(uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mirai-exports', 'mirai-exports', false, 157286400, array['application/gzip'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create unique index mirai_maintenance_one_active_export on public.mirai_maintenance_tasks (owner_id)
  where kind = 'account-export' and status in ('pending', 'running');

create function public.mirai_request_account_export(target_owner uuid)
returns public.mirai_maintenance_tasks language plpgsql security invoker set search_path = '' as $$
declare result public.mirai_maintenance_tasks;
begin
  perform 1 from public.profiles where id = target_owner and status = 'active' for update;
  if not found then raise exception 'active account not found'; end if;
  select * into result from public.mirai_maintenance_tasks
    where owner_id = target_owner and kind = 'account-export'
      and status in ('pending', 'running') order by created_at desc limit 1;
  if found then return result; end if;
  insert into public.mirai_maintenance_tasks (kind, owner_id)
    values ('account-export', target_owner) returning * into result;
  return result;
end;
$$;

create function public.mirai_finish_account_export(target_id uuid, target_key text)
returns void language plpgsql security invoker set search_path = '' as $$
declare task_row public.mirai_maintenance_tasks;
begin
  select * into task_row from public.mirai_maintenance_tasks
    where id = target_id and kind = 'account-export' and status = 'running' for update;
  if not found or target_key <> task_row.owner_id::text || '/' || task_row.id::text || '.tar.gz'
    then raise exception 'running export task not found'; end if;
  if not exists (select 1 from public.profiles where id = task_row.owner_id and status = 'active')
    then raise exception 'account is not eligible'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'mirai-exports' and name = target_key)
    then raise exception 'account export object not found'; end if;
  update public.mirai_maintenance_tasks set status = 'complete', result_key = target_key,
    result_expires_at = now() + interval '7 days', completed_at = now(),
    lease_until = null, updated_at = now() where id = target_id;
end;
$$;
revoke all on function public.mirai_request_account_export(uuid),
  public.mirai_finish_account_export(uuid,text) from public, anon, authenticated;
grant execute on function public.mirai_request_account_export(uuid),
  public.mirai_finish_account_export(uuid,text) to service_role;

-- An edit transfer that never reached the acceptance transaction is still
-- charged until maintenance confirms its private object is gone.
alter table public.cloud_edit_assets drop constraint cloud_edit_assets_state_check;
alter table public.cloud_edit_assets add constraint cloud_edit_assets_state_check
  check (state in ('reserved', 'ready', 'committed', 'cleaning'));

create function public.mirai_claim_orphan_edit_cleanup(target_id uuid)
returns public.cloud_edit_assets language plpgsql security invoker set search_path = '' as $$
declare asset_row public.cloud_edit_assets;
begin
  select * into asset_row from public.cloud_edit_assets where id = target_id for update;
  if not found then return null; end if;
  if asset_row.state = 'cleaning' then return asset_row; end if;
  if asset_row.state = 'committed' or asset_row.updated_at > now() - interval '24 hours'
    or exists (select 1 from public.cloud_project_versions where edit_asset_id = target_id)
    then return null; end if;
  update public.cloud_edit_assets set state = 'cleaning', updated_at = now()
    where id = target_id returning * into asset_row;
  return asset_row;
end;
$$;
create function public.mirai_finish_orphan_edit_cleanup(target_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare asset_row public.cloud_edit_assets;
begin
  select * into asset_row from public.cloud_edit_assets where id = target_id for update;
  if not found then return false; end if;
  if asset_row.state <> 'cleaning'
    or exists (select 1 from public.cloud_project_versions where edit_asset_id = target_id)
    or exists (select 1 from storage.objects where bucket_id = 'mirai-assets' and name = asset_row.storage_key)
    then return false; end if;
  delete from public.cloud_edit_assets where id = target_id;
  return true;
end;
$$;
revoke all on function public.mirai_claim_orphan_edit_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.mirai_claim_orphan_edit_cleanup(uuid) to service_role;
revoke all on function public.mirai_finish_orphan_edit_cleanup(uuid) from public, anon, authenticated;
grant execute on function public.mirai_finish_orphan_edit_cleanup(uuid) to service_role;

create function public.mirai_account_usage(target_owner uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'usedBytes',
      (select coalesce(sum(case when state = 'ready'
        then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end
        else reserved_bytes end), 0) from public.asset_uploads
        where owner_id = target_owner and state in
          ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready'))
      + (select coalesce(sum(bytes), 0) from public.cloud_edit_assets where owner_id = target_owner),
    'limitBytes', 104857600,
    'activeProjects', (select count(*) from public.cloud_projects
      where owner_id = target_owner and status = 'active'),
    'projectLimit', 5
  );
$$;
revoke all on function public.mirai_account_usage(uuid) from public, anon, authenticated;
grant execute on function public.mirai_account_usage(uuid) to service_role;
