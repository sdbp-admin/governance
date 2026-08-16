-- SDBP Workspace: asynchronous quick consent for prepared governance proposals.
--
-- This is deliberately not majority voting. Every active board-workspace member must
-- explicitly record "no objection" for a proposal to pass asynchronously. A single
-- objection stops the consent round and makes a governance meeting required.

create table if not exists public.governance_consent_rounds (
  proposal_id uuid primary key references public.governance_proposals(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'meeting_required', 'accepted')),
  started_by uuid not null references public.people(id) on delete restrict,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.governance_consent_responses (
  proposal_id uuid not null references public.governance_consent_rounds(proposal_id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  response text not null check (response in ('no_objection', 'objection')),
  objection_text text,
  responded_at timestamptz not null default now(),
  primary key (proposal_id, person_id),
  check (
    (response = 'no_objection' and objection_text is null)
    or
    (response = 'objection' and nullif(trim(objection_text), '') is not null)
  )
);

create index if not exists governance_consent_responses_proposal
  on public.governance_consent_responses(proposal_id, responded_at);

alter table public.governance_consent_rounds enable row level security;
alter table public.governance_consent_responses enable row level security;

grant select on public.governance_consent_rounds to authenticated;
grant select on public.governance_consent_responses to authenticated;
revoke insert, update, delete on public.governance_consent_rounds from authenticated;
revoke insert, update, delete on public.governance_consent_responses from authenticated;

drop policy if exists "board members read governance consent rounds" on public.governance_consent_rounds;
create policy "board members read governance consent rounds"
on public.governance_consent_rounds
for select
to authenticated
using (public.is_board_member());

drop policy if exists "board members read governance consent responses" on public.governance_consent_responses;
create policy "board members read governance consent responses"
on public.governance_consent_responses
for select
to authenticated
using (public.is_board_member());

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
  if v_stage <> 'prepared' then
    raise exception 'Quick consent is only available before the governance meeting starts.';
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

  insert into public.governance_consent_rounds (proposal_id, started_by)
  values (target_proposal_id, v_actor);

  perform public.write_activity(
    'governance_quick_consent_started',
    'governance_proposal',
    target_proposal_id,
    'Started quick consent for governance proposal.'
  );
end;
$$;

revoke all on function public.start_governance_quick_consent(uuid) from public;
grant execute on function public.start_governance_quick_consent(uuid) to authenticated;

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
  v_title text;
  v_proposal text;
  v_notes jsonb;
  v_effect jsonb;
  v_reason text;
  v_required integer;
  v_consented integer;
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

  select r.status, gp.stage, gp.title, gp.proposal, gp.meeting_notes, gp.governance_effect
    into v_round_status, v_stage, v_title, v_proposal, v_notes, v_effect
  from public.governance_consent_rounds r
  join public.governance_proposals gp on gp.id = r.proposal_id
  where r.proposal_id = target_proposal_id
  for update of r, gp;

  if not found then raise exception 'Quick consent has not been started for this proposal.'; end if;
  if v_round_status <> 'open' then
    raise exception 'This quick consent round is already closed.';
  end if;
  if v_stage <> 'prepared' then
    raise exception 'The governance meeting has already started.';
  end if;

  insert into public.governance_consent_responses (
    proposal_id, person_id, response, objection_text, responded_at
  ) values (
    target_proposal_id,
    v_actor,
    consent_response,
    case when consent_response = 'objection' then v_reason else null end,
    now()
  )
  on conflict (proposal_id, person_id) do update
  set response = excluded.response,
      objection_text = excluded.objection_text,
      responded_at = now();

  if consent_response = 'objection' then
    update public.governance_consent_rounds
    set status = 'meeting_required', ended_at = now()
    where proposal_id = target_proposal_id;

    perform public.write_activity(
      'governance_quick_consent_objection',
      'governance_proposal',
      target_proposal_id,
      'Objection raised during quick consent; governance meeting required.',
      jsonb_build_object('person_id', v_actor, 'objection', v_reason)
    );

    return 'meeting_required';
  end if;

  select count(*) into v_required
  from public.people p
  where p.active = true;

  select count(*) into v_consented
  from public.governance_consent_responses r
  join public.people p on p.id = r.person_id and p.active = true
  where r.proposal_id = target_proposal_id
    and r.response = 'no_objection';

  if v_required > 0 and v_consented = v_required then
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

revoke all on function public.respond_governance_quick_consent(uuid, text, text) from public;
grant execute on function public.respond_governance_quick_consent(uuid, text, text) to authenticated;
