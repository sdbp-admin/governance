-- SDBP Governance launch workspace
-- Adds in-app invitations and lightweight project-team visibility without exposing an admin key.

alter table public.people
  add column if not exists can_invite boolean not null default false;

alter table public.projects
  add column if not exists participant_ids uuid[] not null default '{}';

-- Preserve the existing first linked workspace user as the initial inviter.
update public.people
set can_invite = true,
    updated_at = now()
where id = (
  select id
  from public.people
  where active = true and auth_user_id is not null
  order by created_at asc
  limit 1
)
and not exists (select 1 from public.people where can_invite = true);

create or replace function public.can_invite_people()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.people p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.can_invite = true
  );
$$;

revoke all on function public.can_invite_people() from public;
grant execute on function public.can_invite_people() to authenticated;

-- A person must already have been added to the SDBP workspace before a newly-created
-- auth user can claim that profile. This lets the President send a normal magic-link
-- invitation from the browser without putting a service-role/admin key in the app.
create or replace function public.claim_workspace_profile()
returns table(id uuid, name text, email text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_person_id uuid;
begin
  select u.email into v_email
  from auth.users u
  where u.id = auth.uid();

  if v_email is null then
    return;
  end if;

  select p.id into v_person_id
  from public.people p
  where lower(p.email) = lower(v_email)
    and p.active = true
    and (p.auth_user_id is null or p.auth_user_id = auth.uid())
  limit 1;

  if v_person_id is null then
    return;
  end if;

  update public.people
  set auth_user_id = auth.uid(),
      updated_at = now()
  where public.people.id = v_person_id;

  -- If this is the first linked workspace user, make that person the initial inviter.
  if not exists (select 1 from public.people where can_invite = true) then
    update public.people
    set can_invite = true,
        updated_at = now()
    where public.people.id = v_person_id;
  end if;

  return query
  select p.id, p.name, p.email
  from public.people p
  where p.id = v_person_id;
end;
$$;

revoke all on function public.claim_workspace_profile() from public;
grant execute on function public.claim_workspace_profile() to authenticated;

-- People are visible to the workspace, but only the designated inviter can add people.
-- Linking an invited login is handled by claim_workspace_profile(), not a client update.
drop policy if exists "board workspace" on public.people;
drop policy if exists "board people read" on public.people;
drop policy if exists "president invites people" on public.people;

create policy "board people read" on public.people
for select to authenticated
using (public.is_board_member());

create policy "president invites people" on public.people
for insert to authenticated
with check (public.can_invite_people());
