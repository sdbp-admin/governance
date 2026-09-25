-- Board Home Screen app: personal Chat read cursor and device push subscriptions.
-- This does not turn ordinary conversation into operational attention.
begin;

create table public.board_chat_reads (
  person_id uuid primary key references public.people(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

-- Existing feed history is the baseline; only later messages become unread.
insert into public.board_chat_reads (person_id, last_seen_at)
select id, now() from public.people where active = true;

alter table public.board_chat_reads enable row level security;
grant select on public.board_chat_reads to authenticated;
revoke insert, update, delete on public.board_chat_reads from authenticated;
create policy "members read own board chat cursor" on public.board_chat_reads
for select to authenticated
using (public.is_board_member() and person_id = public.activity_actor_id());

create or replace function public.board_chat_unread_count()
returns integer language sql stable security definer set search_path = public as $$
  select case when not public.is_board_member() then 0 else (
    select (
      (select count(*) from public.board_posts p
       where p.author_id <> me.id and p.created_at > coalesce(r.last_seen_at, me.created_at))
      +
      (select count(*) from public.board_post_comments c
       where c.author_id <> me.id and c.created_at > coalesce(r.last_seen_at, me.created_at))
    )::integer
    from public.people me
    left join public.board_chat_reads r on r.person_id = me.id
    where me.id = public.activity_actor_id()
  ) end;
$$;
revoke all on function public.board_chat_unread_count() from public;
grant execute on function public.board_chat_unread_count() to authenticated;

create or replace function public.mark_board_chat_seen(through_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();
  if through_at is null or through_at > now() + interval '1 minute' then
    raise exception 'Invalid read cursor.';
  end if;
  insert into public.board_chat_reads (person_id, last_seen_at)
  values (v_actor, through_at)
  on conflict (person_id) do update
  set last_seen_at = greatest(public.board_chat_reads.last_seen_at, excluded.last_seen_at);
end;
$$;
revoke all on function public.mark_board_chat_seen(timestamptz) from public;
grant execute on function public.mark_board_chat_seen(timestamptz) to authenticated;

create table public.board_push_subscriptions (
  endpoint text primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(endpoint) <= 2048),
  check (length(p256dh) <= 256),
  check (length(auth_secret) <= 256)
);
create index board_push_subscriptions_person on public.board_push_subscriptions(person_id);
alter table public.board_push_subscriptions enable row level security;
revoke all on public.board_push_subscriptions from anon, authenticated;

create or replace function public.register_board_push_subscription(
  push_endpoint text, push_p256dh text, push_auth text
) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid; v_host text;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();
  if length(push_endpoint) > 2048 or length(push_p256dh) > 256 or length(push_auth) > 256
     or push_endpoint !~ '^https://[^/]+/'
     or nullif(push_p256dh, '') is null or nullif(push_auth, '') is null then
    raise exception 'Invalid push subscription.';
  end if;
  v_host := lower(split_part(split_part(push_endpoint, '/', 3), ':', 1));
  if v_host not in ('fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com')
     and v_host !~ '(^|\.)push\.apple\.com$' then
    raise exception 'Unsupported push endpoint.';
  end if;
  insert into public.board_push_subscriptions (endpoint, person_id, p256dh, auth_secret)
  values (push_endpoint, v_actor, push_p256dh, push_auth)
  on conflict (endpoint) do update
  set person_id = excluded.person_id, p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret, updated_at = now();
end;
$$;
revoke all on function public.register_board_push_subscription(text, text, text) from public;
grant execute on function public.register_board_push_subscription(text, text, text) to authenticated;

create or replace function public.unregister_board_push_subscription(push_endpoint text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  delete from public.board_push_subscriptions
  where endpoint = push_endpoint and person_id = public.activity_actor_id();
end;
$$;
revoke all on function public.unregister_board_push_subscription(text) from public;
grant execute on function public.unregister_board_push_subscription(text) to authenticated;

-- At-most-once delivery for retrying an existing post-write notification request.
create table public.board_push_claims (
  event_key text not null,
  recipient_id uuid not null references public.people(id) on delete cascade,
  endpoint text not null references public.board_push_subscriptions(endpoint) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (event_key, recipient_id, endpoint)
);
alter table public.board_push_claims enable row level security;
revoke all on public.board_push_claims from anon, authenticated;

-- One count projection for the open app and the push sender. Ordinary unread Chat
-- is separate from explicit personal attention and is only combined at the icon.
create or replace function public.board_app_counts(target_person_id uuid default null)
returns table (chat_count integer, for_me_count integer)
language plpgsql stable security definer set search_path = public as $$
declare v_person uuid;
begin
  if auth.role() = 'service_role' then
    v_person := target_person_id;
  else
    if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
    v_person := public.activity_actor_id();
    if target_person_id is not null and target_person_id <> v_person then raise exception 'Not your Board.'; end if;
  end if;
  if v_person is null then raise exception 'Member is required.'; end if;

  return query
  with me as (
    select p.id, p.governance_available, coalesce(r.last_seen_at, p.created_at) as seen_at
    from public.people p left join public.board_chat_reads r on r.person_id = p.id
    where p.id = v_person and p.active
  ),
  attention as (
    select case when s.signal_type = 'tension_need' then 'legacy_tension_need' else 'communication' end as attention_kind,
      s.id as source_id
    from public.attention_signals s, me
    where s.recipient_id = me.id and s.acknowledged_at is null
      and (
        s.signal_type = 'board_feed_mention'
        or (s.signal_type = 'tension_need' and s.tension_request_id is null
            and exists (select 1 from public.tensions t where t.id = s.tension_id and t.status in ('open','needs_sync')))
        or (s.signal_type = 'project_comment' and exists (
          select 1 from public.project_comments c
          left join public.comment_thread_reads r on r.person_id = me.id and r.thread_type = 'project' and r.thread_id = c.project_id
          where c.project_id = s.project_id and me.id = any(c.mentioned_ids) and c.author_id <> me.id
            and (r.last_seen_at is null or c.created_at > r.last_seen_at)))
        or (s.signal_type = 'tension_comment' and exists (
          select 1 from public.tension_comments c
          left join public.comment_thread_reads r on r.person_id = me.id and r.thread_type = 'tension' and r.thread_id = c.tension_id
          where c.tension_id = s.tension_id and me.id = any(c.mentioned_ids) and c.author_id <> me.id
            and (r.last_seen_at is null or c.created_at > r.last_seen_at)))
        or (s.signal_type = 'action_comment' and exists (
          select 1 from public.action_comments c
          left join public.comment_thread_reads r on r.person_id = me.id and r.thread_type = 'action' and r.thread_id = c.action_id
          where c.action_id = s.action_id and me.id = any(c.mentioned_ids) and c.author_id <> me.id
            and (r.last_seen_at is null or c.created_at > r.last_seen_at)))
      )
    union all
    select 'tension_request', r.id from public.tension_requests r, me
    where r.recipient_id = me.id and r.status = 'open'
    union all
    select 'proposed_commitment', a.id from public.actions a, me
    where a.owner_id = me.id and a.status = 'proposed'
    union all
    select 'resolution_confirmation', t.id from public.tensions t, me
    where t.raiser_id = me.id and t.status = 'awaiting_confirmation'
    union all
    select 'tension_availability', p.id
    from public.tension_polls p join public.tensions t on t.id = p.tension_id
    join public.tension_poll_participants part on part.poll_id = p.id, me
    where part.person_id = me.id and t.status = 'needs_sync' and p.chosen_option_id is null
      and not exists (select 1 from public.tension_poll_votes v where v.poll_id = p.id and v.person_id = me.id)
    union all
    select 'governance_meeting_availability', p.id
    from public.meeting_polls p join public.meeting_poll_participants part on part.poll_id = p.id, me
    where part.person_id = me.id and p.meeting_type = 'governance' and p.chosen_option_id is null and p.closed_at is null
      and not exists (select 1 from public.meeting_poll_votes v where v.poll_id = p.id and v.person_id = me.id)
    union all
    select 'governance_consent', r.proposal_id
    from public.governance_consent_rounds r join public.governance_proposals p on p.id = r.proposal_id, me
    where me.governance_available and r.status = 'open' and p.stage in ('prepared','present_proposal')
      and not exists (select 1 from public.governance_consent_responses v where v.proposal_id = r.proposal_id and v.person_id = me.id)
  )
  select
    ((select count(*) from public.board_posts p, me where p.author_id <> me.id and p.created_at > me.seen_at)
      + (select count(*) from public.board_post_comments c, me where c.author_id <> me.id and c.created_at > me.seen_at))::integer,
    (select count(*)::integer from attention a
     where not exists (
       select 1 from public.operational_attention_snoozes s
       where s.recipient_id = v_person and s.attention_kind = a.attention_kind
         and s.source_id = a.source_id and s.snoozed_until > now()
     ));
end;
$$;
revoke all on function public.board_app_counts(uuid) from public;
grant execute on function public.board_app_counts(uuid) to authenticated, service_role;

commit;
