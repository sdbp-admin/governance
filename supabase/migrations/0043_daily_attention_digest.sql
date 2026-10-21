-- 0043: administrator availability restoration and consolidated daily notification preferences.
create table if not exists public.person_notification_preferences (
  person_id uuid primary key references public.people(id) on delete cascade,
  daily_digest_enabled boolean not null default true,
  include_work boolean not null default true,
  include_conversations boolean not null default true,
  include_governance boolean not null default true,
  urgent_email_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.person_notification_preferences enable row level security;
grant select, insert, update on public.person_notification_preferences to authenticated;
create policy "members manage their own notification settings" on public.person_notification_preferences
  for all to authenticated
  using (exists (select 1 from public.people p where p.id = person_id and p.auth_user_id = auth.uid() and p.active))
  with check (exists (select 1 from public.people p where p.id = person_id and p.auth_user_id = auth.uid() and p.active));

create table if not exists public.governance_availability_events (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  changed_by uuid not null references public.people(id),
  available boolean not null,
  changed_at timestamptz not null default now()
);
alter table public.governance_availability_events enable row level security;
revoke all on public.governance_availability_events from anon, authenticated;

create table if not exists public.daily_digest_deliveries (
  person_id uuid not null references public.people(id) on delete cascade,
  digest_date date not null,
  state text not null default 'sending' check (state in ('sending','sent')),
  sent_at timestamptz,
  primary key(person_id,digest_date)
);
alter table public.daily_digest_deliveries enable row level security;
revoke all on public.daily_digest_deliveries from anon, authenticated;

create or replace function public.set_governance_availability(target_person_id uuid, available boolean, expected_return_on date default null)
returns void language plpgsql security definer set search_path = 'public' as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_target_name text;
  v_was_available boolean;
  v_proposal_id uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;
  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');
  select p.name, p.governance_available into v_target_name, v_was_available
  from public.people p where p.id = target_person_id and p.active = true;
  if not found then raise exception 'Active workspace person not found.'; end if;

  -- Administrators can correct a forgotten return. This never casts a vote or grants consent.
  if target_person_id <> v_actor and not public.can_manage_governance_availability() then
    raise exception 'Only the President or workspace administrator can change another person''s governance availability.';
  end if;
  if available then expected_return_on := null;
  elsif expected_return_on is not null and expected_return_on < current_date then
    raise exception 'Expected return date cannot be in the past.';
  end if;

  update public.people
  set governance_available = available,
      governance_leave_expected_return_on = case when available then null else expected_return_on end,
      governance_leave_started_at = case
        when available then null
        when governance_available = true or governance_leave_started_at is null then now()
        else governance_leave_started_at end,
      governance_leave_set_by = case when available then null else v_actor end,
      updated_at = now()
  where id = target_person_id;

  if v_was_available is distinct from available then
    insert into public.governance_availability_events(person_id, changed_by, available)
    values (target_person_id, v_actor, available);
  end if;

  perform public.write_activity(
    case when available then 'governance_participation_resumed' else 'governance_participation_paused' end,
    'person', target_person_id,
    case when available then v_target_name || ' returned to governance participation.'
         else v_target_name || ' was marked on leave for governance participation.' end,
    jsonb_build_object('person_id',target_person_id,'changed_by',v_actor,'changed_by_name',v_actor_name,
                       'governance_available',available,'expected_return_on',expected_return_on)
  );

  if not available then
    for v_proposal_id in select cr.proposal_id from public.governance_consent_rounds cr where cr.status='open'
    loop perform public.try_finalize_governance_quick_consent(v_proposal_id); end loop;
  end if;
end;
$$;

-- Canonical outstanding work; no replicated queue of activity messages.
-- Only the service-role daily digest worker may call this function.
create or replace function public.get_daily_attention_items(target_person_id uuid)
returns table(category text, title text, detail text, destination text, created_at timestamptz)
language sql stable security definer set search_path='public' as $$
with current_day as (
  select (now() at time zone 'Europe/Ljubljana')::date as today
),
items as (
  select 'work'::text category, 'Commitment awaiting acceptance'::text title,
    a.title::text detail, 'https://sdbp-admin.github.io/governance/spatial/'::text destination,
    a.created_at
  from public.actions a where a.owner_id=target_person_id and a.status='proposed'
    and not exists (select 1 from public.operational_attention_snoozes s
      where s.recipient_id=target_person_id and s.attention_kind='proposed_commitment'
      and s.source_id=a.id and s.snoozed_until>now())
  union all
  select 'work', 'Commitment overdue', a.title || ' · due ' || a.due_on::text,
    'https://sdbp-admin.github.io/governance/spatial/', a.created_at
  from public.actions a cross join current_day d where a.owner_id=target_person_id and a.status='open'
    and a.due_on is not null and a.due_on<d.today
  union all
  select 'work', 'Project update due', p.title || ' · due ' || p.next_prompt_on::text,
    'https://sdbp-admin.github.io/governance/spatial/', p.created_at
  from public.projects p cross join current_day d where p.owner_id=target_person_id
    and p.status='active' and p.next_prompt_on is not null and p.next_prompt_on<=d.today
  union all
  select 'work', 'Response requested', t.title || ' · ' || coalesce(r.detail,r.kind),
    'https://sdbp-admin.github.io/governance/spatial/',r.requested_at
  from public.tension_requests r join public.tensions t on t.id=r.tension_id
  where r.recipient_id=target_person_id and r.status='open'
    and not exists (select 1 from public.operational_attention_snoozes s
      where s.recipient_id=target_person_id and s.attention_kind='tension_request'
      and s.source_id=r.id and s.snoozed_until>now())
  union all
  select 'work', 'Resolution needs your confirmation',t.title,
    'https://sdbp-admin.github.io/governance/spatial/', t.created_at
  from public.tensions t where t.raiser_id=target_person_id and t.status='awaiting_confirmation'
    and not exists (select 1 from public.operational_attention_snoozes s
      where s.recipient_id=target_person_id and s.attention_kind='resolution_confirmation'
      and s.source_id=t.id and s.snoozed_until>now())
  union all
  select 'work', 'Input needed on a tension',coalesce(t.title,s.message),
    'https://sdbp-admin.github.io/governance/spatial/',s.created_at
  from public.attention_signals s left join public.tensions t on t.id=s.tension_id
  where s.recipient_id=target_person_id and s.acknowledged_at is null and s.signal_type='tension_need'
  union all
  select 'governance', 'Governance response needed',gp.title ||
     case when cr.deadline_at is not null then ' · deadline ' ||
       to_char(cr.deadline_at at time zone 'Europe/Ljubljana','DD Mon HH24:MI') else '' end,
    'https://sdbp-admin.github.io/governance/spatial/', cr.started_at
  from public.governance_consent_rounds cr
    join public.governance_proposals gp on gp.id=cr.proposal_id
    join public.people person on person.id=target_person_id
  where cr.status='open' and person.governance_available=true
    and not exists (select 1 from public.governance_consent_responses resp
      where resp.proposal_id=cr.proposal_id and resp.person_id=target_person_id)
    and not exists (select 1 from public.operational_attention_snoozes s
      where s.recipient_id=target_person_id and s.attention_kind='governance_consent'
      and s.source_id=cr.proposal_id and s.snoozed_until>now())
  union all
  select 'governance', 'Meeting availability needed',mp.title,
    'https://sdbp-admin.github.io/governance/board/?tab=attention',mp.created_at
  from public.meeting_polls mp join public.meeting_poll_participants part on part.poll_id=mp.id
  where part.person_id=target_person_id and mp.meeting_type='governance'
    and mp.chosen_option_id is null and mp.closed_at is null
    and not exists (select 1 from public.meeting_poll_votes v where v.poll_id=mp.id and v.person_id=target_person_id)
    and not exists (select 1 from public.operational_attention_snoozes s
      where s.recipient_id=target_person_id and s.attention_kind='governance_meeting_availability'
      and s.source_id=mp.id and s.snoozed_until>now())
  union all
  select 'work', 'Conversation availability needed',t.title,
    'https://sdbp-admin.github.io/governance/spatial/',tp.created_at
  from public.tension_polls tp join public.tensions t on t.id=tp.tension_id
    join public.tension_poll_participants part on part.poll_id=tp.id
  where part.person_id=target_person_id and tp.chosen_option_id is null
    and not exists (select 1 from public.tension_poll_votes v where v.poll_id=tp.id and v.person_id=target_person_id)
  union all
  select 'conversations','You were mentioned',s.message,
    case when s.signal_type='board_feed_mention'
      then 'https://sdbp-admin.github.io/governance/board/?tab=attention'
      else 'https://sdbp-admin.github.io/governance/spatial/' end,s.created_at
  from public.attention_signals s
  where s.recipient_id=target_person_id and s.acknowledged_at is null
    and s.created_by is distinct from target_person_id
    and (
       s.signal_type='board_feed_mention'
       or (s.signal_type='project_comment' and exists
          (select 1 from public.project_comments c where c.id=s.source_comment_id
           and target_person_id=any(c.mentioned_ids)
           and not exists (select 1 from public.comment_thread_reads rd
              where rd.person_id=target_person_id and rd.thread_type='project'
                and rd.thread_id=c.project_id and rd.last_seen_at>=c.created_at)))
       or (s.signal_type='tension_comment' and exists
          (select 1 from public.tension_comments c where c.id=s.source_comment_id
           and target_person_id=any(c.mentioned_ids)
           and not exists (select 1 from public.comment_thread_reads rd
              where rd.person_id=target_person_id and rd.thread_type='tension'
                and rd.thread_id=c.tension_id and rd.last_seen_at>=c.created_at)))
       or (s.signal_type='action_comment' and exists
          (select 1 from public.action_comments c where c.id=s.source_comment_id
           and target_person_id=any(c.mentioned_ids)
           and not exists (select 1 from public.comment_thread_reads rd
              where rd.person_id=target_person_id and rd.thread_type='action'
                and rd.thread_id=c.action_id and rd.last_seen_at>=c.created_at)))
    )
  union all
  select 'governance','Your governance availability changed',
    case when ev.available then 'You were marked available again' else 'You were marked on leave' end ||
      ' by ' || coalesce(actor.name,'an administrator'),
    'https://sdbp-admin.github.io/governance/spatial/',ev.changed_at
  from public.governance_availability_events ev
    left join public.people actor on actor.id=ev.changed_by
  where ev.person_id=target_person_id and ev.changed_by<>target_person_id
    and ev.changed_at>coalesce((
      select max(sent_at) from public.daily_digest_deliveries d
      where d.person_id=target_person_id and d.state='sent'
    ), now()-interval '24 hours')
)
select items.category, items.title, items.detail, items.destination, items.created_at
from items order by case items.category when 'governance' then 1 when 'work' then 2 else 3 end, items.created_at desc;
$$;
revoke all on function public.get_daily_attention_items(uuid) from public, anon, authenticated;
grant execute on function public.get_daily_attention_items(uuid) to service_role;

-- The existing authenticated callers already use set_governance_availability;
-- new preferences are opt-in controls with backward-compatible defaults.
