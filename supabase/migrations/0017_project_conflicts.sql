-- SDBP Workspace: project-scoped conflicts of interest.
--
-- A COI belongs to a person in relation to a project. The project itself remains
-- visible. Visible project communication remains a human responsibility; the app
-- creates awareness at the point of posting. Attachment contents are different:
-- an actively conflicted person may see that an attachment exists, but cannot read
-- another person's file/link payload. Contributions from conflicted people remain
-- receivable and are identified to non-conflicted readers by the client.

create table if not exists public.project_conflicts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  reason text not null check (nullif(trim(reason), '') is not null),
  declared_by uuid not null references public.people(id) on delete restrict,
  declared_at timestamptz not null default now(),
  ended_by uuid references public.people(id) on delete set null,
  ended_at timestamptz
);

create unique index if not exists project_conflicts_one_active
  on public.project_conflicts(project_id, person_id)
  where ended_at is null;

create index if not exists project_conflicts_project_active
  on public.project_conflicts(project_id, declared_at desc)
  where ended_at is null;

alter table public.project_conflicts enable row level security;
grant select on public.project_conflicts to authenticated;
revoke insert, update, delete on public.project_conflicts from authenticated;

drop policy if exists "board members read project conflicts" on public.project_conflicts;
create policy "board members read project conflicts"
on public.project_conflicts
for select
to authenticated
using (public.is_board_member());

create or replace function public.declare_project_conflict(
  target_project_id uuid,
  target_person_id uuid,
  conflict_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_person_name text;
  v_project_title text;
  v_reason text;
  v_id uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();
  v_reason := nullif(trim(coalesce(conflict_reason, '')), '');
  if v_reason is null then raise exception 'A reason is required.'; end if;

  select p.name into v_person_name
  from public.people p
  where p.id = target_person_id and p.active = true;
  if not found then raise exception 'Active person not found.'; end if;

  select p.title into v_project_title
  from public.projects p
  where p.id = target_project_id;
  if not found then raise exception 'Project not found.'; end if;

  if exists (
    select 1 from public.project_conflicts c
    where c.project_id = target_project_id
      and c.person_id = target_person_id
      and c.ended_at is null
  ) then
    raise exception 'This person already has an active conflict of interest on this project.';
  end if;

  insert into public.project_conflicts (
    project_id, person_id, reason, declared_by
  ) values (
    target_project_id, target_person_id, v_reason, v_actor
  ) returning id into v_id;

  perform public.write_activity(
    'project_coi_declared',
    'project',
    target_project_id,
    'Declared conflict of interest for ' || v_person_name || ' on project: ' || v_project_title,
    jsonb_build_object('conflict_id', v_id, 'person_id', target_person_id, 'reason', v_reason)
  );

  return v_id;
end;
$$;

revoke all on function public.declare_project_conflict(uuid, uuid, text) from public;
grant execute on function public.declare_project_conflict(uuid, uuid, text) to authenticated;

create or replace function public.end_project_conflict(target_conflict_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_project_id uuid;
  v_person_id uuid;
  v_person_name text;
  v_project_title text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();

  select c.project_id, c.person_id, pe.name, pr.title
    into v_project_id, v_person_id, v_person_name, v_project_title
  from public.project_conflicts c
  join public.people pe on pe.id = c.person_id
  join public.projects pr on pr.id = c.project_id
  where c.id = target_conflict_id
    and c.ended_at is null
  for update of c;

  if not found then raise exception 'Active conflict of interest not found.'; end if;

  update public.project_conflicts
  set ended_at = now(), ended_by = v_actor
  where id = target_conflict_id;

  perform public.write_activity(
    'project_coi_ended',
    'project',
    v_project_id,
    'Ended conflict of interest for ' || v_person_name || ' on project: ' || v_project_title,
    jsonb_build_object('conflict_id', target_conflict_id, 'person_id', v_person_id)
  );
end;
$$;

revoke all on function public.end_project_conflict(uuid) from public;
grant execute on function public.end_project_conflict(uuid) to authenticated;

-- Return the attachment list through a controlled projection. For an actively
-- conflicted viewer, attachment titles and metadata stay visible, while another
-- person's URL/storage path is withheld. This is structural filtering, not content
-- classification.
create or replace function public.load_work_attachments(
  target_kind text,
  target_id uuid
)
returns table (
  id uuid,
  project_id uuid,
  tension_id uuid,
  board_post_id uuid,
  attachment_kind text,
  title text,
  url text,
  storage_path text,
  mime_type text,
  file_size bigint,
  added_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  coi_blocked boolean,
  contributor_conflicted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_viewer_conflicted boolean := false;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();

  if target_kind = 'project' then
    if not exists (select 1 from public.projects p where p.id = target_id) then
      raise exception 'Project not found.';
    end if;

    select exists (
      select 1 from public.project_conflicts c
      where c.project_id = target_id
        and c.person_id = v_actor
        and c.ended_at is null
    ) into v_viewer_conflicted;

    return query
      select
        wa.id,
        wa.project_id,
        wa.tension_id,
        wa.board_post_id,
        wa.attachment_kind,
        wa.title,
        case when v_viewer_conflicted and wa.added_by <> v_actor then null else wa.url end,
        case when v_viewer_conflicted and wa.added_by <> v_actor then null else wa.storage_path end,
        wa.mime_type,
        wa.file_size,
        wa.added_by,
        wa.created_at,
        wa.updated_at,
        (v_viewer_conflicted and wa.added_by <> v_actor) as coi_blocked,
        exists (
          select 1 from public.project_conflicts c
          where c.project_id = target_id
            and c.person_id = wa.added_by
            and c.ended_at is null
        ) as contributor_conflicted
      from public.work_attachments wa
      where wa.project_id = target_id
        and wa.removed_at is null
      order by wa.created_at desc;

  elsif target_kind = 'tension' then
    return query
      select wa.id, wa.project_id, wa.tension_id, wa.board_post_id,
             wa.attachment_kind, wa.title, wa.url, wa.storage_path,
             wa.mime_type, wa.file_size, wa.added_by, wa.created_at, wa.updated_at,
             false, false
      from public.work_attachments wa
      where wa.tension_id = target_id
        and wa.removed_at is null
      order by wa.created_at desc;

  elsif target_kind = 'board_post' then
    return query
      select wa.id, wa.project_id, wa.tension_id, wa.board_post_id,
             wa.attachment_kind, wa.title, wa.url, wa.storage_path,
             wa.mime_type, wa.file_size, wa.added_by, wa.created_at, wa.updated_at,
             false, false
      from public.work_attachments wa
      where wa.board_post_id = target_id
        and wa.removed_at is null
      order by wa.created_at desc;

  else
    raise exception 'Unknown attachment parent.';
  end if;
end;
$$;

revoke all on function public.load_work_attachments(text, uuid) from public;
grant execute on function public.load_work_attachments(text, uuid) to authenticated;

-- Stop exposing link URLs and storage paths through the REST table endpoint. All
-- attachment lists now go through load_work_attachments(). Existing mutation RPCs
-- continue to operate as before.
revoke select on public.work_attachments from authenticated;

-- Storage itself enforces the same boundary for project files. This prevents a
-- conflicted person from bypassing the UI by requesting a signed URL directly.
-- A conflicted contributor can still reopen a file they personally supplied.
create or replace function public.can_read_sdbp_storage_object(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_actor uuid;
  v_project_id uuid;
  v_segment text;
begin
  if object_name !~ '^work/project/[0-9a-fA-F-]{36}/' then
    return true;
  end if;

  v_segment := split_part(object_name, '/', 3);
  begin
    v_project_id := v_segment::uuid;
  exception when invalid_text_representation then
    return false;
  end;

  v_actor := public.activity_actor_id();

  if not exists (
    select 1 from public.project_conflicts c
    where c.project_id = v_project_id
      and c.person_id = v_actor
      and c.ended_at is null
  ) then
    return true;
  end if;

  return exists (
    select 1 from public.work_attachments wa
    where wa.project_id = v_project_id
      and wa.storage_path = object_name
      and wa.added_by = v_actor
      and wa.removed_at is null
  );
end;
$$;

revoke all on function public.can_read_sdbp_storage_object(text) from public;
grant execute on function public.can_read_sdbp_storage_object(text) to authenticated;

drop policy if exists "board members read records files" on storage.objects;
create policy "board members read records files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'sdbp-records'
  and public.is_board_member()
  and public.can_read_sdbp_storage_object(name)
);
