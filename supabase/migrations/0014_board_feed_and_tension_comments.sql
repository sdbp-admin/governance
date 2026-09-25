-- SDBP Workspace: lightweight tension comments and one persistent Board Feed.
-- This is shared communication memory, not a chat system: no channels, DMs or
-- real-time presence. Mentions create explicit My Attention signals.

create table if not exists public.tension_comments (
  id uuid primary key default gen_random_uuid(),
  tension_id uuid not null references public.tensions(id) on delete cascade,
  author_id uuid not null references public.people(id) on delete restrict,
  body text not null check (nullif(trim(body), '') is not null),
  created_at timestamptz not null default now()
);

create index if not exists tension_comments_tension_created
  on public.tension_comments(tension_id, created_at asc);

alter table public.tension_comments enable row level security;
grant select on public.tension_comments to authenticated;
revoke insert, update, delete on public.tension_comments from authenticated;

drop policy if exists "board members read tension comments" on public.tension_comments;
create policy "board members read tension comments"
on public.tension_comments
for select
to authenticated
using (public.is_board_member());

create table if not exists public.board_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.people(id) on delete restrict,
  body text not null check (nullif(trim(body), '') is not null),
  mentioned_ids uuid[] not null default '{}',
  is_pinned boolean not null default false,
  pinned_by uuid references public.people(id) on delete set null,
  pinned_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists board_posts_feed_order
  on public.board_posts(is_pinned desc, created_at desc);

create table if not exists public.board_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.board_posts(id) on delete cascade,
  author_id uuid not null references public.people(id) on delete restrict,
  body text not null check (nullif(trim(body), '') is not null),
  mentioned_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists board_post_comments_post_created
  on public.board_post_comments(post_id, created_at asc);

alter table public.board_posts enable row level security;
alter table public.board_post_comments enable row level security;
grant select on public.board_posts, public.board_post_comments to authenticated;
revoke insert, update, delete on public.board_posts, public.board_post_comments from authenticated;

drop policy if exists "board members read board posts" on public.board_posts;
create policy "board members read board posts"
on public.board_posts
for select
to authenticated
using (public.is_board_member());

drop policy if exists "board members read board post comments" on public.board_post_comments;
create policy "board members read board post comments"
on public.board_post_comments
for select
to authenticated
using (public.is_board_member());

-- Extend attention signals without changing the existing project/tension projections.
alter table public.attention_signals
  add column if not exists board_post_id uuid references public.board_posts(id) on delete cascade;

alter table public.attention_signals
  drop constraint if exists attention_signals_signal_type_check;
alter table public.attention_signals
  add constraint attention_signals_signal_type_check
  check (signal_type in ('tension_need', 'project_comment', 'tension_comment', 'board_feed_mention'));

create unique index if not exists attention_one_open_tension_comment
  on public.attention_signals(recipient_id, tension_id, signal_type)
  where acknowledged_at is null and signal_type = 'tension_comment' and tension_id is not null;

create unique index if not exists attention_one_open_board_feed_mention
  on public.attention_signals(recipient_id, board_post_id, signal_type)
  where acknowledged_at is null and signal_type = 'board_feed_mention' and board_post_id is not null;

create or replace function public.add_tension_comment(target_tension_id uuid, comment_body text)
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
  v_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if nullif(trim(coalesce(comment_body, '')), '') is null then raise exception 'Comment cannot be empty.'; end if;

  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');

  select t.raiser_id, t.title into v_raiser, v_title
  from public.tensions t where t.id = target_tension_id;
  if not found then raise exception 'Tension not found.'; end if;

  insert into public.tension_comments (tension_id, author_id, body)
  values (target_tension_id, v_actor, trim(comment_body))
  returning id into v_id;

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
      insert into public.attention_signals (recipient_id, tension_id, project_id, board_post_id, signal_type, message, created_by)
      values (v_raiser, target_tension_id, null, null, 'tension_comment',
        'New comment from ' || v_actor_name || ' on tension “' || v_title || '”.', v_actor);
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.add_tension_comment(uuid, text) from public;
grant execute on function public.add_tension_comment(uuid, text) to authenticated;

create or replace function public.create_board_post(post_body text, mention_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_mentions uuid[];
  v_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if nullif(trim(coalesce(post_body, '')), '') is null then raise exception 'Post cannot be empty.'; end if;

  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions
  from public.people p
  where p.active = true and p.id = any(coalesce(mention_ids, '{}'::uuid[])) and p.id <> v_actor;

  insert into public.board_posts (author_id, body, mentioned_ids)
  values (v_actor, trim(post_body), v_mentions)
  returning id into v_id;

  insert into public.attention_signals (recipient_id, tension_id, project_id, board_post_id, signal_type, message, created_by)
  select p.id, null, null, v_id, 'board_feed_mention', v_actor_name || ' mentioned you in the Board Feed.', v_actor
  from public.people p
  where p.active = true and p.id = any(v_mentions);

  perform public.write_activity('board_post_created', 'board_post', v_id,
    'Posted to Board Feed', jsonb_build_object('mentioned_ids', v_mentions));
  return v_id;
end;
$$;

revoke all on function public.create_board_post(text, uuid[]) from public;
grant execute on function public.create_board_post(text, uuid[]) to authenticated;

create or replace function public.add_board_post_comment(target_post_id uuid, comment_body text, mention_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_mentions uuid[];
  v_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if nullif(trim(coalesce(comment_body, '')), '') is null then raise exception 'Comment cannot be empty.'; end if;
  if not exists (select 1 from public.board_posts p where p.id = target_post_id) then raise exception 'Post not found.'; end if;

  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions
  from public.people p
  where p.active = true and p.id = any(coalesce(mention_ids, '{}'::uuid[])) and p.id <> v_actor;

  insert into public.board_post_comments (post_id, author_id, body, mentioned_ids)
  values (target_post_id, v_actor, trim(comment_body), v_mentions)
  returning id into v_id;

  -- A post has at most one open mention signal per recipient. A later comment mention
  -- updates that signal rather than creating notification clutter.
  update public.attention_signals s
  set message = v_actor_name || ' mentioned you in a Board Feed comment.',
      created_by = v_actor,
      created_at = now()
  where s.board_post_id = target_post_id
    and s.signal_type = 'board_feed_mention'
    and s.acknowledged_at is null
    and s.recipient_id = any(v_mentions);

  insert into public.attention_signals (recipient_id, tension_id, project_id, board_post_id, signal_type, message, created_by)
  select p.id, null, null, target_post_id, 'board_feed_mention', v_actor_name || ' mentioned you in a Board Feed comment.', v_actor
  from public.people p
  where p.active = true and p.id = any(v_mentions)
    and not exists (
      select 1 from public.attention_signals s
      where s.recipient_id = p.id and s.board_post_id = target_post_id
        and s.signal_type = 'board_feed_mention' and s.acknowledged_at is null
    );

  return v_id;
end;
$$;

revoke all on function public.add_board_post_comment(uuid, text, uuid[]) from public;
grant execute on function public.add_board_post_comment(uuid, text, uuid[]) to authenticated;

create or replace function public.set_board_post_pinned(target_post_id uuid, pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_old boolean;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();
  select is_pinned into v_old from public.board_posts where id = target_post_id for update;
  if not found then raise exception 'Post not found.'; end if;
  if v_old is distinct from pinned then
    update public.board_posts set is_pinned = pinned,
      pinned_by = case when pinned then v_actor else null end,
      pinned_at = case when pinned then now() else null end
    where id = target_post_id;
    perform public.write_activity(case when pinned then 'board_post_pinned' else 'board_post_unpinned' end,
      'board_post', target_post_id, case when pinned then 'Pinned Board Feed post' else 'Unpinned Board Feed post' end);
  end if;
end;
$$;

revoke all on function public.set_board_post_pinned(uuid, boolean) from public;
grant execute on function public.set_board_post_pinned(uuid, boolean) to authenticated;

-- Board Feed posts can use the existing private Files & links mechanism.
alter table public.work_attachments
  add column if not exists board_post_id uuid references public.board_posts(id) on delete cascade;

alter table public.work_attachments drop constraint if exists work_attachment_one_parent;
alter table public.work_attachments add constraint work_attachment_one_parent check (
  (case when project_id is null then 0 else 1 end) +
  (case when tension_id is null then 0 else 1 end) +
  (case when board_post_id is null then 0 else 1 end) = 1
);

create index if not exists work_attachments_board_post_active
  on public.work_attachments(board_post_id, created_at desc)
  where removed_at is null and board_post_id is not null;

create or replace function public.assert_work_attachment_parent(target_kind text, target_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_kind = 'project' then
    if not exists (select 1 from public.projects where id = target_id) then raise exception 'Project not found.'; end if;
  elsif target_kind = 'tension' then
    if not exists (select 1 from public.tensions where id = target_id) then raise exception 'Tension not found.'; end if;
  elsif target_kind = 'board_post' then
    if not exists (select 1 from public.board_posts where id = target_id) then raise exception 'Board Feed post not found.'; end if;
  else
    raise exception 'Unknown attachment parent.';
  end if;
end;
$$;

revoke all on function public.assert_work_attachment_parent(text, uuid) from public;

create or replace function public.add_work_link(target_kind text, target_id uuid, link_title text, link_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_actor uuid; v_title text; v_url text;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  perform public.assert_work_attachment_parent(target_kind, target_id);
  v_title := nullif(trim(link_title), ''); v_url := nullif(trim(link_url), '');
  if v_title is null then raise exception 'Link title is required.'; end if;
  if v_url is null or v_url !~* '^https?://' then raise exception 'Enter a valid http or https link.'; end if;
  v_actor := public.activity_actor_id();
  insert into public.work_attachments (project_id, tension_id, board_post_id, attachment_kind, title, url, added_by)
  values (case when target_kind='project' then target_id end, case when target_kind='tension' then target_id end,
    case when target_kind='board_post' then target_id end, 'link', v_title, v_url, v_actor)
  returning id into v_id;
  perform public.write_activity('work_link_added', target_kind, target_id, 'Added work link: ' || v_title,
    jsonb_build_object('attachment_id', v_id, 'url', v_url));
  return v_id;
end;
$$;

revoke all on function public.add_work_link(text, uuid, text, text) from public;
grant execute on function public.add_work_link(text, uuid, text, text) to authenticated;

create or replace function public.register_work_file(target_kind text, target_id uuid, file_title text, file_storage_path text, file_mime_type text default null, file_size_bytes bigint default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid; v_actor uuid; v_title text; v_prefix text;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  perform public.assert_work_attachment_parent(target_kind, target_id);
  v_title := nullif(trim(file_title), ''); if v_title is null then raise exception 'File title is required.'; end if;
  v_prefix := 'work/' || target_kind || '/' || target_id::text || '/';
  if file_storage_path is null or position(v_prefix in file_storage_path) <> 1 then raise exception 'Invalid working-file storage path.'; end if;
  v_actor := public.activity_actor_id();
  insert into public.work_attachments (project_id, tension_id, board_post_id, attachment_kind, title, storage_path, mime_type, file_size, added_by)
  values (case when target_kind='project' then target_id end, case when target_kind='tension' then target_id end,
    case when target_kind='board_post' then target_id end, 'file', v_title, file_storage_path,
    nullif(trim(coalesce(file_mime_type,'')),''), file_size_bytes, v_actor)
  returning id into v_id;
  perform public.write_activity('work_file_added', target_kind, target_id, 'Uploaded work file: ' || v_title,
    jsonb_build_object('attachment_id', v_id));
  return v_id;
end;
$$;

revoke all on function public.register_work_file(text, uuid, text, text, text, bigint) from public;
grant execute on function public.register_work_file(text, uuid, text, text, text, bigint) to authenticated;

create or replace function public.edit_work_link(target_attachment_id uuid, link_title text, link_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.work_attachments%rowtype; v_title text; v_url text; v_subject_type text; v_subject_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  select * into v_row from public.work_attachments where id=target_attachment_id and removed_at is null for update;
  if not found then raise exception 'Attachment not found.'; end if;
  if v_row.attachment_kind <> 'link' then raise exception 'This attachment is not a link.'; end if;
  v_title:=nullif(trim(link_title),''); v_url:=nullif(trim(link_url),'');
  if v_title is null then raise exception 'Link title is required.'; end if;
  if v_url is null or v_url !~* '^https?://' then raise exception 'Enter a valid http or https link.'; end if;
  update public.work_attachments set title=v_title,url=v_url,updated_at=now() where id=target_attachment_id;
  v_subject_type:=case when v_row.project_id is not null then 'project' when v_row.tension_id is not null then 'tension' else 'board_post' end;
  v_subject_id:=coalesce(v_row.project_id,v_row.tension_id,v_row.board_post_id);
  perform public.write_activity('work_link_edited',v_subject_type,v_subject_id,'Edited work link: '||v_title,
    jsonb_build_object('attachment_id',target_attachment_id,'url',v_url));
end;
$$;

revoke all on function public.edit_work_link(uuid, text, text) from public;
grant execute on function public.edit_work_link(uuid, text, text) to authenticated;

create or replace function public.replace_work_file(target_attachment_id uuid, file_title text, file_storage_path text, file_mime_type text default null, file_size_bytes bigint default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.work_attachments%rowtype; v_title text; v_subject_type text; v_subject_id uuid; v_prefix text;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  select * into v_row from public.work_attachments where id=target_attachment_id and removed_at is null for update;
  if not found then raise exception 'Attachment not found.'; end if;
  if v_row.attachment_kind <> 'file' then raise exception 'This attachment is not a file.'; end if;
  v_subject_type:=case when v_row.project_id is not null then 'project' when v_row.tension_id is not null then 'tension' else 'board_post' end;
  v_subject_id:=coalesce(v_row.project_id,v_row.tension_id,v_row.board_post_id);
  v_title:=nullif(trim(file_title),''); if v_title is null then raise exception 'File title is required.'; end if;
  v_prefix:='work/'||v_subject_type||'/'||v_subject_id::text||'/';
  if file_storage_path is null or position(v_prefix in file_storage_path)<>1 then raise exception 'Invalid working-file storage path.'; end if;
  update public.work_attachments set title=v_title,storage_path=file_storage_path,
    mime_type=nullif(trim(coalesce(file_mime_type,'')),''),file_size=file_size_bytes,updated_at=now()
  where id=target_attachment_id;
  perform public.write_activity('work_file_replaced',v_subject_type,v_subject_id,'Replaced work file: '||v_title,
    jsonb_build_object('attachment_id',target_attachment_id));
end;
$$;

revoke all on function public.replace_work_file(uuid, text, text, text, bigint) from public;
grant execute on function public.replace_work_file(uuid, text, text, text, bigint) to authenticated;

create or replace function public.remove_work_attachment(target_attachment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.work_attachments%rowtype; v_actor uuid; v_subject_type text; v_subject_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor:=public.activity_actor_id();
  select * into v_row from public.work_attachments where id=target_attachment_id and removed_at is null for update;
  if not found then raise exception 'Attachment not found.'; end if;
  update public.work_attachments set removed_at=now(),removed_by=v_actor,updated_at=now() where id=target_attachment_id;
  v_subject_type:=case when v_row.project_id is not null then 'project' when v_row.tension_id is not null then 'tension' else 'board_post' end;
  v_subject_id:=coalesce(v_row.project_id,v_row.tension_id,v_row.board_post_id);
  perform public.write_activity('work_attachment_removed',v_subject_type,v_subject_id,
    'Removed '||v_row.attachment_kind||': '||v_row.title,jsonb_build_object('attachment_id',target_attachment_id));
end;
$$;

revoke all on function public.remove_work_attachment(uuid) from public;
grant execute on function public.remove_work_attachment(uuid) to authenticated;
