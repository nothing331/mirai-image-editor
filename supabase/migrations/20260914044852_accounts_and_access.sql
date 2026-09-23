create schema if not exists mirai_private;

revoke all on schema mirai_private from public, anon, authenticated;

create type public.mirai_account_status as enum ('pending', 'active', 'revoked');
create type public.mirai_account_role as enum ('member', 'owner');
create type public.mirai_access_status as enum ('pending', 'approved', 'rejected', 'revoked');
create type public.mirai_invitation_status as enum ('pending', 'claimed', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  display_name text not null check (char_length(display_name) between 1 and 80),
  status public.mirai_account_status not null default 'pending',
  account_role public.mirai_account_role not null default 'member',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null unique references public.profiles (id) on delete cascade,
  status public.mirai_access_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending' and decided_at is null and decided_by is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  token_hash bytea not null unique,
  status public.mirai_invitation_status not null default 'pending',
  invited_by uuid not null references public.profiles (id) on delete restrict,
  claimed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (status = 'claimed' and claimed_by is not null and claimed_at is not null)
    or (status <> 'claimed' and claimed_by is null and claimed_at is null)
  )
);

create table public.account_allowance_grants (
  account_id uuid not null references public.profiles (id) on delete cascade,
  allowance_key text not null check (allowance_key = 'initial-ai-images'),
  granted_quantity integer not null check (granted_quantity = 5),
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles (id) on delete set null,
  primary key (account_id, allowance_key)
);

create table public.access_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  subject_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('owner_bootstrapped', 'access_requested', 'access_approved', 'access_rejected', 'access_revoked', 'invitation_created', 'invitation_claimed')),
  invitation_id uuid references public.invitations (id) on delete set null,
  access_request_id uuid references public.access_requests (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;
alter table public.invitations enable row level security;
alter table public.account_allowance_grants enable row level security;
alter table public.access_audit_log enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.access_requests from anon, authenticated;
revoke all on table public.invitations from anon, authenticated;
revoke all on table public.account_allowance_grants from anon, authenticated;
revoke all on table public.access_audit_log from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name, onboarding_completed_at) on table public.profiles to authenticated;
grant select on table public.access_requests to authenticated;
grant select on table public.invitations to authenticated;
grant select on table public.account_allowance_grants to authenticated;
grant select on table public.access_audit_log to authenticated;

create function mirai_private.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and account_role = 'owner'
      and status = 'active'
  );
$$;

revoke all on function mirai_private.is_owner() from public;
grant execute on function mirai_private.is_owner() to authenticated;

create policy "accounts can read their profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id or mirai_private.is_owner());

create policy "accounts can update safe profile fields"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "accounts can read their access request"
on public.access_requests for select
to authenticated
using ((select auth.uid()) = requester_id or mirai_private.is_owner());

create policy "owners can read invitations"
on public.invitations for select
to authenticated
using (mirai_private.is_owner());

create policy "accounts can read their allowance grant"
on public.account_allowance_grants for select
to authenticated
using ((select auth.uid()) = account_id or mirai_private.is_owner());

create policy "owners can read access audit entries"
on public.access_audit_log for select
to authenticated
using (mirai_private.is_owner());

create function mirai_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  proposed_name text;
begin
  proposed_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');

  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    lower(btrim(new.email)),
    left(coalesce(proposed_name, split_part(new.email, '@', 1)), 80)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function mirai_private.handle_new_user() from public;

create trigger mirai_create_profile_after_signup
after insert on auth.users
for each row execute function mirai_private.handle_new_user();

create function public.mirai_request_access()
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := (select auth.uid());
  account_status public.mirai_account_status;
  result public.access_requests;
begin
  if account_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select status into account_status from public.profiles where id = account_id;
  if account_status is null then
    raise exception 'profile is unavailable' using errcode = 'P0002';
  end if;
  if account_status = 'revoked' then
    raise exception 'account is revoked' using errcode = '42501';
  end if;
  if account_status = 'active' then
    raise exception 'account is already active' using errcode = '22023';
  end if;

  insert into public.access_requests (requester_id)
  values (account_id)
  on conflict (requester_id) do update
  set status = case when public.access_requests.status = 'rejected' then 'pending'::public.mirai_access_status else public.access_requests.status end,
      requested_at = case when public.access_requests.status = 'rejected' then now() else public.access_requests.requested_at end,
      decided_at = case when public.access_requests.status = 'rejected' then null else public.access_requests.decided_at end,
      decided_by = case when public.access_requests.status = 'rejected' then null else public.access_requests.decided_by end,
      updated_at = now()
  returning * into result;

  if result.status = 'pending' then
    insert into public.access_audit_log (actor_id, subject_id, action, access_request_id)
    select account_id, account_id, 'access_requested', result.id
    where not exists (
      select 1 from public.access_audit_log
      where action = 'access_requested'
        and access_request_id = result.id
        and created_at >= result.requested_at
    );
  end if;

  return result;
end;
$$;

create function public.mirai_decide_access(request_id uuid, decision text)
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
    values (request_record.requester_id, 'initial-ai-images', 5, actor)
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

create function public.mirai_revoke_access(target_account_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  result public.profiles;
begin
  if actor is null or not mirai_private.is_owner() then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if target_account_id = actor then
    raise exception 'owner cannot revoke their own access' using errcode = '22023';
  end if;

  update public.profiles
  set status = 'revoked', updated_at = now()
  where id = target_account_id and account_role = 'member'
  returning * into result;

  if result.id is null then
    raise exception 'account not found or cannot be revoked' using errcode = 'P0002';
  end if;

  update public.access_requests
  set status = 'revoked', decided_at = coalesce(decided_at, now()), decided_by = coalesce(decided_by, actor), updated_at = now()
  where requester_id = target_account_id;

  insert into public.access_audit_log (actor_id, subject_id, action)
  values (actor, target_account_id, 'access_revoked');

  return result;
end;
$$;

create function public.mirai_create_invitation(invited_email text)
returns table (invitation_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  normalized_email text := lower(btrim(invited_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  result public.invitations;
begin
  if actor is null or not mirai_private.is_owner() then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or char_length(normalized_email) > 320 then
    raise exception 'valid invitation email required' using errcode = '22023';
  end if;

  insert into public.invitations (email, token_hash, invited_by, expires_at)
  values (normalized_email, extensions.digest(raw_token, 'sha256'), actor, now() + interval '14 days')
  on conflict (email) do update
  set token_hash = excluded.token_hash,
      status = 'pending',
      invited_by = actor,
      claimed_by = null,
      claimed_at = null,
      created_at = now(),
      expires_at = now() + interval '14 days',
      updated_at = now()
  returning * into result;

  insert into public.access_audit_log (actor_id, subject_id, action, invitation_id)
  values (
    actor,
    (select id from public.profiles where email = normalized_email),
    'invitation_created',
    result.id
  );

  return query select result.id, raw_token, result.expires_at;
end;
$$;

create function public.mirai_claim_invitation(invite_token text)
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
  values (current_account_id, 'initial-ai-images', 5, invitation_record.invited_by)
  on conflict (account_id, allowance_key) do nothing;

  update public.access_requests
  set status = 'approved', decided_at = coalesce(decided_at, now()), decided_by = coalesce(decided_by, invitation_record.invited_by), updated_at = now()
  where requester_id = current_account_id and status <> 'approved';

  insert into public.access_audit_log (actor_id, subject_id, action, invitation_id)
  values (current_account_id, current_account_id, 'invitation_claimed', invitation_record.id);

  return result;
end;
$$;

create function public.mirai_bootstrap_owner(target_account_id uuid)
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
  values (target_account_id, 'initial-ai-images', 5, target_account_id)
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

revoke all on function public.mirai_request_access() from public, anon;
revoke all on function public.mirai_decide_access(uuid, text) from public, anon;
revoke all on function public.mirai_revoke_access(uuid) from public, anon;
revoke all on function public.mirai_create_invitation(text) from public, anon;
revoke all on function public.mirai_claim_invitation(text) from public, anon;
revoke all on function public.mirai_bootstrap_owner(uuid) from public, anon, authenticated;

grant execute on function public.mirai_request_access() to authenticated;
grant execute on function public.mirai_decide_access(uuid, text) to authenticated;
grant execute on function public.mirai_revoke_access(uuid) to authenticated;
grant execute on function public.mirai_create_invitation(text) to authenticated;
grant execute on function public.mirai_claim_invitation(text) to authenticated;
grant execute on function public.mirai_bootstrap_owner(uuid) to service_role;
