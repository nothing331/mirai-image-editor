create table public.cloud_spike_ownership_probes (
  id uuid primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  created_at timestamptz not null default now()
);

alter table public.cloud_spike_ownership_probes enable row level security;

revoke all on table public.cloud_spike_ownership_probes from anon;
revoke all on table public.cloud_spike_ownership_probes from authenticated;
grant select, insert, delete on table public.cloud_spike_ownership_probes to authenticated;

create policy "cloud spike owners can insert probes"
on public.cloud_spike_ownership_probes
for insert
to authenticated
with check ((select auth.uid()) = owner_id);

create policy "cloud spike owners can read probes"
on public.cloud_spike_ownership_probes
for select
to authenticated
using ((select auth.uid()) = owner_id);

create policy "cloud spike owners can delete probes"
on public.cloud_spike_ownership_probes
for delete
to authenticated
using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mirai-cloud-spike',
  'mirai-cloud-spike',
  false,
  10485760,
  array['image/png', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "cloud spike owners can upload immutable objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mirai-cloud-spike'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "cloud spike owners can read objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'mirai-cloud-spike'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "cloud spike owners can delete objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'mirai-cloud-spike'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
