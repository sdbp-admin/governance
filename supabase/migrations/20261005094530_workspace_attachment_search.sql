-- Direct attachment reads are intentionally revoked. Search only returns parent
-- references; the existing load_work_attachments RPC remains the content reader.
create function public.search_workspace_attachments(search_phrase text)
returns table (id uuid, project_id uuid, tension_id uuid, board_post_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid;
  phrase text := lower(btrim(coalesce(search_phrase,'')));
begin
  if auth.uid() is null or not public.is_board_member() then
    raise exception 'Active membership required.';
  end if;
  if length(phrase) < 2 or length(phrase) > 200 then
    raise exception 'Use a phrase between 2 and 200 characters.';
  end if;
  actor := public.activity_actor_id();
  return query
    select a.id,a.project_id,a.tension_id,a.board_post_id
    from public.work_attachments a
    where a.removed_at is null
      and (strpos(lower(a.title),phrase)>0 or strpos(lower(coalesce(a.url,'')),phrase)>0)
      and not (a.project_id is not null and a.added_by <> actor and exists (
        select 1 from public.project_conflicts c
        where c.project_id=a.project_id and c.ended_at is null
          and c.person_id in (actor,a.added_by)
      ))
    order by a.created_at desc,a.id
    limit 31;
end;
$$;
revoke all on function public.search_workspace_attachments(text) from public, anon;
grant execute on function public.search_workspace_attachments(text) to authenticated;
