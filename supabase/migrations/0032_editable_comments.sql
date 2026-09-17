-- SDBP Workspace: author-owned comment editing without turning edits into new activity.

alter table public.project_comments add column if not exists updated_at timestamptz;
alter table public.tension_comments add column if not exists updated_at timestamptz;
alter table public.action_comments add column if not exists updated_at timestamptz;

-- Comment attention is still collapsed per thread. Recording the comment that most
-- recently sourced an open signal lets an edit withdraw only its own removed mentions.
alter table public.attention_signals add column if not exists source_comment_id uuid;
create index if not exists attention_signals_open_source_comment
  on public.attention_signals(source_comment_id, signal_type)
  where acknowledged_at is null and source_comment_id is not null;

create or replace function public.tag_comment_attention_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_signal_type text;
  v_default_recipient uuid;
begin
  if tg_table_name = 'project_comments' then
    v_parent_id := new.project_id;
    v_signal_type := 'project_comment';
    select owner_id into v_default_recipient from public.projects where id = new.project_id;
    update public.attention_signals
    set source_comment_id = new.id
    where signal_type = v_signal_type and project_id = v_parent_id
      and acknowledged_at is null and created_by = new.author_id
      and (recipient_id = v_default_recipient or recipient_id = any(new.mentioned_ids));
  elsif tg_table_name = 'tension_comments' then
    v_parent_id := new.tension_id;
    v_signal_type := 'tension_comment';
    select raiser_id into v_default_recipient from public.tensions where id = new.tension_id;
    update public.attention_signals
    set source_comment_id = new.id
    where signal_type = v_signal_type and tension_id = v_parent_id
      and acknowledged_at is null and created_by = new.author_id
      and (recipient_id = v_default_recipient or recipient_id = any(new.mentioned_ids));
  elsif tg_table_name = 'action_comments' then
    v_parent_id := new.action_id;
    v_signal_type := 'action_comment';
    update public.attention_signals
    set source_comment_id = new.id
    where signal_type = v_signal_type and action_id = v_parent_id
      and acknowledged_at is null and created_by = new.author_id
      and recipient_id = any(new.mentioned_ids);
  end if;
  return new;
end;
$$;

revoke all on function public.tag_comment_attention_source() from public;

drop trigger if exists tag_project_comment_attention_source on public.project_comments;
create constraint trigger tag_project_comment_attention_source
after insert on public.project_comments deferrable initially deferred
for each row execute function public.tag_comment_attention_source();

drop trigger if exists tag_tension_comment_attention_source on public.tension_comments;
create constraint trigger tag_tension_comment_attention_source
after insert on public.tension_comments deferrable initially deferred
for each row execute function public.tag_comment_attention_source();

drop trigger if exists tag_action_comment_attention_source on public.action_comments;
create constraint trigger tag_action_comment_attention_source
after insert on public.action_comments deferrable initially deferred
for each row execute function public.tag_comment_attention_source();

create or replace function public.edit_project_comment(
  target_comment_id uuid,
  comment_body text,
  mention_ids uuid[] default '{}'
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_project_id uuid;
  v_project_title text;
  v_owner uuid;
  v_old_mentions uuid[];
  v_mentions uuid[];
  v_added uuid[];
  v_removed uuid[];
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if nullif(trim(coalesce(comment_body, '')), '') is null then raise exception 'Comment cannot be empty.'; end if;
  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');

  select c.project_id, c.mentioned_ids, p.title, p.owner_id
    into v_project_id, v_old_mentions, v_project_title, v_owner
  from public.project_comments c join public.projects p on p.id = c.project_id
  where c.id = target_comment_id and c.author_id = v_actor for update of c;
  if not found then raise exception 'Only the comment author may edit this comment.'; end if;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions
  from public.people p where p.active = true and p.id = any(coalesce(mention_ids, '{}'::uuid[])) and p.id <> v_actor;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_added from unnest(v_mentions) id where not (id = any(v_old_mentions));
  select coalesce(array_agg(id), '{}'::uuid[]) into v_removed from unnest(v_old_mentions) id where not (id = any(v_mentions));

  update public.project_comments set body = trim(comment_body), mentioned_ids = v_mentions, updated_at = now() where id = target_comment_id;
  update public.attention_signals set acknowledged_at = now()
  where signal_type = 'project_comment' and acknowledged_at is null and recipient_id = any(v_removed) and recipient_id <> v_owner
    and (source_comment_id = target_comment_id or (source_comment_id is null and created_by = v_actor and not exists (
      select 1 from public.project_comments c where c.project_id = v_project_id and c.id <> target_comment_id and recipient_id = any(c.mentioned_ids)
    )));
  update public.attention_signals set message = v_actor_name || ' mentioned you in a comment on project “' || v_project_title || '”.',
    created_by = v_actor, created_at = now(), source_comment_id = target_comment_id
  where project_id = v_project_id and signal_type = 'project_comment' and acknowledged_at is null and recipient_id = any(v_added);
  insert into public.attention_signals (recipient_id, tension_id, project_id, board_post_id, signal_type, message, created_by, source_comment_id)
  select added.recipient_id, null, v_project_id, null, 'project_comment', v_actor_name || ' mentioned you in a comment on project “' || v_project_title || '”.', v_actor, target_comment_id
  from unnest(v_added) as added(recipient_id) where not exists (select 1 from public.attention_signals s where s.recipient_id = added.recipient_id and s.project_id = v_project_id and s.signal_type = 'project_comment' and s.acknowledged_at is null);
  return v_added;
end;
$$;

create or replace function public.edit_tension_comment(
  target_comment_id uuid,
  comment_body text,
  mention_ids uuid[] default '{}'
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid; v_actor_name text; v_tension_id uuid; v_title text; v_raiser uuid;
  v_old_mentions uuid[]; v_mentions uuid[]; v_added uuid[]; v_removed uuid[];
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if nullif(trim(coalesce(comment_body, '')), '') is null then raise exception 'Comment cannot be empty.'; end if;
  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');
  select c.tension_id, c.mentioned_ids, t.title, t.raiser_id into v_tension_id, v_old_mentions, v_title, v_raiser
  from public.tension_comments c join public.tensions t on t.id = c.tension_id
  where c.id = target_comment_id and c.author_id = v_actor for update of c;
  if not found then raise exception 'Only the comment author may edit this comment.'; end if;
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions from public.people p
  where p.active = true and p.id = any(coalesce(mention_ids, '{}'::uuid[])) and p.id <> v_actor;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_added from unnest(v_mentions) id where not (id = any(v_old_mentions));
  select coalesce(array_agg(id), '{}'::uuid[]) into v_removed from unnest(v_old_mentions) id where not (id = any(v_mentions));
  update public.tension_comments set body = trim(comment_body), mentioned_ids = v_mentions, updated_at = now() where id = target_comment_id;
  update public.attention_signals set acknowledged_at = now()
  where signal_type = 'tension_comment' and acknowledged_at is null and recipient_id = any(v_removed) and recipient_id <> v_raiser
    and (source_comment_id = target_comment_id or (source_comment_id is null and created_by = v_actor and not exists (
      select 1 from public.tension_comments c where c.tension_id = v_tension_id and c.id <> target_comment_id and recipient_id = any(c.mentioned_ids)
    )));
  update public.attention_signals set message = v_actor_name || ' mentioned you in a comment on tension “' || v_title || '”.',
    created_by = v_actor, created_at = now(), source_comment_id = target_comment_id
  where tension_id = v_tension_id and signal_type = 'tension_comment' and acknowledged_at is null and recipient_id = any(v_added);
  insert into public.attention_signals (recipient_id, tension_id, project_id, board_post_id, signal_type, message, created_by, source_comment_id)
  select added.recipient_id, v_tension_id, null, null, 'tension_comment', v_actor_name || ' mentioned you in a comment on tension “' || v_title || '”.', v_actor, target_comment_id
  from unnest(v_added) as added(recipient_id) where not exists (select 1 from public.attention_signals s where s.recipient_id = added.recipient_id and s.tension_id = v_tension_id and s.signal_type = 'tension_comment' and s.acknowledged_at is null);
  return v_added;
end;
$$;

create or replace function public.edit_action_comment(
  target_comment_id uuid,
  comment_body text,
  mention_ids uuid[] default '{}'
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid; v_actor_name text; v_action_id uuid; v_title text;
  v_old_mentions uuid[]; v_mentions uuid[]; v_added uuid[]; v_removed uuid[];
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if nullif(trim(coalesce(comment_body, '')), '') is null then raise exception 'Comment cannot be empty.'; end if;
  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');
  select c.action_id, c.mentioned_ids, a.title into v_action_id, v_old_mentions, v_title
  from public.action_comments c join public.actions a on a.id = c.action_id
  where c.id = target_comment_id and c.author_id = v_actor for update of c;
  if not found then raise exception 'Only the comment author may edit this comment.'; end if;
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions from public.people p
  where p.active = true and p.id = any(coalesce(mention_ids, '{}'::uuid[])) and p.id <> v_actor;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_added from unnest(v_mentions) id where not (id = any(v_old_mentions));
  select coalesce(array_agg(id), '{}'::uuid[]) into v_removed from unnest(v_old_mentions) id where not (id = any(v_mentions));
  update public.action_comments set body = trim(comment_body), mentioned_ids = v_mentions, updated_at = now() where id = target_comment_id;
  update public.attention_signals set acknowledged_at = now()
  where signal_type = 'action_comment' and acknowledged_at is null and recipient_id = any(v_removed)
    and (source_comment_id = target_comment_id or (source_comment_id is null and created_by = v_actor and not exists (
      select 1 from public.action_comments c where c.action_id = v_action_id and c.id <> target_comment_id and recipient_id = any(c.mentioned_ids)
    )));
  update public.attention_signals set message = v_actor_name || ' mentioned you in a comment on commitment “' || v_title || '”.',
    created_by = v_actor, created_at = now(), source_comment_id = target_comment_id
  where action_id = v_action_id and signal_type = 'action_comment' and acknowledged_at is null and recipient_id = any(v_added);
  insert into public.attention_signals (recipient_id, tension_id, project_id, board_post_id, action_id, signal_type, message, created_by, source_comment_id)
  select added.recipient_id, null, null, null, v_action_id, 'action_comment', v_actor_name || ' mentioned you in a comment on commitment “' || v_title || '”.', v_actor, target_comment_id
  from unnest(v_added) as added(recipient_id) where not exists (select 1 from public.attention_signals s where s.recipient_id = added.recipient_id and s.action_id = v_action_id and s.signal_type = 'action_comment' and s.acknowledged_at is null);
  return v_added;
end;
$$;

revoke all on function public.edit_project_comment(uuid, text, uuid[]) from public;
revoke all on function public.edit_tension_comment(uuid, text, uuid[]) from public;
revoke all on function public.edit_action_comment(uuid, text, uuid[]) from public;
grant execute on function public.edit_project_comment(uuid, text, uuid[]) to authenticated;
grant execute on function public.edit_tension_comment(uuid, text, uuid[]) to authenticated;
grant execute on function public.edit_action_comment(uuid, text, uuid[]) to authenticated;
