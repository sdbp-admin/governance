-- SDBP Workspace: allow an opened-but-not-processed governance meeting to be rerouted to quick consent.
--
-- Starting a meeting moves a prepared proposal to present_proposal immediately. That
-- should not trap the proposal in synchronous processing if the proposer decides the
-- item is suitable for explicit asynchronous consent. Once clarifying questions or
-- later governance processing has begun, the meeting remains the authoritative path.

create or replace function public.start_governance_quick_consent(target_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_proposer uuid;
  v_stage text;
  v_effect jsonb;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  v_actor := public.activity_actor_id();

  select gp.proposer_id, gp.stage, gp.governance_effect
    into v_proposer, v_stage, v_effect
  from public.governance_proposals gp
  where gp.id = target_proposal_id
  for update;

  if not found then raise exception 'Governance proposal not found.'; end if;
  if v_actor is distinct from v_proposer then
    raise exception 'Only the proposer can start quick consent.';
  end if;
  if v_stage not in ('prepared', 'present_proposal') then
    raise exception 'Quick consent is only available before governance processing moves beyond presenting the proposal.';
  end if;
  if v_effect is null then
    raise exception 'The proposal needs a complete governance effect before quick consent.';
  end if;
  if exists (
    select 1 from public.governance_consent_rounds r
    where r.proposal_id = target_proposal_id
  ) then
    raise exception 'A quick consent round already exists for this proposal.';
  end if;

  if v_stage = 'present_proposal' then
    update public.governance_proposals
    set stage = 'prepared', updated_at = now()
    where id = target_proposal_id;
  end if;

  insert into public.governance_consent_rounds (proposal_id, started_by)
  values (target_proposal_id, v_actor);

  perform public.write_activity(
    'governance_quick_consent_started',
    'governance_proposal',
    target_proposal_id,
    case
      when v_stage = 'present_proposal' then 'Switched an opened governance meeting to quick consent.'
      else 'Started quick consent for governance proposal.'
    end
  );
end;
$$;

revoke all on function public.start_governance_quick_consent(uuid) from public;
grant execute on function public.start_governance_quick_consent(uuid) to authenticated;
