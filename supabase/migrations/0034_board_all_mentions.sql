-- @all is communication attention, using the same stored recipients and signals
-- as direct board mentions. No request or operational obligation is created.
begin;

create or replace function public.create_board_post_with_all(post_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentions uuid[];
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;

  -- A direct mention covered by @all is already in this set. The existing writer
  -- also validates active recipients and excludes the authenticated author.
  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions
  from public.people p
  where p.active = true and p.id <> public.activity_actor_id();

  return public.create_board_post(post_body, v_mentions);
end;
$$;

revoke all on function public.create_board_post_with_all(text) from public;
grant execute on function public.create_board_post_with_all(text) to authenticated;

create or replace function public.add_board_post_comment_with_all(target_post_id uuid, comment_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentions uuid[];
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;

  select coalesce(array_agg(distinct p.id), '{}'::uuid[]) into v_mentions
  from public.people p
  where p.active = true and p.id <> public.activity_actor_id();

  -- Preserve the existing per-post open-signal dedupe and comment relationship.
  return public.add_board_post_comment(target_post_id, comment_body, v_mentions);
end;
$$;

revoke all on function public.add_board_post_comment_with_all(uuid, text) from public;
grant execute on function public.add_board_post_comment_with_all(uuid, text) to authenticated;

commit;
