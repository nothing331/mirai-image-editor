create table public.access_email_deliveries (
  event_key text primary key,
  kind text not null check (kind in ('approval', 'invitation')),
  request_id uuid references public.access_requests(id) on delete cascade,
  invitation_id uuid references public.invitations(id) on delete cascade,
  status text not null check (status in ('sending', 'sent', 'failed', 'unknown')),
  content_digest text not null check (content_digest ~ '^[a-f0-9]{64}$'),
  delivery_id uuid not null default gen_random_uuid(),
  attempt_id uuid not null,
  first_attempt_at timestamptz not null default now(),
  lease_until timestamptz not null,
  provider_id text,
  updated_at timestamptz not null default now(),
  check ((kind = 'approval' and request_id is not null and invitation_id is null)
    or (kind = 'invitation' and invitation_id is not null and request_id is null))
);

alter table public.access_email_deliveries enable row level security;
revoke all on public.access_email_deliveries from public, anon, authenticated;
grant select on public.access_email_deliveries to authenticated;
grant all on public.access_email_deliveries to service_role;
create policy "owners read access email receipts" on public.access_email_deliveries
for select to authenticated using (mirai_private.is_owner());

-- Claims validate the current account/invitation and serialize sends without storing mail or raw tokens.
create function public.mirai_begin_access_email(
  email_kind text, reference_id uuid, expected_email text, message_digest text, invitation_token text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_email text;
  event text;
  receipt public.access_email_deliveries;
  executor uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null or not mirai_private.is_owner() then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if message_digest is null or message_digest !~ '^[a-f0-9]{64}$' then
    raise exception 'valid message digest required' using errcode = '22023';
  end if;
  if email_kind = 'approval' then
    select p.email into target_email from public.access_requests r
    join public.profiles p on p.id = r.requester_id
    where r.id = reference_id and r.status = 'approved' and p.status = 'active';
    event := 'approval/' || reference_id::text;
  elsif email_kind = 'invitation' then
    if invitation_token is null or invitation_token !~ '^[a-f0-9]{64}$' then
      raise exception 'valid invitation required' using errcode = '22023';
    end if;
    select i.email into target_email from public.invitations i
    where i.id = reference_id and i.status = 'pending' and i.expires_at > now()
      and i.token_hash = extensions.digest(invitation_token, 'sha256');
    event := 'invitation/' || reference_id::text || '/' || encode(extensions.digest(invitation_token, 'sha256'), 'hex');
  else
    raise exception 'valid email kind required' using errcode = '22023';
  end if;
  if target_email is null or target_email is distinct from expected_email then
    raise exception 'email target is unavailable' using errcode = '42501';
  end if;

  insert into public.access_email_deliveries(event_key, kind, request_id, invitation_id,
    status, content_digest, attempt_id, lease_until)
  values(event, email_kind, case when email_kind = 'approval' then reference_id end,
    case when email_kind = 'invitation' then reference_id end, 'sending', message_digest, executor, now() + interval '2 minutes')
  on conflict (event_key) do nothing;
  select * into receipt from public.access_email_deliveries where event_key = event for update;
  if receipt.status = 'sent' then return jsonb_build_object('status', 'sent'); end if;
  if receipt.attempt_id <> executor then
    if receipt.status = 'sending' and receipt.lease_until > now() then
      return jsonb_build_object('status', 'busy');
    end if;
    -- Resend retains idempotency for 24h. Leave uncertain old sends for operator reconciliation.
    if receipt.status in ('sending', 'unknown') and
      (receipt.first_attempt_at < now() - interval '23 hours' or receipt.content_digest <> message_digest) then
      return jsonb_build_object('status', 'unknown');
    end if;
    if receipt.status = 'failed' and
      (receipt.content_digest <> message_digest or receipt.first_attempt_at < now() - interval '23 hours') then
      update public.access_email_deliveries set delivery_id = gen_random_uuid(), first_attempt_at = now()
      where event_key = event;
    end if;
    update public.access_email_deliveries set status = 'sending', attempt_id = executor,
      content_digest = message_digest, lease_until = now() + interval '2 minutes', updated_at = now()
    where event_key = event returning * into receipt;
  end if;
  return jsonb_build_object('status', 'send', 'event_key', event, 'delivery_id', receipt.delivery_id, 'attempt_id', executor);
end;
$$;

create function public.mirai_finish_access_email(
  email_event text, executor_id uuid, outcome text, provider_reference text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or not mirai_private.is_owner() then
    raise exception 'owner access required' using errcode = '42501';
  end if;
  if outcome is null or outcome not in ('sent', 'failed', 'unknown') or
    (outcome = 'sent' and (provider_reference is null or char_length(provider_reference) > 200)) then
    raise exception 'valid delivery outcome required' using errcode = '22023';
  end if;
  update public.access_email_deliveries set status = outcome, provider_id = provider_reference, updated_at = now()
  where event_key = email_event and attempt_id = executor_id and status = 'sending';
  if not found then raise exception 'email attempt is no longer current' using errcode = '40001'; end if;
end;
$$;

revoke all on function public.mirai_begin_access_email(text, uuid, text, text, text),
  public.mirai_finish_access_email(text, uuid, text, text) from public, anon;
grant execute on function public.mirai_begin_access_email(text, uuid, text, text, text),
  public.mirai_finish_access_email(text, uuid, text, text) to authenticated;
