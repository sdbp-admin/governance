-- Acknowledging an operational prompt must not resolve its canonical source.
-- Snoozes are a personal, temporary presentation state only.
begin;

create table public.operational_attention_snoozes (
  recipient_id uuid not null references public.people(id) on delete cascade,
  attention_kind text not null,
  source_id uuid not null,
  snoozed_until timestamptz not null,
  primary key (recipient_id, attention_kind, source_id)
);

create index operational_attention_snoozes_recipient_until
  on public.operational_attention_snoozes(recipient_id, snoozed_until);

alter table public.operational_attention_snoozes enable row level security;

grant select on public.operational_attention_snoozes to authenticated;
revoke insert, update, delete on public.operational_attention_snoozes from authenticated;

create policy "members read their operational attention snoozes"
on public.operational_attention_snoozes
for select
to authenticated
using (
  public.is_board_member()
  and recipient_id = (
    select p.id
    from public.people p
    where p.auth_user_id = auth.uid()
    limit 1
  )
);

create or replace function public.snooze_operational_attention(
  target_kind text,
  target_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();
  if v_actor is null then
    raise exception 'No active member profile found.';
  end if;
  if nullif(trim(target_kind), '') is null or target_source_id is null then
    raise exception 'Attention kind and source are required.';
  end if;

  insert into public.operational_attention_snoozes (
    recipient_id,
    attention_kind,
    source_id,
    snoozed_until
  ) values (
    v_actor,
    trim(target_kind),
    target_source_id,
    now() + interval '24 hours'
  )
  on conflict (recipient_id, attention_kind, source_id)
  do update set snoozed_until = excluded.snoozed_until;
end;
$$;

revoke all on function public.snooze_operational_attention(text, uuid) from public;
grant execute on function public.snooze_operational_attention(text, uuid) to authenticated;

commit;
