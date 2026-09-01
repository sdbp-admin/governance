-- SDBP Workspace: repair objections incorrectly grandfathered as valid at present_proposal.
--
-- Migration 0021 preserved old meeting_required objections as valid whenever the proposal
-- had moved beyond prepared. That was too broad: present_proposal is only the opening
-- screen and, by design, can still be rerouted to asynchronous quick consent. No
-- substantive governance processing has happened at that point.
--
-- Only objections that were auto-classified by the migration are repaired here. A
-- genuinely reviewed valid objection has objection_reviewed_by / objection_reviewed_at
-- populated and is left untouched. Existing no-objection responses are not changed.

update public.governance_consent_responses r
set objection_status = 'pending_validation',
    objection_reviewed_by = null,
    objection_reviewed_at = null,
    objection_review_reason = null
from public.governance_consent_rounds cr
join public.governance_proposals gp on gp.id = cr.proposal_id
where r.proposal_id = cr.proposal_id
  and r.response = 'objection'
  and r.objection_status = 'valid'
  and r.objection_reviewed_by is null
  and r.objection_reviewed_at is null
  and cr.status = 'meeting_required'
  and gp.stage = 'present_proposal';

update public.governance_proposals gp
set stage = 'prepared',
    updated_at = now()
from public.governance_consent_rounds cr
where cr.proposal_id = gp.id
  and cr.status = 'meeting_required'
  and gp.stage = 'present_proposal'
  and exists (
    select 1
    from public.governance_consent_responses r
    where r.proposal_id = gp.id
      and r.response = 'objection'
      and r.objection_status = 'pending_validation'
      and r.objection_reviewed_by is null
      and r.objection_reviewed_at is null
  );

update public.governance_consent_rounds cr
set status = 'open',
    ended_at = null
where cr.status = 'meeting_required'
  and exists (
    select 1
    from public.governance_proposals gp
    join public.governance_consent_responses r on r.proposal_id = gp.id
    where gp.id = cr.proposal_id
      and gp.stage = 'prepared'
      and r.response = 'objection'
      and r.objection_status = 'pending_validation'
      and r.objection_reviewed_by is null
      and r.objection_reviewed_at is null
  );
