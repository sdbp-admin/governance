-- Approved rule: after 72 hours no response counts as no objection, not support.
-- Pending/valid objections still block; no historical rounds are rewritten.
begin;
create or replace function public.try_finalize_governance_quick_consent(target_proposal_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_round_status text;
  v_stage text;
  v_title text;
  v_proposal text;
  v_notes jsonb;
  v_effect jsonb;
  v_required integer;
  v_resolved integer;
  v_pending integer;
  v_valid integer;
  v_deadline timestamptz;
  v_unanswered uuid[];
begin
  select cr.status, gp.stage, gp.title, gp.proposal, gp.meeting_notes, gp.governance_effect, cr.deadline_at
    into v_round_status, v_stage, v_title, v_proposal, v_notes, v_effect, v_deadline
  from public.governance_consent_rounds cr
  join public.governance_proposals gp on gp.id = cr.proposal_id
  where cr.proposal_id = target_proposal_id
  for update of cr, gp;

  if not found then
    raise exception 'Quick consent has not been started for this proposal.';
  end if;

  if v_round_status <> 'open' then
    return v_round_status;
  end if;

  if v_stage <> 'prepared' then
    return v_round_status;
  end if;

  select count(*) into v_required
  from public.people p
  where p.active = true
    and p.governance_available = true;

  select count(*) into v_resolved
  from public.governance_consent_responses r
  join public.people p on p.id = r.person_id
    and p.active = true
    and p.governance_available = true
  where r.proposal_id = target_proposal_id
    and (
      r.response = 'no_objection'
      or (r.response = 'objection' and r.objection_status in ('invalid', 'withdrawn'))
    );

  -- A submitted objection is not made irrelevant by later leave.
  select count(*) into v_pending
  from public.governance_consent_responses r
  join public.people p on p.id = r.person_id and p.active = true
  where r.proposal_id = target_proposal_id
    and r.response = 'objection'
    and r.objection_status = 'pending_validation';

  select count(*) into v_valid
  from public.governance_consent_responses r
  join public.people p on p.id = r.person_id and p.active = true
  where r.proposal_id = target_proposal_id
    and r.response = 'objection'
    and r.objection_status = 'valid';

  if v_valid > 0 then
    update public.governance_consent_rounds
    set status = 'meeting_required', ended_at = coalesce(ended_at, now()), meeting_reason = 'valid_objection'
    where proposal_id = target_proposal_id;
    return 'meeting_required';
  end if;

  if v_pending > 0 then
    return 'open';
  end if;

  -- Preserve real responses: silence is not an invented response or Board vote.
  if v_deadline is not null and v_deadline <= now() then
    select coalesce(array_agg(p.id order by p.id), '{}'::uuid[]) into v_unanswered
    from public.people p where p.active and p.governance_available
      and not exists (select 1 from public.governance_consent_responses r
        where r.proposal_id = target_proposal_id and r.person_id = p.id);
  else
    v_unanswered := '{}'::uuid[];
  end if;

  if v_required > 0 and (v_resolved = v_required or
      (v_deadline is not null and v_deadline <= now()
       and v_resolved + cardinality(v_unanswered) = v_required)) then
    update public.governance_consent_rounds
    set status = 'accepted', ended_at = now(), unanswered_person_ids = v_unanswered, meeting_reason = null
    where proposal_id = target_proposal_id;

    perform public.accept_governance_proposal_with_effect(
      target_proposal_id,
      v_proposal,
      coalesce(v_notes, '{}'::jsonb),
      v_effect
    );

    perform public.write_activity(
      'governance_quick_consent_accepted',
      'governance_proposal',
      target_proposal_id,
      'Governance proposal accepted by Quick Consent: ' || v_title,
      jsonb_build_object('unanswered_person_ids', v_unanswered,
        'deadline_elapsed', v_deadline is not null and v_deadline <= now())
    );

    return 'accepted';
  end if;

  return 'open';
end;
$$;

revoke all on function public.try_finalize_governance_quick_consent(uuid) from public;

create or replace function public.close_expired_governance_consent_rounds()
returns integer language plpgsql security definer set search_path = '' as $$
declare v_round record; v_result text; v_closed integer := 0;
begin
  -- Existing five-minute cron job; no access for public API roles.
  for v_round in
    select proposal_id from public.governance_consent_rounds
    where status = 'open' and deadline_at <= now()
    order by deadline_at, proposal_id for update skip locked
  loop
    v_result := public.try_finalize_governance_quick_consent(v_round.proposal_id);
    if v_result in ('accepted','meeting_required') then v_closed := v_closed + 1; end if;
  end loop;
  return v_closed;
end;
$$;
revoke all on function public.close_expired_governance_consent_rounds() from public, anon, authenticated;
create or replace function public.reject_late_governance_consent_response()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_deadline timestamptz;
begin
  if tg_op = 'INSERT' or new.response is distinct from old.response
    or new.objection_text is distinct from old.objection_text then
    select deadline_at into v_deadline
    from public.governance_consent_rounds
    where proposal_id = new.proposal_id;
    if v_deadline is not null and now() >= v_deadline then
      raise exception 'This Quick Consent response window has ended.';
    end if;
  end if;
  return new;
end;
$$;


commit;
