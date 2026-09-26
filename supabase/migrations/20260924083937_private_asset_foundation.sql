-- P04 keeps all asset writes behind authenticated application routes. The
-- service role is the only Data API role allowed to mutate these records.
create type public.mirai_asset_state as enum
  ('reserved', 'uploading', 'uploaded', 'finalizing', 'ready', 'cleaning', 'cancelled', 'expired');

create table public.asset_uploads (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  request_key uuid not null,
  state public.mirai_asset_state not null default 'reserved',
  declared_bytes integer not null check (declared_bytes between 1 and 10485760),
  reserved_bytes integer not null check (reserved_bytes = declared_bytes + 31457280),
  actual_bytes integer check (actual_bytes between 1 and 41943040),
  original_name text not null check (char_length(original_name) between 1 and 180),
  original_mime text not null check (original_mime in ('image/png', 'image/jpeg')),
  source_sha256 text check (source_sha256 ~ '^[0-9a-f]{64}$'),
  base_sha256 text check (base_sha256 ~ '^[0-9a-f]{64}$'),
  source_bytes integer,
  base_bytes integer,
  width integer check (width between 1 and 2048),
  height integer check (height between 1 and 2048),
  staging_key text not null unique,
  source_key text not null unique,
  base_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  staging_deleted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '1 hour'),
  unique (owner_id, request_key),
  check (width is null or height is not null),
  check (height is null or width is not null),
  check (state <> 'ready' or
    (actual_bytes is not null and source_sha256 is not null and base_sha256 is not null
     and source_bytes is not null and base_bytes is not null and width is not null and height is not null))
);

alter table public.asset_uploads enable row level security;
revoke all on public.asset_uploads from public, anon, authenticated;
grant all on public.asset_uploads to service_role;
create index asset_uploads_cleanup on public.asset_uploads (expires_at)
  where state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning');
create index asset_uploads_owner on public.asset_uploads (owner_id, state);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('mirai-asset-staging', 'mirai-asset-staging', false, 10485760, array['image/png', 'image/jpeg']),
  ('mirai-assets', 'mirai-assets', false, 31457280, array['image/png', 'image/jpeg'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No anon/authenticated policies exist on either bucket. Storage operations
-- are performed by the server using its secret key after account checks.

create function public.mirai_reserve_original_upload(
  target_owner uuid, target_id uuid, target_request_key uuid,
  target_name text, target_mime text, target_bytes integer
) returns public.asset_uploads
language plpgsql security invoker set search_path = '' as $$
declare result public.asset_uploads;
declare requested_reserve bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(770041);
  select * into result from public.asset_uploads
    where owner_id = target_owner and request_key = target_request_key;
  if found then
    if result.declared_bytes <> target_bytes or result.original_name <> target_name
      or result.original_mime <> target_mime then
      raise exception 'request key reused with different upload';
    end if;
    return result;
  end if;
  if not exists (select 1 from public.profiles where id = target_owner and status = 'active') then
    raise exception 'account is not eligible';
  end if;
  if target_bytes < 1 or target_bytes > 10485760 then
    raise exception 'upload exceeds byte limit';
  end if;
  requested_reserve := target_bytes::bigint + 31457280;
  if (select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
      from public.asset_uploads where owner_id = target_owner
        and state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready'))
     + requested_reserve > 104857600 then
    raise exception 'account storage allowance reached';
  end if;
  if (select coalesce(sum(case when state = 'ready' then actual_bytes + case when staging_deleted_at is null then declared_bytes else 0 end else reserved_bytes end), 0)
      from public.asset_uploads
      where state in ('reserved', 'uploading', 'uploaded', 'finalizing', 'cleaning', 'ready'))
     + requested_reserve > 734003200 then
    raise exception 'global storage allowance reached';
  end if;
  insert into public.asset_uploads
    (id, owner_id, request_key, original_name, original_mime, declared_bytes,
     reserved_bytes, staging_key, source_key, base_key)
  values
    (target_id, target_owner, target_request_key, target_name, target_mime,
     target_bytes, requested_reserve,
     target_owner::text || '/' || target_id::text || '/source',
     target_owner::text || '/' || target_id::text || '/original',
     target_owner::text || '/' || target_id::text || '/base.png')
  returning * into result;
  return result;
end;
$$;

revoke all on function public.mirai_reserve_original_upload(uuid, uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.mirai_reserve_original_upload(uuid, uuid, uuid, text, text, integer) to service_role;

create function public.mirai_finish_original_upload(
  target_id uuid, target_owner uuid, target_source_sha text, target_base_sha text,
  target_source_bytes integer, target_base_bytes integer,
  target_width integer, target_height integer
) returns public.asset_uploads
language plpgsql security invoker set search_path = '' as $$
declare result public.asset_uploads;
begin
  perform pg_catalog.pg_advisory_xact_lock(770041);
  select * into result from public.asset_uploads
    where id = target_id and owner_id = target_owner for update;
  if not found then raise exception 'upload not found'; end if;
  if result.state = 'ready' then
    if result.source_sha256 <> target_source_sha or result.base_sha256 <> target_base_sha then
      raise exception 'finalized upload differs';
    end if;
    return result;
  end if;
  if result.state <> 'finalizing' then raise exception 'upload not finalizing'; end if;
  if target_source_bytes <> result.declared_bytes or target_base_bytes < 1
    or target_base_bytes > 31457280 or target_width < 1 or target_height < 1
    or target_width > 2048 or target_height > 2048
    or target_width::bigint * target_height > 4194304 then
    raise exception 'final image outside allowed envelope';
  end if;
  update public.asset_uploads set state = 'ready',
    actual_bytes = target_source_bytes + target_base_bytes,
    source_sha256 = target_source_sha, base_sha256 = target_base_sha,
    source_bytes = target_source_bytes, base_bytes = target_base_bytes,
    width = target_width, height = target_height, updated_at = now()
    where id = target_id returning * into result;
  return result;
end;
$$;

revoke all on function public.mirai_finish_original_upload(uuid, uuid, text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.mirai_finish_original_upload(uuid, uuid, text, text, integer, integer, integer, integer) to service_role;
