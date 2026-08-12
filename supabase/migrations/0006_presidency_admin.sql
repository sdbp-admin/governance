-- SDBP Governance presidency and technical administration
-- Organisational admin rights follow the President board role.
-- The initial technical maintainer keeps a separate developer-admin safeguard.

alter table public.people
  add column if not exists developer_admin boolean not null default false;

-- One-time bootstrap: the person who previously held the free-standing inviter flag
-- becomes the technical maintainer. The old flag is no longer used for authority.
update public.people
set developer_admin = true,
    updated_at = now()
where can_invite = true;

update public.people
set can_invite = false,
    updated_at = now()
where can_invite = true;

-- Ensure there is a canonical President board role and an initial holder.
do $$
declare
  v_role_id uuid;
  v_holder_id uuid;
begin
  select r.id into v_role_id
  from public.roles r
  where r.category = 'board'
    and lower(btrim(r.title)) = 'president'
  order by r.created_at asc
  limit 1;

  if v_role_id is null then
    insert into public.roles (
      title,
      category,
      purpose,
      scope,
      responsibilities,
      accountabilities,
      source,
      definition_status
    )
    values (
      'President',
      'board',
      'Hold the formal presidency of SDBP.',
      '',
      '{}',
      '{}',
      'SDBP Statutes / applicable law',
      'defined'
    )
    returning id into v_role_id;
  end if;

  if not exists (
    select 1
    from public.role_assignments ra
    where ra.role_id = v_role_id
      and ra.ends_on is null
  ) then
    select p.id into v_holder_id
    from public.people p
    where p.active = true
      and p.auth_user_id is not null
    order by p.developer_admin desc, p.created_at asc
    limit 1;

    if v_holder_id is not null then
      insert into public.role_assignments (role_id, person_id, starts_on)
      values (v_role_id, v_holder_id, current_date);
    end if;
  end if;
end;
$$;

create or replace function public.president_role_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select r.id
  from public.roles r
  where r.category = 'board'
    and lower(btrim(r.title)) = 'president'
  order by r.created_at asc
  limit 1;
$$;

revoke all on function public.president_role_id() from public;

create or replace function public.is_current_president()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.people p
    join public.role_assignments ra on ra.person_id = p.id and ra.ends_on is null
    where p.auth_user_id = auth.uid()
      and p.active = true
      and ra.role_id = public.president_role_id()
  );
$$;

revoke all on function public.is_current_president() from public;
grant execute on function public.is_current_president() to authenticated;

create or replace function public.is_developer_admin()
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
      and p.developer_admin = true
  );
$$;

revoke all on function public.is_developer_admin() from public;
grant execute on function public.is_developer_admin() to authenticated;

-- Kept under the existing function name so the client and people policies remain simple.
-- In ordinary use this is the President; the technical maintainer is a recovery safeguard.
create or replace function public.can_invite_people()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_current_president() or public.is_developer_admin();
$$;

revoke all on function public.can_invite_people() from public;
grant execute on function public.can_invite_people() to authenticated;

create or replace function public.transfer_presidency(target_person_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if not public.is_current_president() then
    raise exception 'Only the current President can transfer the presidency.';
  end if;

  if not exists (
    select 1
    from public.people p
    where p.id = target_person_id
      and p.active = true
      and p.auth_user_id is not null
  ) then
    raise exception 'The new President must be an active member who has joined the workspace.';
  end if;

  v_role_id := public.president_role_id();
  if v_role_id is null then
    raise exception 'President role not found.';
  end if;

  if exists (
    select 1
    from public.role_assignments ra
    where ra.role_id = v_role_id
      and ra.person_id = target_person_id
      and ra.ends_on is null
  ) then
    return;
  end if;

  update public.role_assignments
  set ends_on = current_date
  where role_id = v_role_id
    and ends_on is null;

  insert into public.role_assignments (role_id, person_id, starts_on)
  values (v_role_id, target_person_id, current_date);
end;
$$;

revoke all on function public.transfer_presidency(uuid) from public;
grant execute on function public.transfer_presidency(uuid) to authenticated;

-- Revoking workspace access keeps organisational history intact. The current President
-- must transfer the presidency first. Technical maintainer access is not removable
-- through the organisational UI.
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

  if exists (
    select 1
    from public.role_assignments ra
    where ra.person_id = target_person_id
      and ra.role_id = public.president_role_id()
      and ra.ends_on is null
  ) then
    raise exception 'Transfer the presidency before removing the current President.';
  end if;

  if exists (
    select 1
    from public.people p
    where p.id = target_person_id
      and p.developer_admin = true
  ) then
    raise exception 'Technical maintainer access is managed outside SDBP governance.';
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

-- Claiming an invited profile never grants organisational admin authority. That now
-- comes only from the President role (with the separate technical safeguard above).
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

  return query
  select p.id, p.name, p.email
  from public.people p
  where p.id = v_person_id;
end;
$$;

revoke all on function public.claim_workspace_profile() from public;
grant execute on function public.claim_workspace_profile() to authenticated;

-- Protect the President role from ordinary role editing. Its holder can change only
-- through transfer_presidency(), while all other roles remain editable as before.
drop policy if exists "board workspace" on public.roles;
drop policy if exists "board roles read" on public.roles;
drop policy if exists "board roles insert" on public.roles;
drop policy if exists "board roles update" on public.roles;
drop policy if exists "board roles delete" on public.roles;

create policy "board roles read" on public.roles
for select to authenticated
using (public.is_board_member());

create policy "board roles insert" on public.roles
for insert to authenticated
with check (
  public.is_board_member()
  and not (category = 'board' and lower(btrim(title)) = 'president')
);

create policy "board roles update" on public.roles
for update to authenticated
using (public.is_board_member())
with check (
  public.is_board_member()
  and (
    (id = public.president_role_id() and category = 'board' and lower(btrim(title)) = 'president')
    or
    (id <> public.president_role_id() and not (category = 'board' and lower(btrim(title)) = 'president'))
  )
);

create policy "board roles delete" on public.roles
for delete to authenticated
using (
  public.is_board_member()
  and id <> public.president_role_id()
);

drop policy if exists "board workspace" on public.role_assignments;
drop policy if exists "board role assignments read" on public.role_assignments;
drop policy if exists "board role assignments insert" on public.role_assignments;
drop policy if exists "board role assignments update" on public.role_assignments;
drop policy if exists "board role assignments delete" on public.role_assignments;

create policy "board role assignments read" on public.role_assignments
for select to authenticated
using (public.is_board_member());

create policy "board role assignments insert" on public.role_assignments
for insert to authenticated
with check (
  public.is_board_member()
  and role_id <> public.president_role_id()
);

create policy "board role assignments update" on public.role_assignments
for update to authenticated
using (
  public.is_board_member()
  and role_id <> public.president_role_id()
)
with check (
  public.is_board_member()
  and role_id <> public.president_role_id()
);

create policy "board role assignments delete" on public.role_assignments
for delete to authenticated
using (
  public.is_board_member()
  and role_id <> public.president_role_id()
);
