-- SDBP Governance v1 records memory
-- Keep meeting follow-up review lightweight: the uploaded minutes remain the record,
-- while explicit follow-up candidates are stored as a small JSON projection on it.

alter table public.records
  add column if not exists participants text[] not null default '{}',
  add column if not exists followups jsonb not null default '[]'::jsonb;

alter table public.records
  drop constraint if exists records_followups_is_array;

alter table public.records
  add constraint records_followups_is_array
  check (jsonb_typeof(followups) = 'array');

-- Files live in a private Supabase Storage bucket named `sdbp-records`.
-- The bucket itself is created through the Storage API / Dashboard; Storage metadata
-- should not be manipulated directly with SQL. These policies can exist before the
-- bucket is created and enforce the same active-board-member boundary as app data.

drop policy if exists "board members read records files" on storage.objects;
drop policy if exists "board members upload records files" on storage.objects;
drop policy if exists "board members update records files" on storage.objects;
drop policy if exists "board members delete records files" on storage.objects;

create policy "board members read records files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'sdbp-records'
  and public.is_board_member()
);

create policy "board members upload records files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'sdbp-records'
  and public.is_board_member()
);

create policy "board members update records files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'sdbp-records'
  and public.is_board_member()
)
with check (
  bucket_id = 'sdbp-records'
  and public.is_board_member()
);

create policy "board members delete records files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'sdbp-records'
  and public.is_board_member()
);
