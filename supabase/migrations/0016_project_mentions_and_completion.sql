-- SDBP Workspace: real project-comment mentions and reversible project completion.
-- Project comments keep the existing owner notification while explicit @mentions
-- create My Attention signals for the named people.

alter table public.project_comments
  add column if not exists mentioned_ids uuid[] not null default '{}';

drop function if exists public.add_project_comment(uuid, text);

create or replace function public.add_project_comment(
  target_project_id uuid,
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
  v_owner uuid;
  v_project_title text;
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

  select p.owner_id, p.title
    into v_owner, v_project_title
  from public.projects p
  where p.id = target_project_id;

  if not found then raise exception 'Project not found.'; end if;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
    into v_mentions
  from public.people p
  where p.active = true
    and p.id = any(coalesce(mention_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  insert into public.project_comments (project_id, author_id, body, mentioned_ids)
  values (target_project_id, v_actor, trim(comment_body), v_mentions)
  returning id into v_comment_id;

  -- Preserve the existing rule: a comment from somebody else alerts the project owner.
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
      insert into public.attention_signals (
        recipient_id, tension_id, project_id, board_post_id,
        signal_type, message, created_by
      ) values (
        v_owner, null, target_project_id, null,
        'project_comment',
        'New comment from ' || v_actor_name || ' on project “' || v_project_title || '”.',
        v_actor
      );
    end if;
  end if;

  -- Explicit @mentions alert the named people too. If the owner is also mentioned,
  -- the explicit mention wording replaces the generic owner notification.
  update public.attention_signals s
  set message = v_actor_name || ' mentioned you in a comment on project “' || v_project_title || '”.',
      created_by = v_actor,
      created_at = now()
  where s.project_id = target_project_id
    and s.signal_type = 'project_comment'
    and s.acknowledged_at is null
    and s.recipient_id = any(v_mentions);

  insert into public.attention_signals (
    recipient_id, tension_id, project_id, board_post_id,
    signal_type, message, created_by
  )
  select p.id, null, target_project_id, null,
         'project_comment',
         v_actor_name || ' mentioned you in a comment on project “' || v_project_title || '”.',
         v_actor
  from public.people p
  where p.active = true
    and p.id = any(v_mentions)
    and not exists (
      select 1
      from public.attention_signals s
      where s.recipient_id = p.id
        and s.project_id = target_project_id
        and s.signal_type = 'project_comment'
        and s.acknowledged_at is null
    );

  return v_comment_id;
end;
$$;

revoke all on function public.add_project_comment(uuid, text, uuid[]) from public;
grant execute on function public.add_project_comment(uuid, text, uuid[]) to authenticated;

-- Keep completion attributable and make reopening visible in the Activity ledger.
create or replace function public.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_activity('project_added', 'project', new.id, 'Added project: ' || new.title);
  elsif old.status is distinct from new.status and new.status = 'complete' then
    perform public.write_activity('project_completed', 'project', new.id, 'Completed project: ' || new.title);
  elsif old.status = 'complete' and new.status = 'active' then
    perform public.write_activity('project_reopened', 'project', new.id, 'Reopened project: ' || new.title);
  end if;
  return new;
end;
$$;

revoke all on function public.log_project_activity() from public;

drop trigger if exists log_project_activity on public.projects;
create trigger log_project_activity
after insert or update of status on public.projects
for each row execute function public.log_project_activity();
