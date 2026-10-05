-- SDBP Workspace: temporary governance participation leave.
--
-- Workspace membership / board status and governance availability are separate concepts.
-- An active board member can be temporarily unavailable for asynchronous governance
-- without being deactivated or removed from roles. A return date is optional context;
-- the status itself is authoritative and is never auto-cleared by the date.
--
-- Existing objections remain authoritative when a person goes on leave. Leave only
-- removes a missing response from the required quick-consent headcount.

alter table public.people
  add column if not exists governance_available boolean not null default true,
  add column if not exists governance_leave_expected_return_on date,
  add column if not exists governance_leave_started_at timestamptz,
  add column if not exists governance_leave_set_by uuid references public.people(id) on delete set null;

create or replace function public.can_manage_governance_availability()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_current_president() or public.is_developer_admin();
$$;

revoke all on function public.can_manage_governance_availability() from public;
grant execute on function public.can_manage_governance_availability() to authenticated;

create or replace function public.is_governance_available()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.people p
    where p.auth_user_id = auth.uid()
      and p.active = true
      and p.governance_available = true
  );
$$;

revoke all on function public.is_governance_available() from public;
grant execute on function public.is_governance_available() to authenticated;

-- Finalisation counts only active people who are currently expected to participate.
-- Objections already submitted remain in force regardless of a later leave status.
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

-- A person who is marked on leave must explicitly return before casting a new response.
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

  if not public.is_governance_available() then
    raise exception 'You are currently marked on leave. Mark yourself available before responding to governance.';
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
    objection_review_mode,
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
      objection_review_mode = null,
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

create or replace function public.set_governance_availability(
  target_person_id uuid,
  available boolean,
  expected_return_on date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_actor_name text;
  v_target_name text;
  v_proposal_id uuid;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();
  v_actor_name := coalesce(public.activity_actor_name(), 'A board member');

  select p.name into v_target_name
  from public.people p
  where p.id = target_person_id
    and p.active = true;

  if not found then
    raise exception 'Active workspace person not found.';
  end if;

  if target_person_id <> v_actor then
    if available then
      raise exception 'Another person can only be returned to governance participation after they confirm their return themselves.';
    end if;
    if not public.can_manage_governance_availability() then
      raise exception 'Only the President or workspace administrator can place another person on leave.';
    end if;
  end if;

  if available then
    expected_return_on := null;
  elsif expected_return_on is not null and expected_return_on < current_date then
    raise exception 'Expected return date cannot be in the past.';
  end if;

  update public.people
  set governance_available = available,
      governance_leave_expected_return_on = case when available then null else expected_return_on end,
      governance_leave_started_at = case
        when available then null
        when governance_available = true or governance_leave_started_at is null then now()
        else governance_leave_started_at
      end,
      governance_leave_set_by = case when available then null else v_actor end,
      updated_at = now()
  where id = target_person_id;

  perform public.write_activity(
    case when available then 'governance_participation_resumed' else 'governance_participation_paused' end,
    'person',
    target_person_id,
    case
      when available then v_target_name || ' returned to governance participation.'
      else v_target_name || ' was marked on leave for governance participation.'
    end,
    jsonb_build_object(
      'person_id', target_person_id,
      'changed_by', v_actor,
      'changed_by_name', v_actor_name,
      'governance_available', available,
      'expected_return_on', expected_return_on
    )
  );

  -- A newly absent person must not leave an otherwise complete open round hanging.
  -- Existing pending/valid objections still prevent finalisation above.
  if not available then
    for v_proposal_id in
      select cr.proposal_id
      from public.governance_consent_rounds cr
      where cr.status = 'open'
    loop
      perform public.try_finalize_governance_quick_consent(v_proposal_id);
    end loop;
  end if;
end;
$$;

revoke all on function public.set_governance_availability(uuid, boolean, date) from public;
grant execute on function public.set_governance_availability(uuid, boolean, date) to authenticated;
