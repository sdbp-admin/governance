-- Focused transactional verification. Run after the migration, always ROLLBACK.
begin;
do $$
declare
  v_chair uuid; v_chair_auth uuid; v_other uuid; v_other_auth uuid;
  v_tension uuid; v_proposal uuid; v_second uuid; v_third uuid;
  v_result text; v_count integer; v_denied boolean;
begin
  select p.id,p.auth_user_id into v_chair,v_chair_auth
  from public.people p join public.role_assignments ra on ra.person_id=p.id
  where p.active and p.auth_user_id is not null and ra.ends_on is null
    and ra.role_id=public.president_role_id() limit 1;
  select p.id,p.auth_user_id into v_other,v_other_auth
  from public.people p where p.active and p.auth_user_id is not null
    and p.id<>v_chair and p.governance_available
  order by (p.name='Tester') desc,p.created_at limit 1;
  if v_chair is null or v_other is null then raise exception 'Two active test accounts are needed.'; end if;

  perform set_config('request.jwt.claim.sub',v_chair_auth::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_chair_auth,'role','authenticated')::text,true);
  for v_count in 1..3 loop
    insert into public.tensions(title,raiser_id,status)
    values ('TRANSACTION-ONLY Chair review check',v_chair,'governance') returning id into v_tension;
    insert into public.governance_proposals(tension_id,title,proposal,proposer_id,stage,governance_effect)
    values(v_tension,'TRANSACTION-ONLY Chair review check','Temporary test',case when v_count=2 then v_other else v_chair end,
      'prepared','{"kind":"standing_agreement","operation":"create","agreement":{"category":"other","title":"TRANSACTION-ONLY test","body":"Rolled back"}}')
    returning id into v_proposal;
    insert into public.governance_consent_rounds(proposal_id,started_by,status)
    values(v_proposal,v_chair,'open');
    insert into public.governance_consent_responses(proposal_id,person_id,response,objection_text,objection_status)
    select v_proposal,p.id,
      case when p.id=case when v_count=1 then v_other else v_chair end then 'objection' else 'no_objection' end,
      case when p.id=case when v_count=1 then v_other else v_chair end then 'Test harm' else null end,
      case when p.id=case when v_count=1 then v_other else v_chair end then 'pending_validation' else null end
    from public.people p where p.active and (p.governance_available or p.id=v_chair);
    if v_count=1 then v_third:=v_proposal; elsif v_count=2 then v_second:=v_proposal; end if;
  end loop;
  -- v_third: Chair proposes, another member objects. v_second: Chair objects to another's proposal.
  -- v_proposal: Chair is both proposer and objector.
  select count(*) into v_count from public.load_governance_objection_review_attention()
    where proposal_id in(v_proposal,v_second,v_third);
  if v_count<>3 then raise exception 'Expected three independent Chair review prompts.'; end if;
  select count(*) into v_count from public.load_governance_objection_review_attention()
    where proposal_id in(v_proposal,v_second,v_third);
  if v_count<>3 then raise exception 'Reading cleared review attention.'; end if;

  perform set_config('request.jwt.claim.sub',v_other_auth::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_other_auth,'role','authenticated')::text,true);
  if exists(select 1 from public.load_governance_objection_review_attention()
    where proposal_id in(v_proposal,v_second,v_third)) then raise exception 'Non-Chair received Chair attention.'; end if;
  v_denied:=false;
  begin
    perform public.review_governance_quick_consent_objection(v_third,v_other,'invalid','Test reason');
  exception when others then
    if sqlerrm not like 'Only the Chair%' then raise; end if;
    v_denied:=true;
  end;
  if not v_denied then raise exception 'Non-Chair review was permitted.'; end if;

  perform set_config('request.jwt.claim.sub',v_chair_auth::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_chair_auth,'role','authenticated')::text,true);
  v_denied:=false;
  begin
    perform public.review_governance_quick_consent_objection(v_third,v_other,'invalid',' ');
  exception when others then
    if sqlerrm<>'Record the reasons for the assessment.' then raise; end if;
    v_denied:=true;
  end;
  if not v_denied then raise exception 'Missing assessment reason was accepted.'; end if;
  v_result:=public.review_governance_quick_consent_objection(v_third,v_other,'invalid','Does not identify harm');
  if v_result<>'accepted' then raise exception 'Dismissal did not stop blocking immediately: %',v_result; end if;
  if not exists(select 1 from public.governance_consent_responses where proposal_id=v_third
    and person_id=v_other and objection_status='invalid' and objection_reviewed_by=v_chair
    and objection_review_reason='Does not identify harm' and objection_review_mode='chair') then
    raise exception 'Assessment record missing.';
  end if;
  if exists(select 1 from public.load_governance_objection_review_attention() where proposal_id=v_third) then
    raise exception 'Reviewed objection still prompts Chair.';
  end if;
  select count(*) into v_count from public.load_governance_objection_review_attention()
    where proposal_id in(v_proposal,v_second);
  if v_count<>2 then raise exception 'Review cleared an unrelated prompt.'; end if;

  v_result:=public.review_governance_quick_consent_objection(v_second,v_chair,'valid','Identified concrete harm');
  if v_result<>'meeting_required' then raise exception 'Valid objection not routed to meeting.'; end if;
  v_result:=public.review_governance_quick_consent_objection(v_proposal,v_chair,'invalid','No harm identified');
  if v_result<>'accepted' then raise exception 'Chair self/proposer review was excluded.'; end if;
end;
$$;
select 'PASS: Chair-only review, own/proposer review, reasons, persistent independent attention, immediate dismissal, valid objection meeting route' as result;
rollback;
