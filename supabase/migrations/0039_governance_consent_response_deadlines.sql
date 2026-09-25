-- Quick Consent has a 72-hour response window. Silence is recorded as silence,
-- and a missed deadline routes the proposal to a governance meeting.
begin;

alter table public.governance_consent_rounds
  add column deadline_at timestamptz,
  add column meeting_reason text check (meeting_reason in ('valid_objection', 'unanswered_deadline')),
  add column deadline_notice_needed boolean not null default true,
  add column unanswered_person_ids uuid[] not null default '{}'::uuid[];

-- Give rounds already in progress a full, newly announced response window.
update public.governance_consent_rounds
set deadline_at = now() + interval '72 hours', deadline_notice_needed = true
where status = 'open';

alter table public.governance_consent_rounds
  alter column deadline_at set default (now() + interval '72 hours');

create table public.governance_consent_deadline_notifications (
  proposal_id uuid not null references public.governance_consent_rounds(proposal_id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  kind text not null check (kind in ('deadline_notice', '24_hour_reminder')),
  sent_at timestamptz not null default now(),
  primary key (proposal_id, person_id, kind)
);
alter table public.governance_consent_deadline_notifications enable row level security;
revoke all on public.governance_consent_deadline_notifications from anon, authenticated;

-- Earlier closed rounds did not have a deadline; their history stays intact.
create or replace function public.reject_late_governance_consent_response()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_deadline timestamptz;
begin
  if tg_op = 'INSERT' or new.response is distinct from old.response
    or new.objection_text is distinct from old.objection_text then
    select deadline_at into v_deadline
    from public.governance_consent_rounds
    where proposal_id = new.proposal_id;
    if v_deadline is not null and now() >= v_deadline then
      raise exception 'This response window has ended; the proposal will move to a governance meeting.';
    end if;
  end if;
  return new;
end;
$$;

create trigger reject_late_governance_consent_response
before insert or update on public.governance_consent_responses
for each row execute function public.reject_late_governance_consent_response();

create or replace function public.close_expired_governance_consent_rounds()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_round record;
  v_unanswered uuid[];
  v_closed integer := 0;
begin
  -- Invoked only by the scheduled database job; never grant to API roles.
  for v_round in
    select proposal_id from public.governance_consent_rounds
    where status = 'open' and deadline_at <= now()
    order by deadline_at, proposal_id
    for update skip locked
  loop
    select coalesce(array_agg(p.id order by p.id), '{}'::uuid[])
      into v_unanswered
    from public.people p
    where p.active = true and p.governance_available = true
      and not exists (
        select 1 from public.governance_consent_responses r
        where r.proposal_id = v_round.proposal_id and r.person_id = p.id
      );

    if cardinality(v_unanswered) > 0 then
      update public.governance_consent_rounds
      set status = 'meeting_required', ended_at = now(),
          meeting_reason = 'unanswered_deadline', unanswered_person_ids = v_unanswered
      where proposal_id = v_round.proposal_id and status = 'open';

      perform public.write_activity(
        'governance_quick_consent_unanswered_deadline',
        'governance_proposal', v_round.proposal_id,
        'Quick Consent ended with unanswered responses; governance meeting required.',
        jsonb_build_object('unanswered_person_ids', v_unanswered)
      );
      v_closed := v_closed + 1;
    else
      -- Preserve the existing validity check and explicit-consent acceptance rules.
      perform public.try_finalize_governance_quick_consent(v_round.proposal_id);
    end if;
  end loop;
  return v_closed;
end;
$$;

revoke all on function public.close_expired_governance_consent_rounds() from public, anon, authenticated;

-- The job must exist before the deadline is enforced.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The scheduled endpoint validates a token stored only in Vault. Its validation
-- RPC is callable only by the server-side service role, never by board browsers.
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'sdbp_governance_cron_token');
select vault.create_secret('https://fkypdaqxwllventfikfo.supabase.co', 'sdbp_governance_project_url');

create or replace function public.validate_governance_deadline_cron_token(candidate text)
returns boolean language sql security definer set search_path = public as $$
  select candidate is not null and candidate = (
    select decrypted_secret from vault.decrypted_secrets
    where name = 'sdbp_governance_cron_token' limit 1
  );
$$;
revoke all on function public.validate_governance_deadline_cron_token(text) from public, anon, authenticated;
grant execute on function public.validate_governance_deadline_cron_token(text) to service_role;

select cron.schedule('sdbp-governance-consent-deadlines', '*/5 * * * *',
  'select public.close_expired_governance_consent_rounds()');

select cron.schedule('sdbp-governance-deadline-notifications', '*/15 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'sdbp_governance_project_url') || '/functions/v1/governance-deadlines',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-sdbp-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'sdbp_governance_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
$$);

commit;
