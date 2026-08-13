-- SDBP Workspace: lightweight work attachments and explicit human urgency
-- Files and links belong to the project/tension they support. Urgency is a human
-- signal from the tension-holder, not an algorithmic priority score.

alter table public.tensions
  add column if not exists is_urgent boolean not null default false;

create or replace function public.set_tension_urgency(
  target_tension_id uuid,
  urgent boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_raiser uuid;
  v_status text;
  v_title text;
  v_old boolean;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();

  select t.raiser_id, t.status, t.title, t.is_urgent
    into v_raiser, v_status, v_title, v_old
  from public.tensions t
  where t.id = target_tension_id
  for update;

  if not found then raise exception 'Tension not found.'; end if;
  if v_actor is distinct from v_raiser then
    raise exception 'Only the person who raised the tension can change its urgency.';
  end if;
  if v_status = 'resolved' then
    raise exception 'A resolved tension cannot be marked urgent.';
  end if;

  if v_old is distinct from urgent then
    update public.tensions
    set is_urgent = urgent
    where id = target_tension_id;

    perform public.write_activity(
      case when urgent then 'tension_marked_urgent' else 'tension_urgency_removed' end,
      'tension',
      target_tension_id,
      case when urgent then 'Marked tension urgent: ' else 'Removed urgent flag from tension: ' end || v_title
    );
  end if;
end;
$$;

revoke all on function public.set_tension_urgency(uuid, boolean) from public;
grant execute on function public.set_tension_urgency(uuid, boolean) to authenticated;

create table if not exists public.work_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  tension_id uuid references public.tensions(id) on delete cascade,
  attachment_kind text not null check (attachment_kind in ('file', 'link')),
  title text not null check (nullif(trim(title), '') is not null),
  url text,
  storage_path text,
  mime_type text,
  file_size bigint,
  added_by uuid not null references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references public.people(id) on delete set null,
  constraint work_attachment_one_parent check (
    (case when project_id is null then 0 else 1 end) +
    (case when tension_id is null then 0 else 1 end) = 1
  ),
  constraint work_attachment_payload check (
    (attachment_kind = 'link' and url is not null and storage_path is null)
    or
    (attachment_kind = 'file' and storage_path is not null and url is null)
  )
);

create index if not exists work_attachments_project_active
  on public.work_attachments(project_id, created_at desc)
  where removed_at is null and project_id is not null;

create index if not exists work_attachments_tension_active
  on public.work_attachments(tension_id, created_at desc)
  where removed_at is null and tension_id is not null;

alter table public.work_attachments enable row level security;
grant select on public.work_attachments to authenticated;
revoke insert, update, delete on public.work_attachments from authenticated;

drop policy if exists "board members read work attachments" on public.work_attachments;
create policy "board members read work attachments"
on public.work_attachments
for select
to authenticated
using (public.is_board_member());

create or replace function public.assert_work_attachment_parent(
  target_kind text,
  target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_kind = 'project' then
    if not exists (select 1 from public.projects p where p.id = target_id) then
      raise exception 'Project not found.';
    end if;
  elsif target_kind = 'tension' then
    if not exists (select 1 from public.tensions t where t.id = target_id) then
      raise exception 'Tension not found.';
    end if;
  else
    raise exception 'Unknown attachment parent.';
  end if;
end;
$$;

revoke all on function public.assert_work_attachment_parent(text, uuid) from public;

create or replace function public.add_work_link(
  target_kind text,
  target_id uuid,
  link_title text,
  link_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid;
  v_title text;
  v_url text;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  perform public.assert_work_attachment_parent(target_kind, target_id);

  v_title := nullif(trim(link_title), '');
  v_url := nullif(trim(link_url), '');
  if v_title is null then raise exception 'Link title is required.'; end if;
  if v_url is null or v_url !~* '^https?://' then raise exception 'Enter a valid http or https link.'; end if;
  v_actor := public.activity_actor_id();

  insert into public.work_attachments (
    project_id, tension_id, attachment_kind, title, url, added_by
  ) values (
    case when target_kind = 'project' then target_id else null end,
    case when target_kind = 'tension' then target_id else null end,
    'link', v_title, v_url, v_actor
  ) returning id into v_id;

  perform public.write_activity(
    'work_link_added', target_kind, target_id,
    'Added work link: ' || v_title,
    jsonb_build_object('attachment_id', v_id, 'url', v_url)
  );

  return v_id;
end;
$$;

revoke all on function public.add_work_link(text, uuid, text, text) from public;
grant execute on function public.add_work_link(text, uuid, text, text) to authenticated;

create or replace function public.register_work_file(
  target_kind text,
  target_id uuid,
  file_title text,
  file_storage_path text,
  file_mime_type text default null,
  file_size_bytes bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid;
  v_title text;
  v_prefix text;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  perform public.assert_work_attachment_parent(target_kind, target_id);

  v_title := nullif(trim(file_title), '');
  if v_title is null then raise exception 'File title is required.'; end if;
  v_prefix := 'work/' || target_kind || '/' || target_id::text || '/';
  if file_storage_path is null or position(v_prefix in file_storage_path) <> 1 then
    raise exception 'Invalid working-file storage path.';
  end if;
  v_actor := public.activity_actor_id();

  insert into public.work_attachments (
    project_id, tension_id, attachment_kind, title, storage_path,
    mime_type, file_size, added_by
  ) values (
    case when target_kind = 'project' then target_id else null end,
    case when target_kind = 'tension' then target_id else null end,
    'file', v_title, file_storage_path,
    nullif(trim(coalesce(file_mime_type, '')), ''), file_size_bytes, v_actor
  ) returning id into v_id;

  perform public.write_activity(
    'work_file_added', target_kind, target_id,
    'Uploaded work file: ' || v_title,
    jsonb_build_object('attachment_id', v_id)
  );

  return v_id;
end;
$$;

revoke all on function public.register_work_file(text, uuid, text, text, text, bigint) from public;
grant execute on function public.register_work_file(text, uuid, text, text, text, bigint) to authenticated;

create or replace function public.edit_work_link(
  target_attachment_id uuid,
  link_title text,
  link_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.work_attachments%rowtype;
  v_title text;
  v_url text;
  v_subject_type text;
  v_subject_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;

  select * into v_row from public.work_attachments
  where id = target_attachment_id and removed_at is null
  for update;
  if not found then raise exception 'Attachment not found.'; end if;
  if v_row.attachment_kind <> 'link' then raise exception 'This attachment is not a link.'; end if;

  v_title := nullif(trim(link_title), '');
  v_url := nullif(trim(link_url), '');
  if v_title is null then raise exception 'Link title is required.'; end if;
  if v_url is null or v_url !~* '^https?://' then raise exception 'Enter a valid http or https link.'; end if;

  update public.work_attachments
  set title = v_title, url = v_url, updated_at = now()
  where id = target_attachment_id;

  v_subject_type := case when v_row.project_id is not null then 'project' else 'tension' end;
  v_subject_id := coalesce(v_row.project_id, v_row.tension_id);
  perform public.write_activity(
    'work_link_edited', v_subject_type, v_subject_id,
    'Edited work link: ' || v_title,
    jsonb_build_object('attachment_id', target_attachment_id, 'url', v_url)
  );
end;
$$;

revoke all on function public.edit_work_link(uuid, text, text) from public;
grant execute on function public.edit_work_link(uuid, text, text) to authenticated;

create or replace function public.replace_work_file(
  target_attachment_id uuid,
  file_title text,
  file_storage_path text,
  file_mime_type text default null,
  file_size_bytes bigint default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.work_attachments%rowtype;
  v_title text;
  v_subject_type text;
  v_subject_id uuid;
  v_prefix text;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;

  select * into v_row from public.work_attachments
  where id = target_attachment_id and removed_at is null
  for update;
  if not found then raise exception 'Attachment not found.'; end if;
  if v_row.attachment_kind <> 'file' then raise exception 'This attachment is not a file.'; end if;

  v_subject_type := case when v_row.project_id is not null then 'project' else 'tension' end;
  v_subject_id := coalesce(v_row.project_id, v_row.tension_id);
  v_title := nullif(trim(file_title), '');
  if v_title is null then raise exception 'File title is required.'; end if;
  v_prefix := 'work/' || v_subject_type || '/' || v_subject_id::text || '/';
  if file_storage_path is null or position(v_prefix in file_storage_path) <> 1 then
    raise exception 'Invalid working-file storage path.';
  end if;

  update public.work_attachments
  set title = v_title,
      storage_path = file_storage_path,
      mime_type = nullif(trim(coalesce(file_mime_type, '')), ''),
      file_size = file_size_bytes,
      updated_at = now()
  where id = target_attachment_id;

  perform public.write_activity(
    'work_file_replaced', v_subject_type, v_subject_id,
    'Replaced work file: ' || v_title,
    jsonb_build_object('attachment_id', target_attachment_id)
  );
end;
$$;

revoke all on function public.replace_work_file(uuid, text, text, text, bigint) from public;
grant execute on function public.replace_work_file(uuid, text, text, text, bigint) to authenticated;

create or replace function public.remove_work_attachment(
  target_attachment_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.work_attachments%rowtype;
  v_actor uuid;
  v_subject_type text;
  v_subject_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();

  select * into v_row from public.work_attachments
  where id = target_attachment_id and removed_at is null
  for update;
  if not found then raise exception 'Attachment not found.'; end if;

  update public.work_attachments
  set removed_at = now(), removed_by = v_actor, updated_at = now()
  where id = target_attachment_id;

  v_subject_type := case when v_row.project_id is not null then 'project' else 'tension' end;
  v_subject_id := coalesce(v_row.project_id, v_row.tension_id);
  perform public.write_activity(
    'work_attachment_removed', v_subject_type, v_subject_id,
    'Removed ' || v_row.attachment_kind || ': ' || v_row.title,
    jsonb_build_object('attachment_id', target_attachment_id)
  );
end;
$$;

revoke all on function public.remove_work_attachment(uuid) from public;
grant execute on function public.remove_work_attachment(uuid) to authenticated;
