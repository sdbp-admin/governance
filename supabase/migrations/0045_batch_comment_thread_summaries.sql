-- 0045: One read-only snapshot request for multiple conversation threads.
-- Keeps the existing one-thread RPC unchanged for targeted actions.
-- Read/unread semantics match public.load_comment_thread_summary exactly.
create or replace function public.load_comment_thread_summaries(
  project_ids uuid[] default '{}'::uuid[],
  tension_ids uuid[] default '{}'::uuid[],
  action_ids uuid[] default '{}'::uuid[]
)
returns table (
  thread_type text,
  thread_id uuid,
  total_count bigint,
  unread_count bigint,
  last_seen_at timestamptz
)
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare
  v_actor uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;
  if cardinality(coalesce(project_ids, '{}'::uuid[]))
     + cardinality(coalesce(tension_ids, '{}'::uuid[]))
     + cardinality(coalesce(action_ids, '{}'::uuid[])) > 500 then
    raise exception 'Too many comment threads requested.';
  end if;
  v_actor := public.activity_actor_id();

  return query
    select 'project'::text, p.id, counts.total_count, counts.unread_count, seen.last_seen_at
    from (select distinct unnest(coalesce(project_ids, '{}'::uuid[])) as id) requested
    join public.projects p on p.id = requested.id
    left join public.comment_thread_reads seen on seen.person_id = v_actor
      and seen.thread_type = 'project' and seen.thread_id = p.id
    cross join lateral (
      select count(*)::bigint as total_count,
        count(*) filter (where c.author_id <> v_actor and
          (seen.last_seen_at is null or c.created_at > seen.last_seen_at))::bigint as unread_count
      from public.project_comments c where c.project_id = p.id
    ) counts
  union all
    select 'tension'::text, t.id, counts.total_count, counts.unread_count, seen.last_seen_at
    from (select distinct unnest(coalesce(tension_ids, '{}'::uuid[])) as id) requested
    join public.tensions t on t.id = requested.id
    left join public.comment_thread_reads seen on seen.person_id = v_actor
      and seen.thread_type = 'tension' and seen.thread_id = t.id
    cross join lateral (
      select count(*)::bigint as total_count,
        count(*) filter (where c.author_id <> v_actor and
          (seen.last_seen_at is null or c.created_at > seen.last_seen_at))::bigint as unread_count
      from public.tension_comments c where c.tension_id = t.id
    ) counts
  union all
    select 'action'::text, a.id, counts.total_count, counts.unread_count, seen.last_seen_at
    from (select distinct unnest(coalesce(action_ids, '{}'::uuid[])) as id) requested
    join public.actions a on a.id = requested.id
    left join public.comment_thread_reads seen on seen.person_id = v_actor
      and seen.thread_type = 'action' and seen.thread_id = a.id
    cross join lateral (
      select count(*)::bigint as total_count,
        count(*) filter (where c.author_id <> v_actor and
          (seen.last_seen_at is null or c.created_at > seen.last_seen_at))::bigint as unread_count
      from public.action_comments c where c.action_id = a.id
    ) counts;
end;
$function$;

revoke all on function public.load_comment_thread_summaries(uuid[],uuid[],uuid[]) from public, anon, authenticated;
grant execute on function public.load_comment_thread_summaries(uuid[],uuid[],uuid[]) to authenticated;
