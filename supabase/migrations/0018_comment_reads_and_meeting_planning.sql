-- SDBP Workspace: lightweight comment read state and board meeting planning.
--
-- Comment threads remain simple project/tension context. This migration adds only
-- enough per-person state to show a comment count and what is new since that
-- person last opened the thread.
--
-- Meeting planning is a reusable availability poll for Governance and Strategic
-- meetings. It does not create calendar events or change governance itself.

create table if not exists public.comment_thread_reads (
  person_id uuid not null references public.people(id) on delete cascade,
  thread_type text not null check (thread_type in ('project', 'tension')),
  thread_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (person_id, thread_type, thread_id)
);

alter table public.comment_thread_reads enable row level security;
revoke all on public.comment_thread_reads from authenticated;

create or replace function public.load_comment_thread_summary(
  target_thread_type text,
  target_thread_id uuid
)
returns table (
  total_count bigint,
  unread_count bigint,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_seen timestamptz;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  if target_thread_type not in ('project', 'tension') then
    raise exception 'Unknown comment thread type.';
  end if;

  v_actor := public.activity_actor_id();

  select r.last_seen_at into v_seen
  from public.comment_thread_reads r
  where r.person_id = v_actor
    and r.thread_type = target_thread_type
    and r.thread_id = target_thread_id;

  if target_thread_type = 'project' then
    if not exists (select 1 from public.projects p where p.id = target_thread_id) then
      raise exception 'Project not found.';
    end if;

    return query
      select
        count(*)::bigint,
        count(*) filter (
          where c.author_id <> v_actor
            and (v_seen is null or c.created_at > v_seen)
        )::bigint,
        v_seen
      from public.project_comments c
      where c.project_id = target_thread_id;
  else
    if not exists (select 1 from public.tensions t where t.id = target_thread_id) then
      raise exception 'Tension not found.';
    end if;

    return query
      select
        count(*)::bigint,
        count(*) filter (
          where c.author_id <> v_actor
            and (v_seen is null or c.created_at > v_seen)
        )::bigint,
        v_seen
      from public.tension_comments c
      where c.tension_id = target_thread_id;
  end if;
end;
$$;

revoke all on function public.load_comment_thread_summary(text, uuid) from public;
grant execute on function public.load_comment_thread_summary(text, uuid) to authenticated;

create or replace function public.mark_comment_thread_seen(
  target_thread_type text,
  target_thread_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_seen timestamptz := now();
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  if target_thread_type not in ('project', 'tension') then
    raise exception 'Unknown comment thread type.';
  end if;

  if target_thread_type = 'project' and not exists (
    select 1 from public.projects p where p.id = target_thread_id
  ) then
    raise exception 'Project not found.';
  end if;

  if target_thread_type = 'tension' and not exists (
    select 1 from public.tensions t where t.id = target_thread_id
  ) then
    raise exception 'Tension not found.';
  end if;

  v_actor := public.activity_actor_id();

  insert into public.comment_thread_reads (person_id, thread_type, thread_id, last_seen_at)
  values (v_actor, target_thread_type, target_thread_id, v_seen)
  on conflict (person_id, thread_type, thread_id)
  do update set last_seen_at = excluded.last_seen_at;

  return v_seen;
end;
$$;

revoke all on function public.mark_comment_thread_seen(text, uuid) from public;
grant execute on function public.mark_comment_thread_seen(text, uuid) to authenticated;

-- Reusable availability polls for board-level meetings.
create table if not exists public.meeting_polls (
  id uuid primary key default gen_random_uuid(),
  meeting_type text not null check (meeting_type in ('governance', 'strategic')),
  title text not null,
  created_by uuid not null references public.people(id) on delete restrict,
  chosen_option_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.meeting_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.meeting_polls(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (poll_id, starts_at)
);

create table if not exists public.meeting_poll_participants (
  poll_id uuid not null references public.meeting_polls(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (poll_id, person_id)
);

create table if not exists public.meeting_poll_votes (
  poll_id uuid not null references public.meeting_polls(id) on delete cascade,
  option_id uuid not null references public.meeting_poll_options(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  available boolean not null,
  updated_at timestamptz not null default now(),
  primary key (poll_id, option_id, person_id)
);

create index if not exists meeting_poll_options_poll
  on public.meeting_poll_options(poll_id, starts_at);
create index if not exists meeting_poll_votes_poll
  on public.meeting_poll_votes(poll_id, option_id);
create index if not exists meeting_polls_open
  on public.meeting_polls(meeting_type, created_at desc)
  where closed_at is null;

alter table public.meeting_polls enable row level security;
alter table public.meeting_poll_options enable row level security;
alter table public.meeting_poll_participants enable row level security;
alter table public.meeting_poll_votes enable row level security;

grant select on public.meeting_polls to authenticated;
grant select on public.meeting_poll_options to authenticated;
grant select on public.meeting_poll_participants to authenticated;
grant select on public.meeting_poll_votes to authenticated;
revoke insert, update, delete on public.meeting_polls from authenticated;
revoke insert, update, delete on public.meeting_poll_options from authenticated;
revoke insert, update, delete on public.meeting_poll_participants from authenticated;
revoke insert, update, delete on public.meeting_poll_votes from authenticated;

drop policy if exists "board members read meeting polls" on public.meeting_polls;
create policy "board members read meeting polls"
on public.meeting_polls for select to authenticated
using (public.is_board_member());

drop policy if exists "board members read meeting poll options" on public.meeting_poll_options;
create policy "board members read meeting poll options"
on public.meeting_poll_options for select to authenticated
using (public.is_board_member());

drop policy if exists "board members read meeting poll participants" on public.meeting_poll_participants;
create policy "board members read meeting poll participants"
on public.meeting_poll_participants for select to authenticated
using (public.is_board_member());

drop policy if exists "board members read meeting poll votes" on public.meeting_poll_votes;
create policy "board members read meeting poll votes"
on public.meeting_poll_votes for select to authenticated
using (public.is_board_member());

create or replace function public.create_meeting_poll(
  poll_meeting_type text,
  poll_title text,
  participant_ids uuid[],
  option_times timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_type text;
  v_title text;
  v_people uuid[];
  v_times timestamptz[];
  v_poll_id uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();
  v_type := lower(trim(coalesce(poll_meeting_type, '')));
  if v_type not in ('governance', 'strategic') then
    raise exception 'Meeting type must be governance or strategic.';
  end if;

  v_title := nullif(trim(coalesce(poll_title, '')), '');
  if v_title is null then
    v_title := case when v_type = 'governance' then 'Governance meeting' else 'Strategic meeting' end;
  end if;

  select array_agg(p.id order by p.name)
    into v_people
  from public.people p
  where p.active = true
    and p.id = any(coalesce(participant_ids, '{}'::uuid[]));

  if not (v_actor = any(coalesce(v_people, '{}'::uuid[]))) then
    v_people := array_append(coalesce(v_people, '{}'::uuid[]), v_actor);
  end if;

  if coalesce(cardinality(v_people), 0) < 2 then
    raise exception 'Choose at least two participants.';
  end if;

  select array_agg(x order by x)
    into v_times
  from (
    select distinct x
    from unnest(coalesce(option_times, '{}'::timestamptz[])) x
    where x > now()
  ) q;

  if coalesce(cardinality(v_times), 0) < 2 or cardinality(v_times) > 6 then
    raise exception 'Choose between 2 and 6 future times.';
  end if;

  -- Keep planning lean: one unresolved poll per meeting type. Creating a new one
  -- closes an abandoned unresolved poll of the same type.
  update public.meeting_polls
  set closed_at = now(), updated_at = now()
  where meeting_type = v_type
    and closed_at is null
    and chosen_option_id is null;

  insert into public.meeting_polls (meeting_type, title, created_by)
  values (v_type, v_title, v_actor)
  returning id into v_poll_id;

  insert into public.meeting_poll_participants (poll_id, person_id)
  select v_poll_id, unnest(v_people);

  insert into public.meeting_poll_options (poll_id, starts_at)
  select v_poll_id, unnest(v_times);

  return v_poll_id;
end;
$$;

revoke all on function public.create_meeting_poll(text, text, uuid[], timestamptz[]) from public;
grant execute on function public.create_meeting_poll(text, text, uuid[], timestamptz[]) to authenticated;

create or replace function public.vote_meeting_poll(
  target_poll_id uuid,
  available_option_ids uuid[]
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

  if not exists (
    select 1
    from public.meeting_polls p
    join public.meeting_poll_participants mp on mp.poll_id = p.id
    where p.id = target_poll_id
      and p.closed_at is null
      and p.chosen_option_id is null
      and mp.person_id = v_actor
  ) then
    raise exception 'This poll is not open for your response.';
  end if;

  if exists (
    select 1 from unnest(coalesce(available_option_ids, '{}'::uuid[])) x
    where not exists (
      select 1 from public.meeting_poll_options o
      where o.poll_id = target_poll_id and o.id = x
    )
  ) then
    raise exception 'One or more selected times do not belong to this poll.';
  end if;

  delete from public.meeting_poll_votes
  where poll_id = target_poll_id and person_id = v_actor;

  insert into public.meeting_poll_votes (poll_id, option_id, person_id, available)
  select target_poll_id, o.id, v_actor, (o.id = any(coalesce(available_option_ids, '{}'::uuid[])))
  from public.meeting_poll_options o
  where o.poll_id = target_poll_id;
end;
$$;

revoke all on function public.vote_meeting_poll(uuid, uuid[]) from public;
grant execute on function public.vote_meeting_poll(uuid, uuid[]) to authenticated;

create or replace function public.choose_meeting_poll_option(
  target_poll_id uuid,
  target_option_id uuid
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

  if not exists (
    select 1 from public.meeting_polls p
    where p.id = target_poll_id
      and p.created_by = v_actor
      and p.closed_at is null
  ) then
    raise exception 'Only the poll creator can choose the meeting time.';
  end if;

  if not exists (
    select 1 from public.meeting_poll_options o
    where o.poll_id = target_poll_id and o.id = target_option_id
  ) then
    raise exception 'Meeting time not found in this poll.';
  end if;

  update public.meeting_polls
  set chosen_option_id = target_option_id,
      updated_at = now()
  where id = target_poll_id;
end;
$$;

revoke all on function public.choose_meeting_poll_option(uuid, uuid) from public;
grant execute on function public.choose_meeting_poll_option(uuid, uuid) to authenticated;

create or replace function public.close_meeting_poll(target_poll_id uuid)
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

  update public.meeting_polls
  set closed_at = now(), updated_at = now()
  where id = target_poll_id
    and created_by = v_actor
    and closed_at is null;

  if not found then
    raise exception 'Only the poll creator can close this poll.';
  end if;
end;
$$;

revoke all on function public.close_meeting_poll(uuid) from public;
grant execute on function public.close_meeting_poll(uuid) to authenticated;
