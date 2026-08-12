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

-- Ensure there is a single canonical President board role to transfer.
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

after_statement: begin end;
