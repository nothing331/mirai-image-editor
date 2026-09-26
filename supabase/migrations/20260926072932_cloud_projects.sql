-- P05 stores an owned project and its initial immutable version together.
alter table public.asset_uploads add constraint asset_uploads_owner_id_id_unique unique (owner_id, id);

create table public.cloud_projects (
  id uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  status text not null default 'active' check (status = 'active'),
  original_upload_id uuid not null unique,
  current_version_id uuid not null,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id),
  foreign key (owner_id, original_upload_id)
    references public.asset_uploads(owner_id, id) on delete restrict
);

create table public.cloud_project_versions (
  id uuid primary key,
  project_id uuid not null,
  owner_id uuid not null,
  upload_id uuid not null,
  parent_version_id uuid,
  kind text not null check (kind = 'original'),
  width integer not null check (width between 1 and 2048),
  height integer not null check (height between 1 and 2048),
  created_at timestamptz not null default now(),
  unique (project_id, id),
  foreign key (project_id, owner_id)
    references public.cloud_projects(id, owner_id) on delete restrict,
  foreign key (owner_id, upload_id)
    references public.asset_uploads(owner_id, id) on delete restrict,
  foreign key (project_id, parent_version_id)
    references public.cloud_project_versions(project_id, id) on delete restrict,
  check (parent_version_id is null)
);

alter table public.cloud_projects
  add constraint cloud_projects_current_version_fk
  foreign key (id, current_version_id)
  references public.cloud_project_versions(project_id, id)
  deferrable initially deferred;

create index cloud_projects_owner_recent on public.cloud_projects (owner_id, created_at desc, id);
create index cloud_project_versions_project_created on public.cloud_project_versions (project_id, created_at, id);
create index cloud_project_versions_upload on public.cloud_project_versions (owner_id, upload_id);

alter table public.cloud_projects enable row level security;
alter table public.cloud_project_versions enable row level security;
revoke all on public.cloud_projects, public.cloud_project_versions from public, anon, authenticated;
revoke all on public.cloud_project_versions from service_role;
grant all on public.cloud_projects to service_role;
grant select, insert on public.cloud_project_versions to service_role;

create function public.mirai_create_cloud_project(
  target_owner uuid, target_id uuid, target_version_id uuid,
  target_upload_id uuid, target_name text
) returns public.cloud_projects
language plpgsql security invoker set search_path = '' as $$
declare result public.cloud_projects;
declare ready_upload public.asset_uploads;
begin
  -- The profile row serializes competing project creations for this account.
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
    or btrim(target_name) <> target_name then
    raise exception 'invalid project name';
  end if;

  insert into public.cloud_projects (id, owner_id, name, original_upload_id, current_version_id)
  values (target_id, target_owner, target_name, target_upload_id, target_version_id)
  returning * into result;
  insert into public.cloud_project_versions
    (id, project_id, owner_id, upload_id, parent_version_id, kind, width, height)
  values
    (target_version_id, target_id, target_owner, target_upload_id, null,
     'original', ready_upload.width, ready_upload.height);
  return result;
end;
$$;

revoke all on function public.mirai_create_cloud_project(uuid, uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mirai_create_cloud_project(uuid, uuid, uuid, uuid, text)
  to service_role;
