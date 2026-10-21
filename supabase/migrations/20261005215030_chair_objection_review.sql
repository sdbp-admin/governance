-- Chair review uses the existing President designation and Quick Consent records.
-- No acknowledgement gate, dispute gate, deadline change or automatic COI exclusion.
begin;
alter table public.governance_consent_responses
  drop constraint governance_consent_objection_review_mode_check,
  add constraint governance_consent_objection_review_mode_check
    check (objection_review_mode is null or objection_review_mode in ('neutral', 'process_steward_override', 'chair'));

create or replace function public.review_governance_quick_consent_objection(
  target_proposal_id uuid, objector_id uuid, review_decision text, review_reason text default null
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_status text;
  v_stage text;
  v_reason text := nullif(btrim(coalesce(review_reason, '')), '');
begin
  if auth.uid() is null or not public.is_board_member() or not public.is_current_president() then
    raise exception 'Only the Chair (President) may review Quick Consent objections.';
  end if;
  if review_decision is null or review_decision not in ('valid','invalid') then
    raise exception 'Review decision must be valid or invalid.';
  end if;
  if v_reason is null then raise exception 'Record the reasons for the assessment.'; end if;
  v_actor := public.activity_actor_id();
  select cr.status, gp.stage into v_status, v_stage
  from public.governance_consent_rounds cr
  join public.governance_proposals gp on gp.id = cr.proposal_id
  where cr.proposal_id = target_proposal_id for update of cr, gp;
  if not found or v_status not in ('open','meeting_required') or v_stage <> 'prepared' then
    raise exception 'This objection can no longer be reviewed in Quick Consent.';
  end if;
  -- Being proposer or objector is not in itself a COI: no such exclusion here.
  update public.governance_consent_responses
  set objection_status = review_decision, objection_reviewed_by = v_actor,
      objection_reviewed_at = now(), objection_review_reason = v_reason,
      objection_review_mode = 'chair'
  where proposal_id = target_proposal_id and person_id = objector_id
    and response = 'objection' and objection_status = 'pending_validation';
  if not found then raise exception 'No pending objection was found.'; end if;
  perform public.write_activity('governance_objection_reviewed_by_chair',
    'governance_proposal', target_proposal_id, 'Chair recorded an objection assessment.',
    jsonb_build_object('objector_id',objector_id,'reviewed_by',v_actor,
      'decision',review_decision,'reason',v_reason));
  if review_decision = 'valid' and v_status = 'open' then
    update public.governance_consent_rounds
    set status = 'meeting_required', ended_at = now(), meeting_reason = 'valid_objection'
    where proposal_id = target_proposal_id;
    return 'meeting_required';
  end if;
  -- Invalid objections stop blocking immediately. Preserve the existing finalizer.
  return public.try_finalize_governance_quick_consent(target_proposal_id);
end;
$$;
revoke all on function public.review_governance_quick_consent_objection(uuid,uuid,text,text) from public, anon;
grant execute on function public.review_governance_quick_consent_objection(uuid,uuid,text,text) to authenticated;

-- Persistent attention is derived from pending canonical objections, not unread state.
-- Invoker security preserves existing read policies. No new notification model.
create or replace function public.load_governance_objection_review_attention()
returns table(proposal_id uuid, objector_id uuid)
language sql stable security invoker set search_path = '' as $$
  select r.proposal_id,r.person_id
  from public.governance_consent_responses r
  join public.governance_consent_rounds cr on cr.proposal_id=r.proposal_id
  join public.governance_proposals gp on gp.id=r.proposal_id
  where public.is_current_president() and cr.status in ('open','meeting_required')
    and gp.stage='prepared' and r.response='objection' and r.objection_status='pending_validation';
$$;
revoke all on function public.load_governance_objection_review_attention() from public, anon;
grant execute on function public.load_governance_objection_review_attention() to authenticated;
commit;
