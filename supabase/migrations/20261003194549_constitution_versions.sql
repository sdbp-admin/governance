-- Reuse Records/version history, existing president/admin checks and Activity.
begin;
alter table public.record_versions add column constitution_body text, add column change_reason text, add column author_name text;
insert into public.records (id,title,record_type,description,source)
values ('83b0e4aa-5a62-4c2c-a887-e4c8f2cf4b63','SDBP Constitution','other','Draft for Board review — not adopted','sdbp:constitution');
insert into public.record_versions (record_id,version_label,status,constitution_body,change_reason,author_name)
values ('83b0e4aa-5a62-4c2c-a887-e4c8f2cf4b63','1','current',
$constitution$# SDBP Working Constitution

## Discussion draft 0.3 - 2 October 2026

**Status: proposed text for discussion, not adopted.**

## Article 1. Purpose and foundations

SDBP develops and promotes economic relations between the Netherlands, including neighbouring regions in Belgium and Germany, and Slovenia, including the Adriatic region. It connects people, competences and business opportunities through international networking, constructive dialogue and cooperation.

This Constitution describes how we work together in SDBP: who is responsible for what, who may make decisions, how we respond to tensions and how we improve our work.

We work with trust, ethical conduct, respect for different cultures and a willingness to share knowledge. These values guide us; they do not give anyone authority beyond their agreed role or replace the decision processes below.

This Constitution works alongside SDBP's Statutes and the law. It does not replace the responsibilities and decision-making powers set out there.

This Constitution applies to everyone working on behalf of SDBP, including Board members, role holders and project participants.

## Article 2. People, roles and circles

A person and their roles are not the same thing. A person may make decisions on SDBP's behalf only where that authority has been clearly agreed. Seniority, influence, access to information or past involvement does not give that authority by itself.

A role describes its title, purpose, scope, responsibilities, accountabilities and decision-making authority. Accountabilities describe what the role is expected to keep taking care of. We record who holds each role. Scope describes the area of work; it does not give exclusive control unless that has been explicitly agreed.

A circle is a continuing organisational unit with a defined purpose and mandate. It may contain roles and other circles. It may exist before its contained roles are filled. A project is temporary operational work and does not become a circle merely because it continues for a long time.

Everyone may propose creating, changing or removing a role or circle through governance. The Board is responsible and accountable for these changes and retains authority to create, change or remove roles and circles and appoint or remove role holders. Role holders cannot make these changes independently.

These matters may be discussed and decided during a governance meeting. Where a Board vote is needed, only Board members cast that vote. The Board agrees what each role or circle may do and, where needed, for how long. Role holders work within that agreed authority.

Appointing, suspending and removing Board members, and admitting or ending SDBP membership, follow the Statutes.

## Article 3. Autonomy and cooperation

Within their agreed authority, a role holder may organise their work and choose suitable next steps. They follow current governance agreements and obtain any approvals that are required.

Role holders promptly process messages and requests addressed to their roles. Processing means considering the request and determining an appropriate response; it does not mean immediately executing the requested work.

When asked to clarify the next steps for work within their responsibilities, the role holder identifies and communicates a next action they can take. If no action can yet be taken, they explain what they are waiting for.

Requests do not automatically become another person's commitments. If requested work makes sense within the recipient's role in the absence of competing priorities, the recipient accepts and records it. Competing priorities may affect when the work is carried out; they do not remove the duty to process the request. If the work does not make sense within the role, the recipient explains why or suggests an alternative that could meet the requester's need. An outside-scope response identifies the boundary and, where known, a suitable alternative role. Where clarification is needed, the recipient requests the necessary information.

Role holders generally prioritise processing incoming role-related messages and requests over executing their existing next actions. They may batch this processing at a convenient time, provided their response remains prompt. Prompt processing does not itself impose a fixed response period or an immediate completion deadline.

A request addressed to a role identifies the holder expected to respond. Where several holders are available, the requester identifies one rather than leaving responsibility ambiguous.

The person who raised a situation remains distinct from the person accepting work to address it. Accepting work does not transfer ownership of the original concern or authority over another role.

Role holders make relevant progress, obstacles and changes in commitments visible to affected people. They distinguish intentions, accepted commitments and completed actions.

Failure to receive a response may itself be raised as a tension and processed directly with the role holder or in a Tactical Meeting. This does not automatically transfer the work, constitute acceptance or complete the request.

## Article 4. Tensions and operational work

A tension is an unresolved gap noticed between the present situation and a possible or needed situation. It may concern a problem, opportunity, uncertainty or structural limitation. A person need not know the solution before raising it.

The first task is to clarify the situation and what is needed. Appropriate responses may include information, conversation, an operational decision within existing authority, an accepted commitment, governance preparation or resolution.

Tensions, commitments and projects remain distinct. Completing associated work does not automatically establish that the tension is resolved.

The raiser may confirm resolution. When someone else believes the tension is resolved, that person requests confirmation; the raiser may confirm or keep it open.

Everyday work decisions remain with the role authorised to make them. Changes to role definitions, ongoing authority or lasting working agreements go through governance.

## Article 5. Development and learning

SDBP distinguishes maintaining existing work, renewing ways of working and developing a fundamentally different approach. It chooses its process according to the nature of the work rather than applying the same planning method to every situation.

For developmental work, those responsible make the direction and immediate next step clear without pretending that the whole route or result is already known. They make significant learning visible: what was attempted, what happened, what was learned and what follows.

Responsibility is explicit, but genuine ownership cannot be created by an assignment alone. Leadership also depends on involvement, judgement and the capacity to support others' contribution.

People distinguish observable events from their interpretations and reactions. They seek clarification before judging motives, and address relevant behaviour directly and respectfully.

Productive disagreement and uncertainty may remain present while people learn. Neither discomfort alone nor attachment to an existing position determines whether a change should be stopped.

The Board maintains a regular opportunity to reflect on SDBP's functioning and improve its way of working. Project participants review significant experiences and lessons at appropriate milestones and project completion. The time and support devoted to reflection are proportionate to the work, its complexity and the responsibilities of those involved.

## Article 6. Governance participation and scope

Governance establishes or changes continuing roles, organisational mandates and standing agreements. It is not a substitute for every operational decision or necessary conversation.

Operational role holders may raise proposals and participate in governance within their roles. Board members participate on the same basis while carrying accountability for SDBP as a whole.

A Board member may object where they identify concrete harm within their Board responsibilities for which they cannot reasonably accept accountability or liability. The objection identifies the specific harm. Board membership alone is not grounds to overrule a proposal.

Financial decisions and formal Board and General Assembly decisions still follow their applicable rules. Taking part in governance does not give a non-Board member a Board vote. Consent cannot replace a required formal decision without following those rules.

## Article 7. Proposals, consent and objections

A proposal describes the situation it addresses, the lasting change being proposed and who has authority to decide it. We record the agreed change separately from the explanation behind it.

Consent is the first decision route. It asks whether a proposal can proceed without a substantive objection; it does not require everyone to prefer the proposal or share the same enthusiasm. If a legitimate objection remains unresolved, the group may consider a facilitated vote as described below. Moving to a vote is an explicit choice, not an automatic consequence of an objection.

Participants have an opportunity to ask clarifying questions, express reactions and raise objections. Preferences and improvement suggestions may inform a proposal without automatically blocking it.

An objection identifies concrete harm or a conflict with a rule we must follow, and explains how accepting the proposal would cause that problem. The objector must explain the concern and why it matters, but is not required to provide a solution, a replacement proposal or the wording of an amendment. The absence of a suggested solution does not invalidate an otherwise legitimate objection.

The facilitator may ask what the objector would need in order to support the proposal, to help understand the concern. This is an invitation to clarify, not a requirement that the objector solve the problem. The objector and other participants may offer suggestions when invited, but only the proposer has the turn and authority to amend the proposal. The proposer decides whether and how to amend it; suggestions do not change the proposal unless the proposer incorporates them.

Integration seeks to address a legitimate objection while preserving the proposal's original need. Any amendment is made by the proposer, and the amended text receives a further opportunity for objections. If the proposer leaves the proposal unchanged, or an amendment does not address the objection, that objection remains unresolved.

An unresolved legitimate objection identifies a risk that must be considered; it is not automatically an absolute veto. Where the group judges the remaining negative impact to be an acceptable trade-off, it may move to a facilitated vote. A vote does not make the objection invalid or establish that it has been resolved. If the proposal is adopted despite it, the decision record preserves the objection, the reason for accepting the impact, and any agreed safeguards or conditions.

The purpose of the vote is to decide whether to accept the remaining trade-off, not to disregard identified harm. A majority result does not override binding rules or remove the need to consider whether the risk is acceptable. The applicable statutory decision requirements continue to apply.

The facilitator guides the process.

To check an objection, we ask:

- What concrete harm would the proposal cause, or which rule we must follow would it conflict with?
- How would accepting the proposal cause that problem?
- Is this a reason not to proceed, rather than a preference or suggestion for improvement?

If people disagree about whether an objection meets these criteria, the Board decides by majority vote after hearing the concern and the reasons for the disagreement. It explains and records its decision. Judging an objection is separate from voting on whether to accept a proposal despite an unresolved objection.

## Article 8. Asynchronous and live governance

We may prepare and consider governance proposals in the SDBP Workspace without meeting at the same time. Where discussion is needed, we use a live governance meeting. Before a decision is recorded, people can see the proposal, how it will be considered, who is involved and the relevant timing.

Quick Consent has a 72-hour response window, starting when the proposer starts the Quick Consent round in the Workspace. No response by the deadline counts as no objection in that process. It is not a statement of support or a formal Board vote.

Participants may ask for discussion through chat or email. A request for discussion does not itself end the Quick Consent round unless it is raised as an objection. An objection may state that the participant does not understand the proposal sufficiently to consent and needs to discuss it. Such an objection ends the Quick Consent route and takes the proposal to a live governance meeting for further processing.

The proposer may amend the proposal in response to an objection during that meeting. The 72-hour response period does not apply to amendments made in the live meeting; participants consider the amended proposal through the live governance process.

The 72-hour response period cannot be extended for an individual round. Changing this rule requires a governance proposal to amend it.

A live governance process separates proposal presentation, clarifying questions, reactions, the proposer's clarification/amendment turn, objections, integration and outcome recording. Only the proposer amends during clarification or integration. If consent cannot be reached, a facilitated vote may follow the explicit fallback choice in Article 7. Facilitation navigation does not itself enact a change. The actual outcome, decision route and adopted wording are recorded explicitly.

A Board meeting is a meeting for the Board to carry out its responsibilities. The Board may invite ambassadors, project leads or other people to provide information or advice. Their attendance is optional and does not give them a Board vote.

A governance meeting involves the people entitled to participate under SDBP's governance arrangements, including relevant role holders. A governance meeting and a Board meeting may take place together. Where an outcome also requires a formal Board decision, that decision is clearly identified and recorded separately.

Formal Board decisions follow the Statutes: normally written notice and an agenda at least seven days ahead; more than half of the Board members present or represented; one vote per Board member; and more than half of the votes cast in favour. Article 10 of the Statutes also provides a specific exception when all Board members are present and agree unanimously, and a separate procedure for decisions outside a meeting.

Everyday project work within agreed authority does not require a Board meeting or Board vote merely because it is carried out for SDBP.

For Board decisions outside a meeting, every Board member must have the opportunity to respond in writing, and none may object to deciding that way. The secretary records the decision and the answers received in a report signed by both the secretary and the chair and attached to the minutes. Silence is not recorded as a vote in favour.

## Article 9. Resources and external representation

Under the current Payment authority agreement, all payments require a Board decision. The accepted proposal behind that agreement specifies majority voting. Giving someone a role, or agreeing a proposal by consent, does not by itself give that person permission to spend SDBP's money.

Payment approval is recorded inside the SDBP Workspace, either in the meeting record or through written approval in a Workspace conversation. The record identifies the payment and which Board members approved it. Written approval in a conversation follows the rules for Board decisions outside a meeting in Article 8.

Anyone representing SDBP externally informs the team beforehand whenever possible and reports all relevant information, outcomes, commitments and deadlines directly afterwards. Permission to communicate or network does not automatically include permission to sign or legally commit SDBP. Article 9 of the Statutes governs that authority.

Organisational knowledge, records and access needed to perform an authorised role remain available through the agreed organisational arrangements. Detailed requirements, including the accepted IT manager definition, remain in the relevant role and agreement records.

## Article 10. Records and tools

People can access current role definitions, lasting working agreements and recorded governance decisions. When these change, we keep their source and history.

Workspace supports asynchronous work, relationships, commitments and organisational memory. Tactical and Governance Meeting tools support live human facilitation. Board communication supports conversation and personal attention.

An unread message, mention, badge, pulse or acknowledgement is not an organisational decision. Opening an item, acknowledging it or pausing its reminder does not complete the underlying work or fulfil a response obligation.

The software supports these rules; it does not independently create authority or amend them. When behaviour in the tool conflicts with an adopted rule, the discrepancy is identified rather than treated as a new rule.

## Article 11. Interpretation and process difficulties

When a rule is unclear, those affected first look at the wording, the authority involved, current agreements and what has actually happened. They state what is uncertain and where their interpretations differ.

The Board president safeguards this Constitution and helps people apply it, keeping the needs and responsibilities of all roles and circles in view. This does not mean taking over decisions entrusted to those roles.

Board members may address an incorrect or stalled process and help those involved correct or restart it. Where a disagreement about these rules needs a decision, the Board decides by majority vote. Any correction respects existing role authority and the decision requirements in this Constitution and the Statutes.

## Article 12. Adoption, continuity and amendment

The Board approves this Constitution by majority vote. Role holders may be invited to help prepare and discuss it. It takes effect once the required formal adoption steps under the Statutes have been completed. We record when it starts and any arrangements needed for the changeover.

Existing agreements and role definitions remain in place unless they are explicitly changed. If adopting this Constitution changes an existing rule, we record that change and who approved it.

Changes to this Constitution go through governance, with everyone it applies to able to take part. SDBP's way of working is shaped and carried by the people doing the work, not by the Board alone.

The Board remains accountable for SDBP as a whole. It may object where a proposed change would harm SDBP or prevent Board members from fulfilling their statutory responsibilities. The Board explains the specific harm or conflict; accountability is not an unrestricted veto.

Where a change requires a formal Board or General Assembly decision, that decision follows the Statutes. Article 18 allows the General Assembly to adopt internal regulations. Taking part in governance does not replace that formal authority.

If a change requires amending the Statutes themselves, Article 19 applies, including the required vote, advance availability of the proposed wording and a notarial deed. We do not amend the Statutes where the change can be made within the existing rules.

Ordinary role and working-agreement changes use governance without rewriting this Constitution, unless they change its basic rules.

## Documents maintained alongside the Constitution

- The current authoritative Statutes and a clear description of the decisions reserved to the Board and General Assembly.
- The current role/circle register and assignments.
- Current standing agreements and their decision history.
- Practical guidance and examples that help people understand and use SDBP's way of working.

These supporting documents make the way of working understandable without treating every method, interface choice or current role as a constitutional rule.$constitution$,
'Imported the published discussion draft; not an adoption.','System import');

create function public.protect_constitution_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.id = '83b0e4aa-5a62-4c2c-a887-e4c8f2cf4b63'::uuid then
    raise exception 'The Constitution record cannot be removed or overwritten. Use versioned replacement.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_constitution_record() from public;
create trigger protect_constitution_record before update or delete on public.records
for each row execute function public.protect_constitution_record();

-- Existing board-wide policies cannot bypass these guards.
create function public.protect_constitution_version() returns trigger
language plpgsql set search_path = '' as $$
declare protected_id constant uuid := '83b0e4aa-5a62-4c2c-a887-e4c8f2cf4b63';
begin
  if (tg_op <> 'INSERT' and old.record_id = protected_id)
    or (tg_op <> 'DELETE' and new.record_id = protected_id) then
    if tg_op = 'DELETE' then raise exception 'Constitution history cannot be deleted.'; end if;
    if current_user <> 'postgres' or auth.uid() is null
      or not public.is_board_member()
      or not (public.is_current_president() or public.is_developer_admin()) then
      raise exception 'Only the president or admin may use the Constitution replacement process.';
    end if;
    if tg_op = 'UPDATE' then
      if old.status <> 'current' or new.status <> 'superseded'
        or (to_jsonb(old) - 'status') is distinct from (to_jsonb(new) - 'status') then
        raise exception 'Existing Constitution text and attribution are read-only.';
      end if;
    elsif new.status <> 'current' or new.effective_on is not null
      or new.uploaded_by is distinct from public.activity_actor_id()
      or new.author_name is distinct from public.activity_actor_name()
      or new.created_at is distinct from now()
      or length(btrim(coalesce(new.constitution_body,''))) < 20
      or length(btrim(coalesce(new.change_reason,''))) < 5 then
      raise exception 'Draft replacement needs text, a reason and server-recorded attribution.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_constitution_version() from public;
create trigger protect_constitution_version before insert or update or delete on public.record_versions
for each row execute function public.protect_constitution_version();

create function public.replace_constitution_draft(new_body text, change_explanation text, expected_version uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target_id constant uuid := '83b0e4aa-5a62-4c2c-a887-e4c8f2cf4b63';
  previous public.record_versions;
  new_id uuid;
  version_number integer;
begin
  if auth.uid() is null or not public.is_board_member()
    or not (public.is_current_president() or public.is_developer_admin()) then
    raise exception 'Only the president or admin may replace the Constitution.';
  end if;
  if length(btrim(coalesce(new_body,''))) < 20 or length(new_body) > 300000
    or length(btrim(coalesce(change_explanation,''))) < 5 or length(change_explanation) > 2000 then
    raise exception 'Provide the Constitution text and an explanation of the changes.';
  end if;
  perform 1 from public.records r where r.id = target_id for update;
  select * into previous from public.record_versions v where v.record_id = target_id and v.status = 'current';
  if not found or previous.id is distinct from expected_version then
    raise exception 'The Constitution changed while you were editing. Reload and review the latest version.';
  end if;
  if previous.effective_on is not null then
    raise exception 'An adopted Constitution cannot be replaced through draft editing.';
  end if;
  if previous.constitution_body = new_body then raise exception 'The text has not changed.'; end if;
  select count(*) + 1 into version_number from public.record_versions v where v.record_id = target_id;
  update public.record_versions set status = 'superseded' where id = previous.id;
  insert into public.record_versions (record_id,version_label,status,constitution_body,change_reason,uploaded_by,author_name,supersedes_version_id)
  values (target_id,version_number::text,'current',new_body,btrim(change_explanation),public.activity_actor_id(),public.activity_actor_name(),previous.id)
  returning id into new_id;
  -- Existing record-version trigger records the replacement in Activity.
  return new_id;
end;
$$;
alter function public.replace_constitution_draft(text,text,uuid) owner to postgres;
revoke all on function public.replace_constitution_draft(text,text,uuid) from public, anon;
grant execute on function public.replace_constitution_draft(text,text,uuid) to authenticated;
commit;
