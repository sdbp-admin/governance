-- Focused deadline-rule verification; all temporary data and DDL rolled back.
begin;
do $$
declare
  v_actor uuid; v_auth uuid; v_other uuid; v_tension uuid;
  v_before uuid; v_silent uuid; v_pending uuid; v_valid uuid; v_id uuid;
  v_case integer; v_result text; v_rows integer;
begin
  select p.id,p.auth_user_id into v_actor,v_auth from public.people p
  join public.role_assignments ra on ra.person_id=p.id
  where p.active and ra.ends_on is null and ra.role_id=public.president_role_id() limit 1;
  select id into v_other from public.people where active and governance_available and id<>v_actor limit 1;
  if v_other is null or v_auth is null then raise exception 'Two active participants required'; end if;
  perform set_config('request.jwt.claim.sub',v_auth::text,true);
  for v_case in 1..4 loop
    insert into public.tensions(title,raiser_id,status)
    values('TRANSACTION-ONLY deadline check',v_actor,'governance') returning id into v_tension;
    insert into public.governance_proposals(tension_id,title,proposal,proposer_id,stage,governance_effect)
    values(v_tension,'TRANSACTION-ONLY deadline check','Temporary test',v_actor,'prepared',
      '{"kind":"standing_agreement","operation":"create","agreement":{"category":"other","title":"TRANSACTION-ONLY deadline","body":"Rolled back"}}')
    returning id into v_id;
    insert into public.governance_consent_rounds(proposal_id,started_by,status) values(v_id,v_actor,'open');
    if v_case in (3,4) then
      insert into public.governance_consent_responses(proposal_id,person_id,response,objection_text,objection_status)
      values(v_id,v_other,'objection','Concrete test harm',case when v_case=3 then 'pending_validation' else 'valid' end);
    end if;
    if v_case>1 then update public.governance_consent_rounds set deadline_at=now()-interval '1 second' where proposal_id=v_id; end if;
    if v_case=1 then v_before:=v_id; elsif v_case=2 then v_silent:=v_id;
    elsif v_case=3 then v_pending:=v_id; else v_valid:=v_id; end if;
  end loop;
  if public.try_finalize_governance_quick_consent(v_before)<>'open' then raise exception 'Accepted silence before deadline'; end if;
  -- Isolate scheduler test from existing real expired rounds; changes roll back.
  update public.governance_consent_rounds set deadline_at=now()+interval '1 day'
    where status='open' and deadline_at<=now() and proposal_id not in(v_silent,v_pending,v_valid);
  perform public.close_expired_governance_consent_rounds();
  if (select status from public.governance_consent_rounds where proposal_id=v_silent)<>'accepted' then raise exception 'Silent expired round not accepted'; end if;
  if exists(select 1 from public.governance_consent_responses where proposal_id=v_silent) then raise exception 'Fabricated responses'; end if;
  if (select cardinality(unanswered_person_ids) from public.governance_consent_rounds where proposal_id=v_silent)
    <> (select count(*) from public.people where active and governance_available) then raise exception 'Missing non-response record'; end if;
  if (select status from public.governance_consent_rounds where proposal_id=v_pending)<>'open' then raise exception 'Pending objection bypassed'; end if;
  if not exists(select 1 from public.load_governance_objection_review_attention() where proposal_id=v_pending) then raise exception 'Chair review attention lost'; end if;
  if not exists(select 1 from public.governance_consent_rounds where proposal_id=v_valid and status='meeting_required' and meeting_reason='valid_objection') then raise exception 'Valid objection bypassed'; end if;
  perform public.close_expired_governance_consent_rounds();
  if (select count(*) from public.governance_consent_rounds where proposal_id=v_silent and status='accepted')<>1 then raise exception 'Repeat processing changed result'; end if;
  v_result:=public.review_governance_quick_consent_objection(v_pending,v_other,'invalid','No harm identified');
  if v_result<>'accepted' then raise exception 'Dismissed expired objection still blocked: %',v_result; end if;
end;
$$;
select 'PASS: before-deadline wait; expired silence accepted without invented responses; pending review retained; valid objection meeting; dismissal after expiry accepts; repeat processing safe' as result;
rollback;
