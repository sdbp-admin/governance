-- SDBP Workspace: editable project structure with attributable changes
-- Editing project identity/team is distinct from giving a project update.
-- This RPC does not touch last_update_at or next_prompt_on.

create or replace function public.edit_project(
  target_project_id uuid,
  new_title text,
  new_owner_id uuid,
  new_participant_ids uuid[],
  new_summary text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.projects%rowtype;
  v_participants uuid[];
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  if nullif(trim(new_title), '') is null then
    raise exception 'Project name is required.';
  end if;

  if not exists (
    select 1 from public.people p
    where p.id = new_owner_id and p.active = true
  ) then
    raise exception 'Project owner must be an active workspace member.';
  end if;

  select p.* into v_old
  from public.projects p
  where p.id = target_project_id
  for update;

  if not found then
    raise exception 'Project not found.';
  end if;

  select coalesce(array_agg(distinct person_id), '{}'::uuid[])
    into v_participants
  from unnest(coalesce(new_participant_ids, '{}'::uuid[]) || array[new_owner_id]) as person_id
  where exists (
    select 1 from public.people p
    where p.id = person_id and p.active = true
  );

  update public.projects
  set title = trim(new_title),
      owner_id = new_owner_id,
      participant_ids = v_participants,
      summary = coalesce(trim(new_summary), ''),
      updated_at = now()
  where id = target_project_id;

  perform public.write_activity(
    'project_edited',
    'project',
    target_project_id,
    'Edited project: ' || trim(new_title),
    jsonb_build_object(
      'old_title', v_old.title,
      'new_title', trim(new_title),
      'old_owner_id', v_old.owner_id,
      'new_owner_id', new_owner_id,
      'old_participant_ids', coalesce(v_old.participant_ids, '{}'::uuid[]),
      'new_participant_ids', v_participants
    )
  );
end;
$$;

revoke all on function public.edit_project(uuid, text, uuid, uuid[], text) from public;
grant execute on function public.edit_project(uuid, text, uuid, uuid[], text) to authenticated;
