-- SDBP Workspace: allow Board Feed comment authors to correct their own comments.
-- The comment keeps its original identity and created_at timestamp; edited_at records the correction.

alter table public.board_post_comments
  add column if not exists edited_at timestamptz;

create or replace function public.edit_board_post_comment(target_comment_id uuid, comment_body text)
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

  v_new_body := trim(coalesce(comment_body, ''));
  if nullif(v_new_body, '') is null then
    raise exception 'Comment cannot be empty.';
  end if;

  v_actor := public.activity_actor_id();

  select c.author_id, c.body
    into v_author, v_old_body
  from public.board_post_comments c
  where c.id = target_comment_id
  for update;

  if not found then
    raise exception 'Comment not found.';
  end if;

  if v_author is distinct from v_actor then
    raise exception 'Only the original commenter can edit this Board Feed comment.';
  end if;

  if v_old_body is not distinct from v_new_body then
    return;
  end if;

  update public.board_post_comments
  set body = v_new_body,
      edited_at = now()
  where id = target_comment_id;

  perform public.write_activity(
    'board_post_comment_edited',
    'board_post_comment',
    target_comment_id,
    'Edited Board Feed comment'
  );
end;
$$;

revoke all on function public.edit_board_post_comment(uuid, text) from public;
grant execute on function public.edit_board_post_comment(uuid, text) to authenticated;
