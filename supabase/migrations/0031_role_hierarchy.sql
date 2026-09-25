-- Persistent organisational hierarchy for roles and circles.
-- Projects remain separate operational objects and are not part of this tree.

alter table public.roles
  add column if not exists parent_role_id uuid references public.roles(id) on delete set null,
  add column if not exists is_circle boolean not null default false;

create index if not exists roles_parent_role
  on public.roles(parent_role_id, title);

-- Keep the existing role activity stream authoritative for structural changes too.
create or replace function public.log_role_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_activity(
      'role_added',
      'role',
      new.id,
      'Added ' || case when new.is_circle then 'circle: ' else 'role: ' end || new.title
    );
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_activity(
      'role_removed',
      'role',
      old.id,
      'Removed ' || case when old.is_circle then 'circle: ' else 'role: ' end || old.title
    );
    return old;
  end if;

  if row(old.title, old.category, old.is_circle, old.parent_role_id, old.purpose, old.scope, old.responsibilities, old.accountabilities, old.source, old.definition_status)
     is distinct from
     row(new.title, new.category, new.is_circle, new.parent_role_id, new.purpose, new.scope, new.responsibilities, new.accountabilities, new.source, new.definition_status) then
    perform public.write_activity(
      'role_updated',
      'role',
      new.id,
      'Updated ' || case when new.is_circle then 'circle: ' else 'role: ' end || new.title
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_role_activity() from public;

create or replace function public.validate_role_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent_is_circle boolean;
begin
  if new.category = 'board' and lower(btrim(new.title)) = 'president' and new.is_circle then
    raise exception 'The protected President object must remain a role.';
  end if;

  if new.parent_role_id is not null then
    if new.parent_role_id = new.id then
      raise exception 'A structural object cannot contain itself.';
    end if;

    select r.is_circle into v_parent_is_circle
    from public.roles r
    where r.id = new.parent_role_id;

    if not found then
      raise exception 'Parent structural object not found.';
    end if;
    if not v_parent_is_circle then
      raise exception 'Only a circle can contain roles or other circles.';
    end if;

    if exists (
      with recursive ancestors as (
        select r.id, r.parent_role_id
        from public.roles r
        where r.id = new.parent_role_id
        union all
        select r.id, r.parent_role_id
        from public.roles r
        join ancestors a on r.id = a.parent_role_id
      )
      select 1 from ancestors where id = new.id
    ) then
      raise exception 'A circle cannot be moved inside itself or one of its descendants.';
    end if;
  end if;

  if not new.is_circle and exists (
    select 1 from public.roles child where child.parent_role_id = new.id
  ) then
    raise exception 'A circle containing structural objects cannot be changed into a role.';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_role_hierarchy() from public;

drop trigger if exists validate_role_hierarchy on public.roles;
create trigger validate_role_hierarchy
before insert or update of parent_role_id, is_circle on public.roles
for each row execute function public.validate_role_hierarchy();

-- The existing governance acceptance function remains authoritative for creating,
-- amending and removing role records. This trigger applies only the new hierarchy
-- fields from the accepted effect in the same transaction.
create or replace function public.apply_accepted_role_hierarchy_effect()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effect jsonb;
  v_role jsonb;
  v_operation text;
  v_target_id uuid;
begin
  if new.stage <> 'accepted' or old.stage = 'accepted' then
    return new;
  end if;

  v_effect := new.governance_effect;
  if v_effect is null or v_effect ->> 'kind' <> 'role' then
    return new;
  end if;

  v_operation := v_effect ->> 'operation';
  if v_operation not in ('create', 'amend') then
    return new;
  end if;

  v_target_id := nullif(v_effect ->> 'targetId', '')::uuid;
  v_role := v_effect -> 'role';
  if v_target_id is null or v_role is null then
    raise exception 'Accepted role governance effect is incomplete.';
  end if;

  update public.roles
  set is_circle = case
        when v_role ? 'isCircle' then coalesce((v_role ->> 'isCircle')::boolean, false)
        else is_circle
      end,
      parent_role_id = case
        when v_role ? 'parentId' then nullif(v_role ->> 'parentId', '')::uuid
        else parent_role_id
      end,
      updated_at = now()
  where id = v_target_id;

  if not found then
    raise exception 'Role created or amended by governance was not found.';
  end if;

  return new;
end;
$$;

revoke all on function public.apply_accepted_role_hierarchy_effect() from public;

drop trigger if exists apply_accepted_role_hierarchy_effect on public.governance_proposals;
create trigger apply_accepted_role_hierarchy_effect
after update of stage on public.governance_proposals
for each row execute function public.apply_accepted_role_hierarchy_effect();
