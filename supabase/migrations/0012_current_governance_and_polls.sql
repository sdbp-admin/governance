-- SDBP Workspace: living current governance and lightweight conversation polls
-- Current Governance is assembled from canonical role definitions and standing
-- agreements. Accepted proposals carry one explicit governance effect so no AI or
-- later interpretation is needed to know what became true.

alter table public.governance_proposals
  add column if not exists governance_effect jsonb;

create table if not exists public.standing_agreements (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in (
    'organisation_authority',
    'finance',
    'membership',
    'external_relations',
    'events_programmes',
    'ways_of_working',
    'other'
  )),
  title text not null,
  body text not null,
  status text not null default 'current' check (status in ('current', 'repealed')),
  source_proposal_id uuid references public.governance_proposals(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  repealed_at timestamptz
);

create index if not exists standing_agreements_current_category
  on public.standing_agreements(category, title)
  where status = 'current';

alter table public.standing_agreements enable row level security;
grant select on public.standing_agreements to authenticated;
revoke insert, update, delete on public.standing_agreements from authenticated;

drop policy if exists "board members read standing agreements" on public.standing_agreements;
create policy "board members read standing agreements"
on public.standing_agreements
for select
to authenticated
using (public.is_board_member());

create or replace function public.log_standing_agreement_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_activity(
      'standing_agreement_added',
      'standing_agreement',
      new.id,
      'Added standing agreement: ' || new.title
    );
    return new;
  end if;

  if old.status = 'current' and new.status = 'repealed' then
    perform public.write_activity(
      'standing_agreement_repealed',
      'standing_agreement',
      new.id,
      'Repealed standing agreement: ' || new.title
    );
  elsif row(old.category, old.title, old.body) is distinct from row(new.category, new.title, new.body) then
    perform public.write_activity(
      'standing_agreement_updated',
      'standing_agreement',
      new.id,
      'Updated standing agreement: ' || new.title
    );
  end if;
  return new;
end;
$$;

revoke all on function public.log_standing_agreement_activity() from public;

drop trigger if exists log_standing_agreement_activity on public.standing_agreements;
create trigger log_standing_agreement_activity
after insert or update on public.standing_agreements
for each row execute function public.log_standing_agreement_activity();

-- Apply the human-defined effect and accept the proposal atomically. Existing
-- proposals without an effect may still be accepted as historical-only decisions;
-- new UI requires an effect before acceptance.
create or replace function public.accept_governance_proposal_with_effect(
  target_proposal_id uuid,
  final_proposal text,
  final_meeting_notes jsonb,
  final_effect jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tension_id uuid;
  v_stage text;
  v_kind text;
  v_operation text;
  v_target_id uuid;
  v_new_id uuid;
  v_payload jsonb;
  v_title text;
  v_category text;
  v_purpose text;
  v_scope text;
  v_responsibilities text[];
  v_accountabilities text[];
  v_definition_status text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  select gp.tension_id, gp.stage
    into v_tension_id, v_stage
  from public.governance_proposals gp
  where gp.id = target_proposal_id
  for update;

  if not found then
    raise exception 'Governance proposal not found.';
  end if;

  if v_stage = 'accepted' then
    raise exception 'This governance proposal is already accepted.';
  end if;

  if final_effect is not null then
    v_kind := final_effect ->> 'kind';
    v_operation := final_effect ->> 'operation';
    if nullif(final_effect ->> 'targetId', '') is not null then
      v_target_id := (final_effect ->> 'targetId')::uuid;
    end if;

    if v_kind = 'role' then
      if v_operation not in ('create', 'amend', 'remove') then
        raise exception 'Unknown role governance operation.';
      end if;

      if v_operation = 'remove' then
        if v_target_id is null then
          raise exception 'Choose the role to remove.';
        end if;
        delete from public.roles where id = v_target_id;
        if not found then raise exception 'Role not found.'; end if;
      else
        v_payload := final_effect -> 'role';
        if v_payload is null then raise exception 'Role definition is required.'; end if;

        v_title := nullif(trim(coalesce(v_payload ->> 'title', '')), '');
        v_category := v_payload ->> 'category';
        v_purpose := trim(coalesce(v_payload ->> 'purpose', ''));
        v_scope := trim(coalesce(v_payload ->> 'scope', ''));
        select coalesce(array_agg(value), '{}'::text[])
          into v_responsibilities
        from jsonb_array_elements_text(coalesce(v_payload -> 'responsibilities', '[]'::jsonb));
        select coalesce(array_agg(value), '{}'::text[])
          into v_accountabilities
        from jsonb_array_elements_text(coalesce(v_payload -> 'accountabilities', '[]'::jsonb));

        if v_title is null or v_category not in ('board', 'operating') then
          raise exception 'A valid role title and type are required.';
        end if;

        if v_purpose <> '' or v_scope <> '' or cardinality(v_responsibilities) > 0 or cardinality(v_accountabilities) > 0 then
          v_definition_status := 'defined';
        else
          v_definition_status := 'draft';
        end if;

        if v_operation = 'create' then
          insert into public.roles (
            title, category, purpose, scope, responsibilities, accountabilities,
            source, definition_status, updated_at
          ) values (
            v_title, v_category, v_purpose, v_scope, v_responsibilities, v_accountabilities,
            'SDBP governance', v_definition_status, now()
          ) returning id into v_new_id;
          final_effect := jsonb_set(final_effect, '{targetId}', to_jsonb(v_new_id::text), true);
        else
          if v_target_id is null then raise exception 'Choose the role to amend.'; end if;
          update public.roles
          set title = v_title,
              category = v_category,
              purpose = v_purpose,
              scope = v_scope,
              responsibilities = v_responsibilities,
              accountabilities = v_accountabilities,
              source = 'SDBP governance',
              definition_status = v_definition_status,
              updated_at = now()
          where id = v_target_id;
          if not found then raise exception 'Role not found.'; end if;
        end if;
      end if;

    elsif v_kind = 'standing_agreement' then
      if v_operation not in ('create', 'amend', 'repeal') then
        raise exception 'Unknown standing agreement operation.';
      end if;

      if v_operation = 'repeal' then
        if v_target_id is null then raise exception 'Choose the agreement to repeal.'; end if;
        update public.standing_agreements
        set status = 'repealed', repealed_at = now(), updated_at = now(), source_proposal_id = target_proposal_id
        where id = v_target_id and status = 'current';
        if not found then raise exception 'Current standing agreement not found.'; end if;
      else
        v_payload := final_effect -> 'agreement';
        if v_payload is null then raise exception 'Standing agreement text is required.'; end if;
        v_title := nullif(trim(coalesce(v_payload ->> 'title', '')), '');
        v_category := v_payload ->> 'category';
        v_purpose := nullif(trim(coalesce(v_payload ->> 'body', '')), '');

        if v_title is null or v_purpose is null or v_category not in (
          'organisation_authority', 'finance', 'membership', 'external_relations',
          'events_programmes', 'ways_of_working', 'other'
        ) then
          raise exception 'A valid agreement category, title and current text are required.';
        end if;

        if v_operation = 'create' then
          insert into public.standing_agreements (category, title, body, status, source_proposal_id)
          values (v_category, v_title, v_purpose, 'current', target_proposal_id)
          returning id into v_new_id;
          final_effect := jsonb_set(final_effect, '{targetId}', to_jsonb(v_new_id::text), true);
        else
          if v_target_id is null then raise exception 'Choose the agreement to amend.'; end if;
          update public.standing_agreements
          set category = v_category,
              title = v_title,
              body = v_purpose,
              status = 'current',
              source_proposal_id = target_proposal_id,
              updated_at = now(),
              repealed_at = null
          where id = v_target_id;
          if not found then raise exception 'Standing agreement not found.'; end if;
        end if;
      end if;
    else
      raise exception 'Unknown governance effect type.';
    end if;
  end if;

  update public.governance_proposals
  set proposal = trim(final_proposal),
      meeting_notes = coalesce(final_meeting_notes, '{}'::jsonb),
      governance_effect = final_effect,
      stage = 'accepted',
      accepted_at = now(),
      updated_at = now()
  where id = target_proposal_id;

  update public.tensions
  set status = 'resolved',
      resolution_proposed_by = null,
      latest_note = 'Governance proposal accepted: “' || (
        select title from public.governance_proposals where id = target_proposal_id
      ) || '”.',
      resolved_at = now()
  where id = v_tension_id;
end;
$$;

revoke all on function public.accept_governance_proposal_with_effect(uuid, text, jsonb, jsonb) from public;
grant execute on function public.accept_governance_proposal_with_effect(uuid, text, jsonb, jsonb) to authenticated;

-- Lightweight availability poll for tensions that need a real conversation.
create table if not exists public.tension_polls (
  id uuid primary key default gen_random_uuid(),
  tension_id uuid not null unique references public.tensions(id) on delete cascade,
  created_by uuid not null references public.people(id) on delete restrict,
  chosen_option_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tension_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.tension_polls(id) on delete cascade,
  starts_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (poll_id, starts_at)
);

create table if not exists public.tension_poll_participants (
  poll_id uuid not null references public.tension_polls(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  primary key (poll_id, person_id)
);

create table if not exists public.tension_poll_votes (
  poll_id uuid not null references public.tension_polls(id) on delete cascade,
  option_id uuid not null references public.tension_poll_options(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  available boolean not null,
  updated_at timestamptz not null default now(),
  primary key (poll_id, option_id, person_id)
);

create index if not exists tension_poll_options_poll on public.tension_poll_options(poll_id, starts_at);
create index if not exists tension_poll_votes_poll on public.tension_poll_votes(poll_id, option_id);

alter table public.tension_polls enable row level security;
alter table public.tension_poll_options enable row level security;
alter table public.tension_poll_participants enable row level security;
alter table public.tension_poll_votes enable row level security;

grant select on public.tension_polls to authenticated;
grant select on public.tension_poll_options to authenticated;
grant select on public.tension_poll_participants to authenticated;
grant select on public.tension_poll_votes to authenticated;
revoke insert, update, delete on public.tension_polls from authenticated;
revoke insert, update, delete on public.tension_poll_options from authenticated;
revoke insert, update, delete on public.tension_poll_participants from authenticated;
revoke insert, update, delete on public.tension_poll_votes from authenticated;

drop policy if exists "board members read tension polls" on public.tension_polls;
create policy "board members read tension polls" on public.tension_polls
for select to authenticated using (public.is_board_member());
drop policy if exists "board members read tension poll options" on public.tension_poll_options;
create policy "board members read tension poll options" on public.tension_poll_options
for select to authenticated using (public.is_board_member());
drop policy if exists "board members read tension poll participants" on public.tension_poll_participants;
create policy "board members read tension poll participants" on public.tension_poll_participants
for select to authenticated using (public.is_board_member());
drop policy if exists "board members read tension poll votes" on public.tension_poll_votes;
create policy "board members read tension poll votes" on public.tension_poll_votes
for select to authenticated using (public.is_board_member());

create or replace function public.create_tension_poll(
  target_tension_id uuid,
  option_times timestamptz[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_raiser uuid;
  v_status text;
  v_poll_id uuid;
  v_times timestamptz[];
  v_participant_count integer;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();

  select t.raiser_id, t.status into v_raiser, v_status
  from public.tensions t where t.id = target_tension_id for update;
  if not found then raise exception 'Tension not found.'; end if;
  if v_actor is distinct from v_raiser then raise exception 'Only the tension holder can propose meeting times.'; end if;
  if v_status <> 'needs_sync' then raise exception 'This tension is not waiting for a real conversation.'; end if;

  select array_agg(x order by x) into v_times
  from (select distinct x from unnest(coalesce(option_times, '{}'::timestamptz[])) x where x > now()) q;

  if coalesce(cardinality(v_times), 0) < 2 or cardinality(v_times) > 6 then
    raise exception 'Choose between 2 and 6 future times.';
  end if;

  select 1 + count(distinct s.recipient_id) into v_participant_count
  from public.attention_signals s
  where s.tension_id = target_tension_id
    and s.signal_type = 'tension_need'
    and s.acknowledged_at is null
    and s.recipient_id <> v_raiser;

  if v_participant_count < 2 then raise exception 'Tag at least one other person before creating a poll.'; end if;

  delete from public.tension_polls where tension_id = target_tension_id;

  insert into public.tension_polls (tension_id, created_by)
  values (target_tension_id, v_actor)
  returning id into v_poll_id;

  insert into public.tension_poll_participants (poll_id, person_id)
  values (v_poll_id, v_raiser);

  insert into public.tension_poll_participants (poll_id, person_id)
  select v_poll_id, s.recipient_id
  from public.attention_signals s
  where s.tension_id = target_tension_id
    and s.signal_type = 'tension_need'
    and s.acknowledged_at is null
    and s.recipient_id <> v_raiser
  on conflict do nothing;

  insert into public.tension_poll_options (poll_id, starts_at)
  select v_poll_id, x from unnest(v_times) x;

  return v_poll_id;
end;
$$;

revoke all on function public.create_tension_poll(uuid, timestamptz[]) from public;
grant execute on function public.create_tension_poll(uuid, timestamptz[]) to authenticated;

create or replace function public.vote_tension_poll(
  target_poll_id uuid,
  available_option_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();

  if not exists (
    select 1 from public.tension_poll_participants p
    where p.poll_id = target_poll_id and p.person_id = v_actor
  ) then
    raise exception 'You are not part of this conversation poll.';
  end if;

  if exists (
    select 1 from unnest(coalesce(available_option_ids, '{}'::uuid[])) x
    where not exists (
      select 1 from public.tension_poll_options o
      where o.poll_id = target_poll_id and o.id = x
    )
  ) then
    raise exception 'Invalid poll option.';
  end if;

  delete from public.tension_poll_votes
  where poll_id = target_poll_id and person_id = v_actor;

  insert into public.tension_poll_votes (poll_id, option_id, person_id, available)
  select target_poll_id, o.id, v_actor, o.id = any(coalesce(available_option_ids, '{}'::uuid[]))
  from public.tension_poll_options o
  where o.poll_id = target_poll_id;
end;
$$;

revoke all on function public.vote_tension_poll(uuid, uuid[]) from public;
grant execute on function public.vote_tension_poll(uuid, uuid[]) to authenticated;

create or replace function public.choose_tension_poll_option(
  target_poll_id uuid,
  target_option_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_raiser uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();

  select t.raiser_id into v_raiser
  from public.tension_polls p
  join public.tensions t on t.id = p.tension_id
  where p.id = target_poll_id;
  if not found then raise exception 'Poll not found.'; end if;
  if v_actor is distinct from v_raiser then raise exception 'Only the tension holder can choose the time.'; end if;

  if not exists (
    select 1 from public.tension_poll_options o
    where o.poll_id = target_poll_id and o.id = target_option_id
  ) then raise exception 'Poll option not found.'; end if;

  update public.tension_polls
  set chosen_option_id = target_option_id, updated_at = now()
  where id = target_poll_id;
end;
$$;

revoke all on function public.choose_tension_poll_option(uuid, uuid) from public;
grant execute on function public.choose_tension_poll_option(uuid, uuid) to authenticated;

-- Keep an existing poll aligned if the tension holder changes who is needed.
create or replace function public.set_tension_need(
  target_tension_id uuid,
  need_kind text,
  recipient_ids uuid[],
  detail text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_raiser uuid;
  v_names text;
  v_note text;
  v_status text;
  v_poll_id uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if need_kind not in ('input', 'sync') then raise exception 'Unknown tension need.'; end if;

  v_actor := public.activity_actor_id();
  select t.raiser_id into v_raiser from public.tensions t where t.id = target_tension_id for update;
  if not found then raise exception 'Tension not found.'; end if;
  if v_actor is distinct from v_raiser then raise exception 'Only the person who raised the tension can define what they need.'; end if;

  select string_agg(p.name, ', ' order by p.name) into v_names
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;
  if v_names is null then raise exception 'Choose at least one active person.'; end if;

  if need_kind = 'input' then
    v_status := 'open';
    v_note := 'Needs input or help from ' || v_names;
  else
    v_status := 'needs_sync';
    v_note := 'Needs a real conversation with ' || v_names;
  end if;
  if nullif(trim(coalesce(detail, '')), '') is not null then v_note := v_note || ' — ' || trim(detail);
  else v_note := v_note || '.'; end if;

  update public.attention_signals set acknowledged_at = now()
  where tension_id = target_tension_id and signal_type = 'tension_need' and acknowledged_at is null;

  update public.tensions
  set status = v_status, resolution_proposed_by = null, latest_note = v_note
  where id = target_tension_id;

  insert into public.attention_signals (recipient_id, tension_id, project_id, signal_type, message, created_by)
  select p.id, target_tension_id, null, 'tension_need', v_note, v_actor
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  select p.id into v_poll_id from public.tension_polls p where p.tension_id = target_tension_id;
  if v_poll_id is not null then
    if need_kind <> 'sync' then
      delete from public.tension_polls where id = v_poll_id;
    else
      delete from public.tension_poll_votes v
      where v.poll_id = v_poll_id
        and v.person_id <> v_raiser
        and not (v.person_id = any(coalesce(recipient_ids, '{}'::uuid[])));
      delete from public.tension_poll_participants pp
      where pp.poll_id = v_poll_id
        and pp.person_id <> v_raiser
        and not (pp.person_id = any(coalesce(recipient_ids, '{}'::uuid[])));
      insert into public.tension_poll_participants (poll_id, person_id)
      select v_poll_id, p.id
      from public.people p
      where p.active = true
        and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
        and p.id <> v_raiser
      on conflict do nothing;
    end if;
  end if;
end;
$$;

revoke all on function public.set_tension_need(uuid, text, uuid[], text) from public;
grant execute on function public.set_tension_need(uuid, text, uuid[], text) to authenticated;
