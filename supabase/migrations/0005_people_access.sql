-- SDBP Governance people access management
-- The designated inviter can revoke or restore workspace access without deleting organisational history.

create or replace function public.deactivate_workspace_person(target_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_invite_people() then
    raise exception 'Not allowed to manage workspace access.';
  end if;

  if exists (
    select 1
    from public.people p
    where p.id = target_person_id
      and p.auth_user_id = auth.uid()
  ) then
    raise exception 'You cannot remove your own workspace access here.';
  end if;

  update public.people
  set active = false,
      can_invite = false,
      updated_at = now()
  where id = target_person_id
    and active = true;

  if not found then
    raise exception 'Person not found or already inactive.';
  end if;
end;
$$;

revoke all on function public.deactivate_workspace_person(uuid) from public;
grant execute on function public.deactivate_workspace_person(uuid) to authenticated;

create or replace function public.reactivate_workspace_person(target_email text, target_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  if not public.can_invite_people() then
    raise exception 'Not allowed to manage workspace access.';
  end if;

  update public.people
  set active = true,
      name = coalesce(nullif(trim(target_name), ''), name),
      can_invite = false,
      updated_at = now()
  where lower(email) = lower(trim(target_email))
  returning id into v_person_id;

  return v_person_id;
end;
$$;

revoke all on function public.reactivate_workspace_person(text, text) from public;
grant execute on function public.reactivate_workspace_person(text, text) to authenticated;
