-- SDBP Workspace: conversation participants are durable workflow data.
--
-- A tension's "real conversation" participants must not depend on attention signals.
-- Attention signals are notifications and may be acknowledged; acknowledging a
-- notification must never make a conversation poll impossible to create or edit.

create table if not exists public.tension_conversation_participants (
  tension_id uuid not null references public.tensions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tension_id, person_id)
);

create index if not exists tension_conversation_participants_person
  on public.tension_conversation_participants(person_id, tension_id);

alter table public.tension_conversation_participants enable row level security;

grant select on public.tension_conversation_participants to authenticated;
revoke insert, update, delete on public.tension_conversation_participants from authenticated;

drop policy if exists "board members read tension conversation participants"
  on public.tension_conversation_participants;
create policy "board members read tension conversation participants"
on public.tension_conversation_participants
for select
to authenticated
using (public.is_board_member());

-- Recover the best durable participant data we already have.
-- Existing polls are authoritative for their participants. For conversations that
-- do not yet have a poll, current unacknowledged need signals are the best legacy
-- representation available.
insert into public.tension_conversation_participants (tension_id, person_id)
select p.tension_id, pp.person_id
from public.tension_polls p
join public.tension_poll_participants pp on pp.poll_id = p.id
join public.tensions t on t.id = p.tension_id
where pp.person_id <> t.raiser_id
on conflict do nothing;

insert into public.tension_conversation_participants (tension_id, person_id)
select distinct s.tension_id, s.recipient_id
from public.attention_signals s
join public.tensions t on t.id = s.tension_id
where s.tension_id is not null
  and t.status = 'needs_sync'
  and s.signal_type = 'tension_need'
  and s.acknowledged_at is null
  and s.recipient_id <> t.raiser_id
on conflict do nothing;

-- Record what the tension holder needs. Conversation participants are now stored
-- independently of the notification rows created for those people.
create or replace function public.set_tension_need(
  target_tension_id uuid,
  need_kind text,
  recipient_ids uuid[],
  detail text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_raiser uuid;
  v_names text;
  v_note text;
  v_status text;
  v_poll_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if need_kind not in ('input', 'sync') then raise exception 'Unknown tension need.'; end if;

  v_actor := public.activity_actor_id();
  select t.raiser_id into v_raiser
  from public.tensions t
  where t.id = target_tension_id
  for update;

  if not found then raise exception 'Tension not found.'; end if;
  if v_actor is distinct from v_raiser then
    raise exception 'Only the person who raised the tension can define what they need.';
  end if;

  select string_agg(p.name, ', ' order by p.name) into v_names
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  if v_names is null then raise exception 'Choose at least one active person.'; end if;

  if need_kind = 'input' then
    v_status := 'open';
    v_note := 'Needs input or help from ' || v_names;
  else
    v_status := 'needs_sync';
    v_note := 'Needs a real conversation with ' || v_names;
  end if;

  if nullif(trim(coalesce(detail, '')), '') is not null then
    v_note := v_note || ' — ' || trim(detail);
  else
    v_note := v_note || '.';
  end if;

  -- Notifications are refreshed independently from the durable participant list.
  update public.attention_signals
  set acknowledged_at = now()
  where tension_id = target_tension_id
    and signal_type = 'tension_need'
    and acknowledged_at is null;

  delete from public.tension_conversation_participants
  where tension_id = target_tension_id;

  if need_kind = 'sync' then
    insert into public.tension_conversation_participants (tension_id, person_id)
    select target_tension_id, p.id
    from public.people p
    where p.active = true
      and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
      and p.id <> v_actor
    on conflict do nothing;
  end if;

  update public.tensions
  set status = v_status,
      resolution_proposed_by = null,
      latest_note = v_note,
      resolved_at = null
  where id = target_tension_id;

  insert into public.attention_signals (
    recipient_id, tension_id, project_id, signal_type, message, created_by
  )
  select p.id, target_tension_id, null, 'tension_need', v_note, v_actor
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  select p.id into v_poll_id
  from public.tension_polls p
  where p.tension_id = target_tension_id;

  if v_poll_id is not null then
    if need_kind <> 'sync' then
      delete from public.tension_polls where id = v_poll_id;
    else
      delete from public.tension_poll_votes v
      where v.poll_id = v_poll_id
        and v.person_id <> v_raiser
        and not exists (
          select 1
          from public.tension_conversation_participants cp
          where cp.tension_id = target_tension_id
            and cp.person_id = v.person_id
        );

      delete from public.tension_poll_participants pp
      where pp.poll_id = v_poll_id
        and pp.person_id <> v_raiser
        and not exists (
          select 1
          from public.tension_conversation_participants cp
          where cp.tension_id = target_tension_id
            and cp.person_id = pp.person_id
        );

      insert into public.tension_poll_participants (poll_id, person_id)
      select v_poll_id, cp.person_id
      from public.tension_conversation_participants cp
      where cp.tension_id = target_tension_id
      on conflict do nothing;
    end if;
  end if;
end;
$$;

revoke all on function public.set_tension_need(uuid, text, uuid[], text) from public;
grant execute on function public.set_tension_need(uuid, text, uuid[], text) to authenticated;

-- Poll creation now reads the durable conversation-participant list. A participant
-- opening or acknowledging a notification no longer affects poll creation.
create or replace function public.create_tension_poll(
  target_tension_id uuid,
  option_times timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_raiser uuid;
  v_status text;
  v_poll_id uuid;
  v_times timestamptz[];
  v_participant_count integer;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();

  select t.raiser_id, t.status into v_raiser, v_status
  from public.tensions t
  where t.id = target_tension_id
  for update;

  if not found then raise exception 'Tension not found.'; end if;
  if v_actor is distinct from v_raiser then
    raise exception 'Only the tension holder can propose meeting times.';
  end if;
  if v_status <> 'needs_sync' then
    raise exception 'This tension is not waiting for a real conversation.';
  end if;

  select array_agg(x order by x) into v_times
  from (
    select distinct x
    from unnest(coalesce(option_times, '{}'::timestamptz[])) x
    where x > now()
  ) q;

  if coalesce(cardinality(v_times), 0) < 2 or cardinality(v_times) > 6 then
    raise exception 'Choose between 2 and 6 future times.';
  end if;

  select 1 + count(*) into v_participant_count
  from public.tension_conversation_participants cp
  join public.people p on p.id = cp.person_id and p.active = true
  where cp.tension_id = target_tension_id
    and cp.person_id <> v_raiser;

  if v_participant_count < 2 then
    raise exception 'Choose at least one other person for this conversation before creating a poll.';
  end if;

  delete from public.tension_polls
  where tension_id = target_tension_id;

  insert into public.tension_polls (tension_id, created_by)
  values (target_tension_id, v_actor)
  returning id into v_poll_id;

  insert into public.tension_poll_participants (poll_id, person_id)
  values (v_poll_id, v_raiser);

  insert into public.tension_poll_participants (poll_id, person_id)
  select v_poll_id, cp.person_id
  from public.tension_conversation_participants cp
  join public.people p on p.id = cp.person_id and p.active = true
  where cp.tension_id = target_tension_id
    and cp.person_id <> v_raiser
  on conflict do nothing;

  insert into public.tension_poll_options (poll_id, starts_at)
  select v_poll_id, x
  from unnest(v_times) x;

  return v_poll_id;
end;
$$;

revoke all on function public.create_tension_poll(uuid, timestamptz[]) from public;
grant execute on function public.create_tension_poll(uuid, timestamptz[]) to authenticated;
