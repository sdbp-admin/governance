-- SDBP Workspace: explicit Process Steward override for governance objection validity.
--
-- Ordinary objection review remains neutral: the objector cannot review their own
-- objection and the proposer normally does not adjudicate an objection to their own
-- proposal. During the current learning/transition phase, the current President or
-- technical developer-admin may act as Process Steward and make a procedural ruling
-- on an objection to their own proposal. Such a ruling is explicitly marked as an
-- override and requires a recorded reason.

alter table public.governance_consent_responses
  add column if not exists objection_review_mode text;

do $$
begin
  alter table public.governance_consent_responses
    add constraint governance_consent_objection_review_mode_check
    check (objection_review_mode is null or objection_review_mode in ('neutral', 'process_steward_override'));
exception
  when duplicate_object then null;
end;
$$;

-- Existing completed reviews predate the explicit mode field and were neutral reviews.
update public.governance_consent_responses
set objection_review_mode = 'neutral'
where objection_review_mode is null
  and objection_reviewed_by is not null
  and objection_status in ('valid', 'invalid');

create or replace function public.is_process_steward()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_current_president() or public.is_developer_admin();
$$;

revoke all on function public.is_process_steward() from public;
grant execute on function public.is_process_steward() to authenticated;

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
  v_process_steward_override boolean := false;
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

  v_process_steward_override := v_actor = v_proposer;

  if v_process_steward_override and not public.is_process_steward() then
    raise exception 'The proposer cannot rule on an objection to their own proposal.';
  end if;

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

  if v_process_steward_override and v_reason is null then
    raise exception 'A Process Steward override requires a recorded reason.';
  end if;

  update public.governance_consent_responses
  set objection_status = review_decision,
      objection_reviewed_by = v_actor,
      objection_reviewed_at = now(),
      objection_review_reason = v_reason,
      objection_review_mode = case
        when v_process_steward_override then 'process_steward_override'
        else 'neutral'
      end
  where proposal_id = target_proposal_id
    and person_id = objector_id;

  if review_decision = 'valid' then
    update public.governance_consent_rounds
    set status = 'meeting_required', ended_at = now()
    where proposal_id = target_proposal_id;

    perform public.write_activity(
      case
        when v_process_steward_override then 'governance_quick_consent_objection_validated_by_process_steward'
        else 'governance_quick_consent_objection_validated'
      end,
      'governance_proposal',
      target_proposal_id,
      case
        when v_process_steward_override then 'Objection validated by Process Steward override; governance meeting required.'
        else 'Objection validated; governance meeting required.'
      end,
      jsonb_build_object(
        'objector_id', objector_id,
        'reviewed_by', v_actor,
        'objection', v_objection,
        'review_reason', v_reason,
        'process_steward_override', v_process_steward_override
      )
    );

    return 'meeting_required';
  end if;

  perform public.write_activity(
    case
      when v_process_steward_override then 'governance_quick_consent_objection_invalidated_by_process_steward'
      else 'governance_quick_consent_objection_invalidated'
    end,
    'governance_proposal',
    target_proposal_id,
    case
      when v_process_steward_override then 'Objection ruled invalid by Process Steward override; quick consent continues.'
      else 'Objection ruled invalid; quick consent continues.'
    end,
    jsonb_build_object(
      'objector_id', objector_id,
      'reviewed_by', v_actor,
      'objection', v_objection,
      'review_reason', v_reason,
      'process_steward_override', v_process_steward_override
    )
  );

  return public.try_finalize_governance_quick_consent(target_proposal_id);
end;
$$;

revoke all on function public.review_governance_quick_consent_objection(uuid, uuid, text, text) from public;
grant execute on function public.review_governance_quick_consent_objection(uuid, uuid, text, text) to authenticated;
