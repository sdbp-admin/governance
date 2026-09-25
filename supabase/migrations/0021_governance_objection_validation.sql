-- SDBP Workspace: validate governance objections before they can block quick consent.
--
-- An objection is first recorded as pending validation. Other board members may keep
-- responding while the validity check is open. Only a validated objection routes the
-- proposal to a governance meeting. Invalid or withdrawn objections remain in the
-- record and do not erase existing consent responses.

alter table public.governance_consent_responses
  add column if not exists objection_status text,
  add column if not exists objection_reviewed_by uuid references public.people(id) on delete set null,
  add column if not exists objection_reviewed_at timestamptz,
  add column if not exists objection_review_reason text;

do $$
begin
  alter table public.governance_consent_responses
    add constraint governance_consent_objection_status_check
    check (objection_status is null or objection_status in ('pending_validation', 'valid', 'invalid', 'withdrawn'));
exception
  when duplicate_object then null;
end;
$$;

-- Preserve governance meetings that have already begun. An old quick-consent objection
-- that has already moved into live governance is treated as valid for continuity.
update public.governance_consent_responses r
set objection_status = case
  when cr.status = 'meeting_required' and gp.stage <> 'prepared' then 'valid'
  else 'pending_validation'
end
from public.governance_consent_rounds cr
join public.governance_proposals gp on gp.id = cr.proposal_id
where r.proposal_id = cr.proposal_id
  and r.response = 'objection'
  and r.objection_status is null;

-- Reopen only consent rounds that were stopped by the old automatic-objection rule and
-- have not yet entered governance processing. Existing no-objection responses stay put.
update public.governance_consent_rounds cr
set status = 'open', ended_at = null
from public.governance_proposals gp
where gp.id = cr.proposal_id
  and cr.status = 'meeting_required'
  and gp.stage = 'prepared'
  and exists (
    select 1
    from public.governance_consent_responses r
    where r.proposal_id = cr.proposal_id
      and r.response = 'objection'
      and r.objection_status = 'pending_validation'
  );

create or replace function public.try_finalize_governance_quick_consent(target_proposal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
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
begin
  select cr.status, gp.stage, gp.title, gp.proposal, gp.meeting_notes, gp.governance_effect
    into v_round_status, v_stage, v_title, v_proposal, v_notes, v_effect
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
  where p.active = true;

  select count(*) into v_resolved
  from public.governance_consent_responses r
  join public.people p on p.id = r.person_id and p.active = true
  where r.proposal_id = target_proposal_id
    and (
      r.response = 'no_objection'
      or (r.response = 'objection' and r.objection_status in ('invalid', 'withdrawn'))
    );

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
    set status = 'meeting_required', ended_at = coalesce(ended_at, now())
    where proposal_id = target_proposal_id;
    return 'meeting_required';
  end if;

  if v_pending > 0 then
    return 'open';
  end if;

  if v_required > 0 and v_resolved = v_required then
    update public.governance_consent_rounds
    set status = 'accepted', ended_at = now()
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
      'Governance proposal accepted by explicit quick consent: ' || v_title
    );

    return 'accepted';
  end if;

  return 'open';
end;
$$;

revoke all on function public.try_finalize_governance_quick_consent(uuid) from public;

create or replace function public.respond_governance_quick_consent(
  target_proposal_id uuid,
  consent_response text,
  objection_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_round_status text;
  v_stage text;
  v_reason text;
  v_existing_response text;
  v_existing_objection_status text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  if consent_response not in ('no_objection', 'objection') then
    raise exception 'Choose no objection or objection.';
  end if;

  v_actor := public.activity_actor_id();
  v_reason := nullif(trim(coalesce(objection_reason, '')), '');

  if consent_response = 'objection' and v_reason is null then
    raise exception 'Explain the concrete harm or risk behind the objection.';
  end if;

  select cr.status, gp.stage
    into v_round_status, v_stage
  from public.governance_consent_rounds cr
  join public.governance_proposals gp on gp.id = cr.proposal_id
  where cr.proposal_id = target_proposal_id
  for update of cr, gp;

  if not found then raise exception 'Quick consent has not been started for this proposal.'; end if;
  if v_round_status <> 'open' then raise exception 'This quick consent round is already closed.'; end if;
  if v_stage <> 'prepared' then raise exception 'The governance meeting has already started.'; end if;

  select r.response, r.objection_status
    into v_existing_response, v_existing_objection_status
  from public.governance_consent_responses r
  where r.proposal_id = target_proposal_id
    and r.person_id = v_actor;

  if consent_response = 'no_objection'
     and v_existing_response = 'objection' then
    if v_existing_objection_status in ('pending_validation', 'valid') then
      raise exception 'Withdraw your objection instead of replacing it; the objection remains in the governance record.';
    end if;
    raise exception 'Your resolved objection remains in the governance record and already counts as your response.';
  end if;

  if consent_response = 'objection'
     and v_existing_response = 'objection' then
    raise exception 'You have already raised an objection in this consent round.';
  end if;

  insert into public.governance_consent_responses (
    proposal_id,
    person_id,
    response,
    objection_text,
    objection_status,
    objection_reviewed_by,
    objection_reviewed_at,
    objection_review_reason,
    responded_at
  ) values (
    target_proposal_id,
    v_actor,
    consent_response,
    case when consent_response = 'objection' then v_reason else null end,
    case when consent_response = 'objection' then 'pending_validation' else null end,
    null,
    null,
    null,
    now()
  )
  on conflict (proposal_id, person_id) do update
  set response = excluded.response,
      objection_text = excluded.objection_text,
      objection_status = excluded.objection_status,
      objection_reviewed_by = null,
      objection_reviewed_at = null,
      objection_review_reason = null,
      responded_at = now();

  if consent_response = 'objection' then
    perform public.write_activity(
      'governance_quick_consent_objection_submitted',
      'governance_proposal',
      target_proposal_id,
      'Objection submitted for validity check; quick consent remains open.',
      jsonb_build_object('person_id', v_actor, 'objection', v_reason)
    );

    return 'objection_pending';
  end if;

  return public.try_finalize_governance_quick_consent(target_proposal_id);
end;
$$;

revoke all on function public.respond_governance_quick_consent(uuid, text, text) from public;
grant execute on function public.respond_governance_quick_consent(uuid, text, text) to authenticated;

create or replace function public.review_governance_quick_consent_objection(
  target_proposal_id uuid,
  objector_id uuid,
  review_decision text,
  review_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_proposer uuid;
  v_round_status text;
  v_stage text;
  v_objection text;
  v_reason text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  if review_decision not in ('valid', 'invalid') then
    raise exception 'Review decision must be valid or invalid.';
  end if;

  v_actor := public.activity_actor_id();
  v_reason := nullif(trim(coalesce(review_reason, '')), '');

  if v_actor = objector_id then
    raise exception 'The objector cannot validate their own objection.';
  end if;

  select gp.proposer_id, cr.status, gp.stage
    into v_proposer, v_round_status, v_stage
  from public.governance_consent_rounds cr
  join public.governance_proposals gp on gp.id = cr.proposal_id
  where cr.proposal_id = target_proposal_id
  for update of cr, gp;

  if not found then raise exception 'Quick consent has not been started for this proposal.'; end if;
  if v_actor = v_proposer then raise exception 'The proposer cannot rule on an objection to their own proposal.'; end if;
  if v_round_status <> 'open' then raise exception 'This objection can no longer be reviewed in quick consent.'; end if;
  if v_stage <> 'prepared' then raise exception 'Governance processing has already started.'; end if;

  select r.objection_text
    into v_objection
  from public.governance_consent_responses r
  where r.proposal_id = target_proposal_id
    and r.person_id = objector_id
    and r.response = 'objection'
    and r.objection_status = 'pending_validation'
  for update;

  if not found then raise exception 'No pending objection was found for this person.'; end if;

  if review_decision = 'invalid' and v_reason is null then
    raise exception 'Record why the objection is invalid.';
  end if;

  update public.governance_consent_responses
  set objection_status = review_decision,
      objection_reviewed_by = v_actor,
      objection_reviewed_at = now(),
      objection_review_reason = v_reason
  where proposal_id = target_proposal_id
    and person_id = objector_id;

  if review_decision = 'valid' then
    update public.governance_consent_rounds
    set status = 'meeting_required', ended_at = now()
    where proposal_id = target_proposal_id;

    perform public.write_activity(
      'governance_quick_consent_objection_validated',
      'governance_proposal',
      target_proposal_id,
      'Objection validated; governance meeting required.',
      jsonb_build_object(
        'objector_id', objector_id,
        'reviewed_by', v_actor,
        'objection', v_objection,
        'review_reason', v_reason
      )
    );

    return 'meeting_required';
  end if;

  perform public.write_activity(
    'governance_quick_consent_objection_invalidated',
    'governance_proposal',
    target_proposal_id,
    'Objection ruled invalid; quick consent continues.',
    jsonb_build_object(
      'objector_id', objector_id,
      'reviewed_by', v_actor,
      'objection', v_objection,
      'review_reason', v_reason
    )
  );

  return public.try_finalize_governance_quick_consent(target_proposal_id);
end;
$$;

revoke all on function public.review_governance_quick_consent_objection(uuid, uuid, text, text) from public;
grant execute on function public.review_governance_quick_consent_objection(uuid, uuid, text, text) to authenticated;

create or replace function public.withdraw_governance_quick_consent_objection(target_proposal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_round_status text;
  v_stage text;
  v_objection_status text;
  v_objection text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();

  select cr.status, gp.stage
    into v_round_status, v_stage
  from public.governance_consent_rounds cr
  join public.governance_proposals gp on gp.id = cr.proposal_id
  where cr.proposal_id = target_proposal_id
  for update of cr, gp;

  if not found then raise exception 'Quick consent has not been started for this proposal.'; end if;

  select r.objection_status, r.objection_text
    into v_objection_status, v_objection
  from public.governance_consent_responses r
  where r.proposal_id = target_proposal_id
    and r.person_id = v_actor
    and r.response = 'objection'
  for update;

  if not found then raise exception 'You do not have an objection to withdraw.'; end if;
  if v_objection_status not in ('pending_validation', 'valid') then
    raise exception 'This objection has already been resolved.';
  end if;

  if v_round_status = 'meeting_required' and v_stage <> 'prepared' then
    raise exception 'The governance meeting has already started; continue through the meeting process.';
  end if;

  update public.governance_consent_responses
  set objection_status = 'withdrawn',
      objection_reviewed_by = v_actor,
      objection_reviewed_at = now(),
      objection_review_reason = 'Withdrawn by objector.'
  where proposal_id = target_proposal_id
    and person_id = v_actor;

  if v_round_status = 'meeting_required' then
    update public.governance_consent_rounds
    set status = 'open', ended_at = null
    where proposal_id = target_proposal_id;
  end if;

  perform public.write_activity(
    'governance_quick_consent_objection_withdrawn',
    'governance_proposal',
    target_proposal_id,
    'Objection withdrawn; quick consent continues.',
    jsonb_build_object('objector_id', v_actor, 'objection', v_objection)
  );

  return public.try_finalize_governance_quick_consent(target_proposal_id);
end;
$$;

revoke all on function public.withdraw_governance_quick_consent_objection(uuid) from public;
grant execute on function public.withdraw_governance_quick_consent_objection(uuid) to authenticated;
