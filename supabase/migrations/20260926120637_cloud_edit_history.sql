-- P06/P07: immutable accepted edit assets, one active linear chain, and durable pointer moves.
create table public.cloud_edit_assets (
  id uuid primary key,
  owner_id uuid not null,
  project_id uuid not null,
  request_key uuid not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  storage_key text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer not null check (bytes between 1 and 31457280),
  width integer not null check (width between 1 and 2048),
  height integer not null check (height between 1 and 2048),
  state text not null default 'reserved' check (state in ('reserved', 'ready', 'committed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, project_id, request_key),
  unique (project_id, owner_id, id),
  foreign key (project_id, owner_id) references public.cloud_projects(id, owner_id) on delete restrict,
  check (width::bigint * height <= 4194304)
);
create index cloud_edit_assets_owner_state on public.cloud_edit_assets (owner_id, state);

alter table public.cloud_project_versions drop constraint cloud_project_versions_kind_check;
alter table public.cloud_project_versions drop constraint cloud_project_versions_parent_version_id_check;
alter table public.cloud_project_versions alter column upload_id drop not null;
alter table public.cloud_project_versions add column edit_asset_id uuid;
alter table public.cloud_project_versions add column sequence bigint not null default 0 check (sequence >= 0);
alter table public.cloud_project_versions add column active boolean not null default true;
alter table public.cloud_project_versions add constraint cloud_project_versions_kind_check
  check (kind in ('original', 'edit'));
alter table public.cloud_project_versions add constraint cloud_project_versions_source_check
  check ((kind = 'original' and upload_id is not null and edit_asset_id is null and parent_version_id is null and sequence = 0)
    or (kind = 'edit' and upload_id is null and edit_asset_id is not null and parent_version_id is not null and sequence > 0));
alter table public.cloud_project_versions add constraint cloud_project_versions_edit_asset_fk
  foreign key (project_id, owner_id, edit_asset_id)
  references public.cloud_edit_assets(project_id, owner_id, id) on delete restrict;
alter table public.cloud_project_versions add constraint cloud_project_versions_project_sequence_key unique (project_id, sequence);
create index cloud_project_versions_active_recent on public.cloud_project_versions (project_id, sequence desc) where active;

alter table public.cloud_projects add column head_version_id uuid;
update public.cloud_projects set head_version_id = current_version_id;
alter table public.cloud_projects alter column head_version_id set not null;
alter table public.cloud_projects add constraint cloud_projects_head_version_fk
  foreign key (id, head_version_id) references public.cloud_project_versions(project_id, id)
  deferrable initially deferred;

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
  if (select count(*) from public.cloud_projects where owner_id = target_owner and status = 'active') >= 5 then
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

create table public.cloud_edit_operations (
  id uuid primary key,
  project_id uuid not null,
  owner_id uuid not null,
  input_version_id uuid not null,
  output_version_id uuid not null unique,
  kind text not null check (kind in ('recolor','paint','crop','resize','rotate','flip','text','watermark','transform')),
  parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
  mask_width integer not null check (mask_width between 1 and 2048),
  mask_height integer not null check (mask_height between 1 and 2048),
  mask_deflate bytea not null,
  created_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.cloud_projects(id, owner_id) on delete restrict,
  foreign key (project_id, input_version_id) references public.cloud_project_versions(project_id, id) on delete restrict,
  foreign key (project_id, output_version_id) references public.cloud_project_versions(project_id, id) on delete restrict
);
create index cloud_edit_operations_project_output on public.cloud_edit_operations (project_id, output_version_id);

create table public.cloud_commit_receipts (
  owner_id uuid not null,
  project_id uuid not null,
  request_key uuid not null,
  digest text not null check (digest ~ '^[0-9a-f]{64}$'),
  input_version_id uuid not null,
  output_version_id uuid not null,
  operation_id uuid not null,
  revision integer not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, project_id, request_key),
  foreign key (project_id, owner_id) references public.cloud_projects(id, owner_id) on delete restrict,
  foreign key (project_id, input_version_id) references public.cloud_project_versions(project_id, id) on delete restrict,
  foreign key (project_id, output_version_id) references public.cloud_project_versions(project_id, id) on delete restrict,
  foreign key (operation_id) references public.cloud_edit_operations(id) on delete restrict
);

alter table public.cloud_edit_assets enable row level security;
alter table public.cloud_edit_operations enable row level security;
alter table public.cloud_commit_receipts enable row level security;
revoke all on public.cloud_edit_assets, public.cloud_edit_operations, public.cloud_commit_receipts from public, anon, authenticated;
grant select, insert, update on public.cloud_edit_assets to service_role;
grant select, insert on public.cloud_edit_operations, public.cloud_commit_receipts to service_role;
grant update (active) on public.cloud_project_versions to service_role;

-- The advisory lock matches P04's quota lock so original and edit reservations cannot race.
create function public.mirai_reserve_cloud_edit_asset(
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
  if original_usage + edit_usage + target_bytes > 104857600 then raise exception 'account storage allowance reached'; end if;
  select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
    into original_usage from public.asset_uploads
      where state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready');
  select coalesce(sum(bytes), 0) into edit_usage from public.cloud_edit_assets;
  if original_usage + edit_usage + target_bytes > 734003200 then raise exception 'global storage allowance reached'; end if;
  insert into public.cloud_edit_assets
    (id, owner_id, project_id, request_key, digest, storage_key, sha256, bytes, width, height)
  values (target_id, target_owner, target_project, target_request_key, target_digest,
    target_owner::text || '/' || target_project::text || '/edits/' || target_id::text || '.png',
    target_sha, target_bytes, target_width, target_height)
  returning * into result;
  return result;
end;
$$;
revoke all on function public.mirai_reserve_cloud_edit_asset(uuid,uuid,uuid,uuid,text,text,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.mirai_reserve_cloud_edit_asset(uuid,uuid,uuid,uuid,text,text,integer,integer,integer) to service_role;

-- Include edit assets in P04's allowance when a new original is reserved.
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
  if original_usage + edit_usage + requested_reserve > 104857600 then raise exception 'account storage allowance reached'; end if;
  select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
    into original_usage from public.asset_uploads
      where state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready');
  select coalesce(sum(bytes), 0) into edit_usage from public.cloud_edit_assets;
  if original_usage + edit_usage + requested_reserve > 734003200 then raise exception 'global storage allowance reached'; end if;
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

create function public.mirai_accept_cloud_edit(
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
  if target_kind not in ('recolor','paint','crop','resize','rotate','flip','text','watermark','transform')
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
    (id, project_id, owner_id, input_version_id, output_version_id, kind,
     parameters, mask_width, mask_height, mask_deflate)
  values (target_operation, target_project, target_owner, target_input, target_output,
    target_kind, target_parameters, target_mask_width, target_mask_height,
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
  return receipt;
end;
$$;
revoke all on function public.mirai_accept_cloud_edit(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,integer,integer,text,boolean) from public, anon, authenticated;
grant execute on function public.mirai_accept_cloud_edit(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,jsonb,integer,integer,text,boolean) to service_role;

create function public.mirai_select_cloud_version(
  target_owner uuid, target_project uuid, target_version uuid
) returns public.cloud_projects
language plpgsql security invoker set search_path = '' as $$
declare project_row public.cloud_projects;
begin
  select * into project_row from public.cloud_projects
    where id = target_project and owner_id = target_owner and status = 'active' for update;
  if not found or not exists (select 1 from public.profiles where id = target_owner and status = 'active') then
    raise exception 'owned active project not found';
  end if;
  if not exists (select 1 from public.cloud_project_versions
      where id = target_version and project_id = target_project and owner_id = target_owner and active) then
    raise exception 'active version not found';
  end if;
  if project_row.current_version_id = target_version then return project_row; end if;
  update public.cloud_projects set current_version_id = target_version,
    revision = revision + 1, updated_at = now()
    where id = target_project and owner_id = target_owner
    returning * into project_row;
  return project_row;
end;
$$;
revoke all on function public.mirai_select_cloud_version(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.mirai_select_cloud_version(uuid,uuid,uuid) to service_role;
