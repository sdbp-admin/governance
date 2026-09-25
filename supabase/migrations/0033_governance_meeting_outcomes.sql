-- SDBP Workspace: explicit non-acceptance outcomes from a live Governance Meeting.

alter table public.governance_proposals
  drop constraint if exists governance_proposals_stage_check;

alter table public.governance_proposals
  add constraint governance_proposals_stage_check
  check (stage in (
    'prepared',
    'present_proposal',
    'clarifying_questions',
    'reaction_round',
    'clarify',
    'objection_round',
    'integration',
    'deferred',
    'withdrawn',
    'accepted'
  ));
