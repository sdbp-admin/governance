-- SDBP Governance activity ledger and reversible records
-- Board members remain trusted to act. Consequential changes are attributable,
-- visible to the board and, for documents, reversible rather than destructive.

alter table public.records
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references public.people(id) on delete set null;

create index if not exists records_deleted_at
  on public.records(deleted_at)
  where deleted_at is not null;

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.people(id) on delete set null,
  actor_name text not null default 'System',
  event_type text not null,
  subject_type text not null,
  subject_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_log_created_at
  on public.activity_log(created_at desc);

create index if not exists activity_log_subject
  on public.activity_log(subject_type, subject_id, created_at desc);

alter table public.activity_log enable row level security;

grant select on public.activity_log to authenticated;
revoke insert, update, delete on public.activity_log from authenticated;

drop policy if exists "board members read activity" on public.activity_log;
create policy "board members read activity"
on public.activity_log
for select
to authenticated
using (public.is_board_member());

create or replace function public.activity_actor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.people p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function public.activity_actor_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.name
  from public.people p
  where p.auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function public.activity_actor_id() from public;
revoke all on function public.activity_actor_name() from public;

create or replace function public.write_activity(
  p_event_type text,
  p_subject_type text,
  p_subject_id uuid,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_log (
    actor_id,
    actor_name,
    event_type,
    subject_type,
    subject_id,
    summary,
    metadata
  )
  values (
    public.activity_actor_id(),
    coalesce(public.activity_actor_name(), 'System'),
    p_event_type,
    p_subject_type,
    p_subject_id,
    p_summary,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.write_activity(text, text, uuid, text, jsonb) from public;

-- Records use reversible removal. Attribution is derived from the authenticated
-- caller rather than trusting a client-supplied deleted_by value.
create or replace function public.maintain_record_deletion_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    new.deleted_by := public.activity_actor_id();
  elsif old.deleted_at is not null and new.deleted_at is null then
    new.deleted_by := null;
  end if;
  return new;
end;
$$;

revoke all on function public.maintain_record_deletion_metadata() from public;

drop trigger if exists maintain_record_deletion_metadata on public.records;
create trigger maintain_record_deletion_metadata
before update of deleted_at on public.records
for each row execute function public.maintain_record_deletion_metadata();

create or replace function public.log_record_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.write_activity(
      'record_removed',
      'record',
      new.id,
      'Removed ' || replace(new.record_type, '_', ' ') || ': ' || new.title,
      jsonb_build_object('record_type', new.record_type)
    );
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform public.write_activity(
      'record_restored',
      'record',
      new.id,
      'Restored ' || replace(new.record_type, '_', ' ') || ': ' || new.title,
      jsonb_build_object('record_type', new.record_type)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_record_activity() from public;

drop trigger if exists log_record_activity on public.records;
create trigger log_record_activity
after update of deleted_at on public.records
for each row execute function public.log_record_activity();

-- A direct DELETE against a real stored record is converted to the same reversible
-- removal. Empty record shells created during a failed upload may still be cleaned up.
create or replace function public.prevent_record_hard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.record_versions rv
    where rv.record_id = old.id
  ) then
    update public.records
    set deleted_at = coalesce(deleted_at, now()),
        updated_at = now()
    where id = old.id;
    return null;
  end if;

  return old;
end;
$$;

revoke all on function public.prevent_record_hard_delete() from public;

drop trigger if exists prevent_record_hard_delete on public.records;
create trigger prevent_record_hard_delete
before delete on public.records
for each row execute function public.prevent_record_hard_delete();

create or replace function public.log_record_version_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_type text;
  v_event text;
  v_verb text;
begin
  select r.title, r.record_type
    into v_title, v_type
  from public.records r
  where r.id = new.record_id;

  if v_title is null then
    return new;
  end if;

  if new.version_label = '1' then
    v_event := 'record_added';
    v_verb := 'Added ';
  else
    v_event := 'record_updated';
    v_verb := 'Updated ';
  end if;

  perform public.write_activity(
    v_event,
    'record',
    new.record_id,
    v_verb || replace(v_type, '_', ' ') || ': ' || v_title,
    jsonb_build_object('record_type', v_type, 'version', new.version_label)
  );
  return new;
end;
$$;

revoke all on function public.log_record_version_activity() from public;

drop trigger if exists log_record_version_activity on public.record_versions;
create trigger log_record_version_activity
after insert on public.record_versions
for each row execute function public.log_record_version_activity();

-- Workspace access changes.
create or replace function public.log_people_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_activity(
      'member_invited',
      'person',
      new.id,
      'Added workspace invitation for ' || new.name,
      jsonb_build_object('email', new.email)
    );
    return new;
  end if;

  if old.active = true and new.active = false then
    perform public.write_activity(
      'member_removed',
      'person',
      new.id,
      'Removed workspace access for ' || new.name,
      jsonb_build_object('email', new.email)
    );
  elsif old.active = false and new.active = true then
    perform public.write_activity(
      'member_reactivated',
      'person',
      new.id,
      'Restored workspace access for ' || new.name,
      jsonb_build_object('email', new.email)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_people_activity() from public;

drop trigger if exists log_people_activity on public.people;
create trigger log_people_activity
after insert or update of active on public.people
for each row execute function public.log_people_activity();

-- Role definitions and assignments.
create or replace function public.log_role_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_activity('role_added', 'role', new.id, 'Added role: ' || new.title);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_activity('role_removed', 'role', old.id, 'Removed role: ' || old.title);
    return old;
  end if;

  if row(old.title, old.category, old.purpose, old.scope, old.responsibilities, old.accountabilities, old.source, old.definition_status)
     is distinct from
     row(new.title, new.category, new.purpose, new.scope, new.responsibilities, new.accountabilities, new.source, new.definition_status) then
    perform public.write_activity('role_updated', 'role', new.id, 'Updated role: ' || new.title);
  end if;
  return new;
end;
$$;

revoke all on function public.log_role_activity() from public;

drop trigger if exists log_role_activity on public.roles;
create trigger log_role_activity
after insert or update or delete on public.roles
for each row execute function public.log_role_activity();

create or replace function public.log_role_assignment_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_person_id uuid;
  v_role_title text;
  v_person_name text;
  v_president_role_id uuid;
begin
  if tg_op = 'DELETE' then
    v_role_id := old.role_id;
    v_person_id := old.person_id;
  else
    v_role_id := new.role_id;
    v_person_id := new.person_id;
  end if;

  select r.title into v_role_title from public.roles r where r.id = v_role_id;
  select p.name into v_person_name from public.people p where p.id = v_person_id;
  v_president_role_id := public.president_role_id();

  if v_role_id = v_president_role_id then
    if tg_op = 'INSERT' and new.ends_on is null then
      perform public.write_activity(
        'presidency_transferred',
        'role',
        v_role_id,
        'Transferred Presidency to ' || coalesce(v_person_name, 'Unknown member'),
        jsonb_build_object('person_id', v_person_id)
      );
    end if;

    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' and new.ends_on is null then
    perform public.write_activity(
      'role_assigned',
      'role',
      v_role_id,
      'Assigned ' || coalesce(v_person_name, 'Unknown member') || ' to ' || coalesce(v_role_title, 'role'),
      jsonb_build_object('person_id', v_person_id)
    );
  elsif tg_op = 'UPDATE' and old.ends_on is null and new.ends_on is not null then
    perform public.write_activity(
      'role_assignment_ended',
      'role',
      v_role_id,
      'Ended ' || coalesce(v_person_name, 'Unknown member') || '''s ' || coalesce(v_role_title, 'role') || ' assignment',
      jsonb_build_object('person_id', v_person_id)
    );
  elsif tg_op = 'DELETE' and old.ends_on is null then
    perform public.write_activity(
      'role_assignment_removed',
      'role',
      v_role_id,
      'Removed ' || coalesce(v_person_name, 'Unknown member') || ' from ' || coalesce(v_role_title, 'role'),
      jsonb_build_object('person_id', v_person_id)
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.log_role_assignment_activity() from public;

drop trigger if exists log_role_assignment_activity on public.role_assignments;
create trigger log_role_assignment_activity
after insert or update or delete on public.role_assignments
for each row execute function public.log_role_assignment_activity();

-- Operational outcomes. Deliberately log meaningful state changes rather than every
-- edit, so the ledger remains useful instead of becoming click telemetry.
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
  end if;
  return new;
end;
$$;

revoke all on function public.log_project_activity() from public;

drop trigger if exists log_project_activity on public.projects;
create trigger log_project_activity
after insert or update of status on public.projects
for each row execute function public.log_project_activity();

create or replace function public.log_action_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_activity('action_added', 'action', new.id, 'Added action: ' || new.title);
  elsif old.status is distinct from new.status and new.status = 'done' then
    perform public.write_activity('action_completed', 'action', new.id, 'Completed action: ' || new.title);
  end if;
  return new;
end;
$$;

revoke all on function public.log_action_activity() from public;

drop trigger if exists log_action_activity on public.actions;
create trigger log_action_activity
after insert or update of status on public.actions
for each row execute function public.log_action_activity();

create or replace function public.log_tension_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_activity('tension_raised', 'tension', new.id, 'Raised tension: ' || new.title);
  elsif old.status is distinct from new.status and new.status = 'resolved' then
    perform public.write_activity('tension_resolved', 'tension', new.id, 'Resolved tension: ' || new.title);
  end if;
  return new;
end;
$$;

revoke all on function public.log_tension_activity() from public;

drop trigger if exists log_tension_activity on public.tensions;
create trigger log_tension_activity
after insert or update of status on public.tensions
for each row execute function public.log_tension_activity();

create or replace function public.log_governance_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.stage is distinct from new.stage and new.stage = 'accepted' then
    perform public.write_activity(
      'governance_accepted',
      'governance_proposal',
      new.id,
      'Accepted governance proposal: ' || new.title,
      jsonb_build_object('tension_id', new.tension_id)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_governance_activity() from public;

drop trigger if exists log_governance_activity on public.governance_proposals;
create trigger log_governance_activity
after update of stage on public.governance_proposals
for each row execute function public.log_governance_activity();
