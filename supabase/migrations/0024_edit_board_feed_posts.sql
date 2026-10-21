-- SDBP Workspace: allow Board Feed authors to correct their own posts.
-- The post keeps its original identity and created_at timestamp; edited_at records the correction.

alter table public.board_posts
  add column if not exists edited_at timestamptz;

create or replace function public.edit_board_post(target_post_id uuid, post_body text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_author uuid;
  v_old_body text;
  v_new_body text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_new_body := trim(coalesce(post_body, ''));
  if nullif(v_new_body, '') is null then
    raise exception 'Post cannot be empty.';
  end if;

  v_actor := public.activity_actor_id();

  select p.author_id, p.body
    into v_author, v_old_body
  from public.board_posts p
  where p.id = target_post_id
  for update;

  if not found then
    raise exception 'Post not found.';
  end if;

  if v_author is distinct from v_actor then
    raise exception 'Only the original poster can edit this Board Feed post.';
  end if;

  if v_old_body is not distinct from v_new_body then
    return;
  end if;

  update public.board_posts
  set body = v_new_body,
      edited_at = now()
  where id = target_post_id;

  perform public.write_activity(
    'board_post_edited',
    'board_post',
    target_post_id,
    'Edited Board Feed post'
  );
end;
$$;

revoke all on function public.edit_board_post(uuid, text) from public;
grant execute on function public.edit_board_post(uuid, text) to authenticated;
