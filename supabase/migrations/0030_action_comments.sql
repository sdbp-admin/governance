-- SDBP Workspace: persistent commitment conversation.
-- Normal comments create unread thread activity. Only explicit mentions create
-- personal attention signals.

create table if not exists public.action_comments (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions(id) on delete cascade,
  author_id uuid not null references public.people(id) on delete restrict,
  body text not null check (nullif(trim(body), '') is not null),
  mentioned_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists action_comments_action_created
  on public.action_comments(action_id, created_at asc);

alter table public.action_comments enable row level security;
grant select on public.action_comments to authenticated;
revoke insert, update, delete on public.action_comments from authenticated;

drop policy if exists "board members read action comments" on public.action_comments;
create policy "board members read action comments"
on public.action_comments
for select
to authenticated
using (public.is_board_member());

alter table public.attention_signals
  add column if not exists action_id uuid references public.actions(id) on delete cascade;

alter table public.attention_signals
  drop constraint if exists attention_signals_signal_type_check;
alter table public.attention_signals
  add constraint attention_signals_signal_type_check
  check (signal_type in ('tension_need', 'project_comment', 'tension_comment', 'board_feed_mention', 'action_comment'));

create unique index if not exists attention_one_open_action_comment
  on public.attention_signals(recipient_id, action_id, signal_type)
  where acknowledged_at is null and signal_type = 'action_comment' and action_id is not null;

alter table public.comment_thread_reads
  drop constraint if exists comment_thread_reads_thread_type_check;
alter table public.comment_thread_reads
  add constraint comment_thread_reads_thread_type_check
  check (thread_type in ('project', 'tension', 'action'));

create or replace function public.add_action_comment(
  target_action_id uuid,
  comment_body text,
  mention_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_action_title text;
  v_mentions uuid[];
  v_comment_id uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;
  if nullif(trim(coalesce(comment_body, '')), '') is null then
    raise exception 'Comment cannot be empty.';
  end if;

  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');

  select a.title into v_action_title
  from public.actions a
  where a.id = target_action_id;
  if not found then raise exception 'Commitment not found.'; end if;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
    into v_mentions
  from public.people p
  where p.active = true
    and p.id = any(coalesce(mention_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  insert into public.action_comments (action_id, author_id, body, mentioned_ids)
  values (target_action_id, v_actor, trim(comment_body), v_mentions)
  returning id into v_comment_id;

  update public.attention_signals s
  set message = v_actor_name || ' mentioned you in a comment on commitment “' || v_action_title || '”.',
      created_by = v_actor,
      created_at = now()
  where s.action_id = target_action_id
    and s.signal_type = 'action_comment'
    and s.acknowledged_at is null
    and s.recipient_id = any(v_mentions);

  insert into public.attention_signals (
    recipient_id, tension_id, project_id, board_post_id, action_id,
    signal_type, message, created_by
  )
  select p.id, null, null, null, target_action_id,
         'action_comment',
         v_actor_name || ' mentioned you in a comment on commitment “' || v_action_title || '”.',
         v_actor
  from public.people p
  where p.active = true
    and p.id = any(v_mentions)
    and not exists (
      select 1
      from public.attention_signals s
      where s.recipient_id = p.id
        and s.action_id = target_action_id
        and s.signal_type = 'action_comment'
        and s.acknowledged_at is null
    );

  return v_comment_id;
end;
$$;

revoke all on function public.add_action_comment(uuid, text, uuid[]) from public;
grant execute on function public.add_action_comment(uuid, text, uuid[]) to authenticated;

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

  if target_thread_type not in ('project', 'tension', 'action') then
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
      select count(*)::bigint,
        count(*) filter (where c.author_id <> v_actor and (v_seen is null or c.created_at > v_seen))::bigint,
        v_seen
      from public.project_comments c
      where c.project_id = target_thread_id;
  elsif target_thread_type = 'tension' then
    if not exists (select 1 from public.tensions t where t.id = target_thread_id) then
      raise exception 'Tension not found.';
    end if;
    return query
      select count(*)::bigint,
        count(*) filter (where c.author_id <> v_actor and (v_seen is null or c.created_at > v_seen))::bigint,
        v_seen
      from public.tension_comments c
      where c.tension_id = target_thread_id;
  else
    if not exists (select 1 from public.actions a where a.id = target_thread_id) then
      raise exception 'Commitment not found.';
    end if;
    return query
      select count(*)::bigint,
        count(*) filter (where c.author_id <> v_actor and (v_seen is null or c.created_at > v_seen))::bigint,
        v_seen
      from public.action_comments c
      where c.action_id = target_thread_id;
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

  if target_thread_type not in ('project', 'tension', 'action') then
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
  if target_thread_type = 'action' and not exists (
    select 1 from public.actions a where a.id = target_thread_id
  ) then
    raise exception 'Commitment not found.';
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
