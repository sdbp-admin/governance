-- SDBP Workspace: contextual actions, project memory/comments, and recipient attention

-- Actions may belong to a project and may already carry an optional due date.
alter table public.actions
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists actions_project_status
  on public.actions(project_id, status)
  where project_id is not null;

-- Project update history is append-only organisational memory.
create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references public.people(id) on delete set null,
  update_kind text not null check (update_kind in ('baseline', 'update', 'no_change', 'edit')),
  summary text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists project_updates_project_created
  on public.project_updates(project_id, created_at desc);

alter table public.project_updates enable row level security;
grant select on public.project_updates to authenticated;
revoke insert, update, delete on public.project_updates from authenticated;

drop policy if exists "board members read project updates" on public.project_updates;
create policy "board members read project updates"
on public.project_updates
for select
to authenticated
using (public.is_board_member());

insert into public.project_updates (project_id, author_id, update_kind, summary, created_at)
select p.id, null, 'baseline', p.summary, coalesce(p.last_update_at, p.created_at)
from public.projects p
where nullif(trim(p.summary), '') is not null
  and not exists (
    select 1 from public.project_updates u where u.project_id = p.id
  );

create or replace function public.capture_project_update_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  if old.last_update_at is distinct from new.last_update_at then
    if old.summary is distinct from new.summary then
      v_kind := 'update';
    else
      v_kind := 'no_change';
    end if;
  elsif old.summary is distinct from new.summary then
    v_kind := 'edit';
  else
    return new;
  end if;

  insert into public.project_updates (project_id, author_id, update_kind, summary, created_at)
  values (
    new.id,
    public.activity_actor_id(),
    v_kind,
    coalesce(new.summary, ''),
    case when v_kind in ('update', 'no_change') then coalesce(new.last_update_at, now()) else now() end
  );

  return new;
end;
$$;

revoke all on function public.capture_project_update_history() from public;

drop trigger if exists capture_project_update_history on public.projects;
create trigger capture_project_update_history
after update of summary, last_update_at on public.projects
for each row execute function public.capture_project_update_history();

-- Comments stay attached to the project instead of becoming a separate chat system.
create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid not null references public.people(id) on delete restrict,
  body text not null check (nullif(trim(body), '') is not null),
  created_at timestamptz not null default now()
);

create index if not exists project_comments_project_created
  on public.project_comments(project_id, created_at asc);

alter table public.project_comments enable row level security;
grant select on public.project_comments to authenticated;
revoke insert, update, delete on public.project_comments from authenticated;

drop policy if exists "board members read project comments" on public.project_comments;
create policy "board members read project comments"
on public.project_comments
for select
to authenticated
using (public.is_board_member());

-- Generalise the existing attention signal just enough to support project comments.
alter table public.attention_signals
  alter column tension_id drop not null;

alter table public.attention_signals
  add column if not exists project_id uuid references public.projects(id) on delete cascade,
  add column if not exists signal_type text not null default 'tension_need';

alter table public.attention_signals
  drop constraint if exists attention_signals_signal_type_check;
alter table public.attention_signals
  add constraint attention_signals_signal_type_check
  check (signal_type in ('tension_need', 'project_comment'));

create unique index if not exists attention_one_open_tension_need
  on public.attention_signals(recipient_id, tension_id, signal_type)
  where acknowledged_at is null and signal_type = 'tension_need' and tension_id is not null;

create unique index if not exists attention_one_open_project_comment
  on public.attention_signals(recipient_id, project_id, signal_type)
  where acknowledged_at is null and signal_type = 'project_comment' and project_id is not null;

-- Future tension needs are written from recipient IDs, not parsed names.
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
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  if need_kind not in ('input', 'sync') then
    raise exception 'Unknown tension need.';
  end if;

  v_actor := public.activity_actor_id();

  select t.raiser_id into v_raiser
  from public.tensions t
  where t.id = target_tension_id
  for update;

  if not found then
    raise exception 'Tension not found.';
  end if;

  if v_actor is distinct from v_raiser then
    raise exception 'Only the person who raised the tension can define what they need.';
  end if;

  select string_agg(p.name, ', ' order by p.name)
    into v_names
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  if v_names is null then
    raise exception 'Choose at least one active person.';
  end if;

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

  update public.attention_signals
  set acknowledged_at = now()
  where tension_id = target_tension_id
    and signal_type = 'tension_need'
    and acknowledged_at is null;

  update public.tensions
  set status = v_status,
      resolution_proposed_by = null,
      latest_note = v_note
  where id = target_tension_id;

  insert into public.attention_signals (recipient_id, tension_id, project_id, signal_type, message, created_by)
  select p.id, target_tension_id, null, 'tension_need', v_note, v_actor
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;
end;
$$;

revoke all on function public.set_tension_need(uuid, text, uuid[], text) from public;
grant execute on function public.set_tension_need(uuid, text, uuid[], text) to authenticated;

-- Existing open needs are backfilled once so current requests immediately appear.
insert into public.attention_signals (recipient_id, tension_id, signal_type, message, created_by)
select p.id, t.id, 'tension_need', t.latest_note, t.raiser_id
from public.tensions t
join public.people p on p.active = true
where t.status in ('open', 'needs_sync')
  and (
    t.latest_note like 'Needs input or help from %'
    or t.latest_note like 'Needs a real conversation with %'
  )
  and position(
    p.name in split_part(
      regexp_replace(
        regexp_replace(t.latest_note, '^Needs input or help from ', ''),
        '^Needs a real conversation with ', ''
      ),
      ' — ',
      1
    )
  ) > 0
  and p.id <> t.raiser_id
  and not exists (
    select 1
    from public.attention_signals s
    where s.recipient_id = p.id
      and s.tension_id = t.id
      and s.signal_type = 'tension_need'
      and s.acknowledged_at is null
  )
on conflict do nothing;

create or replace function public.close_tension_attention_when_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('awaiting_confirmation', 'resolved', 'governance')
     and old.status is distinct from new.status then
    update public.attention_signals
    set acknowledged_at = now()
    where tension_id = new.id
      and signal_type = 'tension_need'
      and acknowledged_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.close_tension_attention_when_done() from public;

drop trigger if exists close_tension_attention_when_done on public.tensions;
create trigger close_tension_attention_when_done
after update of status on public.tensions
for each row execute function public.close_tension_attention_when_done();

create or replace function public.add_project_comment(target_project_id uuid, comment_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_owner uuid;
  v_project_title text;
  v_comment_id uuid;
  v_actor_name text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  if nullif(trim(coalesce(comment_body, '')), '') is null then
    raise exception 'Comment cannot be empty.';
  end if;

  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');

  select p.owner_id, p.title into v_owner, v_project_title
  from public.projects p
  where p.id = target_project_id;

  if not found then
    raise exception 'Project not found.';
  end if;

  insert into public.project_comments (project_id, author_id, body)
  values (target_project_id, v_actor, trim(comment_body))
  returning id into v_comment_id;

  if v_owner is distinct from v_actor then
    update public.attention_signals
    set message = 'New comment from ' || v_actor_name || ' on project “' || v_project_title || '”.',
        created_by = v_actor,
        created_at = now()
    where recipient_id = v_owner
      and project_id = target_project_id
      and signal_type = 'project_comment'
      and acknowledged_at is null;

    if not found then
      insert into public.attention_signals (recipient_id, tension_id, project_id, signal_type, message, created_by)
      values (
        v_owner,
        null,
        target_project_id,
        'project_comment',
        'New comment from ' || v_actor_name || ' on project “' || v_project_title || '”.',
        v_actor
      );
    end if;
  end if;

  return v_comment_id;
end;
$$;

revoke all on function public.add_project_comment(uuid, text) from public;
grant execute on function public.add_project_comment(uuid, text) to authenticated;

create or replace function public.acknowledge_attention_signal(target_signal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.attention_signals
  set acknowledged_at = now()
  where id = target_signal_id
    and recipient_id = public.activity_actor_id()
    and acknowledged_at is null;

  if not found then
    raise exception 'Attention item not found.';
  end if;
end;
$$;

revoke all on function public.acknowledge_attention_signal(uuid) from public;
grant execute on function public.acknowledge_attention_signal(uuid) to authenticated;
