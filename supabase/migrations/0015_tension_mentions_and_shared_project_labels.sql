-- SDBP Workspace: real tension-comment mentions and shared project labelling.
-- Project links are organisational context, so any active board member may maintain
-- them on unresolved tensions. Mentions are explicit recipients, not parsed server-side
-- from arbitrary comment text.

alter table public.tension_comments
  add column if not exists mentioned_ids uuid[] not null default '{}';

-- Re-create the comment RPC with explicit mention recipients. The UI resolves typed
-- @mentions to person IDs so notification behaviour is unambiguous.
drop function if exists public.add_tension_comment(uuid, text);

create or replace function public.add_tension_comment(
  target_tension_id uuid,
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
  v_raiser uuid;
  v_title text;
  v_mentions uuid[];
  v_id uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;
  if nullif(trim(coalesce(comment_body, '')), '') is null then
    raise exception 'Comment cannot be empty.';
  end if;

  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');

  select t.raiser_id, t.title
    into v_raiser, v_title
  from public.tensions t
  where t.id = target_tension_id;
  if not found then raise exception 'Tension not found.'; end if;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
    into v_mentions
  from public.people p
  where p.active = true
    and p.id = any(coalesce(mention_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  insert into public.tension_comments (tension_id, author_id, body, mentioned_ids)
  values (target_tension_id, v_actor, trim(comment_body), v_mentions)
  returning id into v_id;

  -- Comments still notify the tension-holder, as before.
  if v_raiser is distinct from v_actor then
    update public.attention_signals
    set message = 'New comment from ' || v_actor_name || ' on tension “' || v_title || '”.',
        created_by = v_actor,
        created_at = now()
    where recipient_id = v_raiser
      and tension_id = target_tension_id
      and signal_type = 'tension_comment'
      and acknowledged_at is null;

    if not found then
      insert into public.attention_signals (
        recipient_id, tension_id, project_id, board_post_id,
        signal_type, message, created_by
      ) values (
        v_raiser, target_tension_id, null, null,
        'tension_comment',
        'New comment from ' || v_actor_name || ' on tension “' || v_title || '”.',
        v_actor
      );
    end if;
  end if;

  -- Explicit @mentions notify those people too. If the raiser is also mentioned,
  -- the mention message replaces the generic comment notification.
  update public.attention_signals s
  set message = v_actor_name || ' mentioned you in a comment on tension “' || v_title || '”.',
      created_by = v_actor,
      created_at = now()
  where s.tension_id = target_tension_id
    and s.signal_type = 'tension_comment'
    and s.acknowledged_at is null
    and s.recipient_id = any(v_mentions);

  insert into public.attention_signals (
    recipient_id, tension_id, project_id, board_post_id,
    signal_type, message, created_by
  )
  select p.id, target_tension_id, null, null,
         'tension_comment',
         v_actor_name || ' mentioned you in a comment on tension “' || v_title || '”.',
         v_actor
  from public.people p
  where p.active = true
    and p.id = any(v_mentions)
    and not exists (
      select 1
      from public.attention_signals s
      where s.recipient_id = p.id
        and s.tension_id = target_tension_id
        and s.signal_type = 'tension_comment'
        and s.acknowledged_at is null
    );

  return v_id;
end;
$$;

revoke all on function public.add_tension_comment(uuid, text, uuid[]) from public;
grant execute on function public.add_tension_comment(uuid, text, uuid[]) to authenticated;

-- Project labelling is shared board organisation, not ownership of the tension.
create or replace function public.set_tension_project(
  target_tension_id uuid,
  target_project_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_project uuid;
  v_status text;
  v_title text;
  v_old_title text;
  v_new_title text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  select t.project_id, t.status, t.title
    into v_old_project, v_status, v_title
  from public.tensions t
  where t.id = target_tension_id
  for update;

  if not found then raise exception 'Tension not found.'; end if;
  if v_status = 'resolved' then
    raise exception 'Resolved tensions cannot be reorganised.';
  end if;

  if target_project_id is not null then
    select p.title into v_new_title
    from public.projects p
    where p.id = target_project_id and p.status = 'active';
    if not found then raise exception 'Choose an active project.'; end if;
  end if;

  if v_old_project is not null then
    select p.title into v_old_title from public.projects p where p.id = v_old_project;
  end if;

  if v_old_project is not distinct from target_project_id then return; end if;

  update public.tensions
  set project_id = target_project_id
  where id = target_tension_id;

  if target_project_id is null then
    perform public.write_activity(
      'tension_project_unlinked', 'tension', target_tension_id,
      'Removed project label from tension: ' || v_title,
      jsonb_build_object('old_project_id', v_old_project, 'old_project_title', v_old_title)
    );
  elsif v_old_project is null then
    perform public.write_activity(
      'tension_project_linked', 'tension', target_tension_id,
      'Linked tension to project: ' || v_new_title,
      jsonb_build_object('project_id', target_project_id, 'project_title', v_new_title)
    );
  else
    perform public.write_activity(
      'tension_project_changed', 'tension', target_tension_id,
      'Changed tension project from ' || coalesce(v_old_title, 'Unknown project') || ' to ' || v_new_title,
      jsonb_build_object(
        'old_project_id', v_old_project, 'old_project_title', v_old_title,
        'project_id', target_project_id, 'project_title', v_new_title
      )
    );
  end if;
end;
$$;

revoke all on function public.set_tension_project(uuid, uuid) from public;
grant execute on function public.set_tension_project(uuid, uuid) to authenticated;
