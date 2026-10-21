-- SDBP Workspace: durable, two-sided requests attached to tensions.
-- Notifications remain downstream prompts. Acknowledging or viewing a notification
-- must never change the underlying request state.

create table public.tension_requests (
  id uuid primary key default gen_random_uuid(),
  request_batch_id uuid not null,
  tension_id uuid not null references public.tensions(id) on delete cascade,
  kind text not null check (kind in ('input', 'conversation')),
  requester_id uuid not null references public.people(id) on delete restrict,
  recipient_id uuid not null references public.people(id) on delete restrict,
  detail text,
  status text not null default 'open' check (status in ('open', 'responded', 'closed')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  responded_by uuid references public.people(id) on delete restrict,
  closed_at timestamptz,
  closed_by uuid references public.people(id) on delete restrict,
  close_reason text check (close_reason in ('requester_closed', 'withdrawn', 'tension_resolved', 'moved_to_governance', 'superseded')),
  check (requester_id <> recipient_id),
  check (
    (status = 'open'
      and responded_at is null and responded_by is null
      and closed_at is null and closed_by is null and close_reason is null)
    or
    (status = 'responded'
      and responded_at is not null and responded_by is not null
      and closed_at is null and closed_by is null and close_reason is null)
    or
    (status = 'closed'
      and closed_at is not null and closed_by is not null and close_reason is not null
      and ((responded_at is null and responded_by is null) or (responded_at is not null and responded_by is not null)))
  ),
  check (responded_at is null or responded_at >= requested_at),
  check (closed_at is null or closed_at >= requested_at)
);

create unique index tension_requests_one_operational_recipient
  on public.tension_requests(tension_id, recipient_id)
  where status in ('open', 'responded');

create index tension_requests_recipient_open
  on public.tension_requests(recipient_id, requested_at)
  where status = 'open';

create index tension_requests_requester_operational
  on public.tension_requests(requester_id, requested_at)
  where status in ('open', 'responded');

alter table public.tension_requests enable row level security;

grant select on public.tension_requests to authenticated;
revoke insert, update, delete on public.tension_requests from authenticated;

create policy "board members read tension requests"
on public.tension_requests
for select
to authenticated
using (public.is_board_member());

alter table public.attention_signals
  add column tension_request_id uuid references public.tension_requests(id) on delete set null;

create index attention_signals_tension_request
  on public.attention_signals(tension_request_id)
  where tension_request_id is not null;

create or replace function public.define_tension_requests(
  target_tension_id uuid,
  request_kind text,
  recipient_ids uuid[],
  detail text default ''
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
  v_batch_id uuid := gen_random_uuid();
  v_requested_at timestamptz := now();
  v_recipient_count integer;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if request_kind not in ('input', 'conversation') then raise exception 'Unknown tension request kind.'; end if;

  v_actor := public.activity_actor_id();
  select t.raiser_id, t.status into v_raiser, v_status
  from public.tensions t
  where t.id = target_tension_id
  for update;

  if not found then raise exception 'Tension not found.'; end if;
  if v_actor is distinct from v_raiser then raise exception 'Only the person who raised the tension can define what they need.'; end if;
  if v_status not in ('open', 'needs_sync') then raise exception 'This tension cannot define a tactical request in its current state.'; end if;

  select count(distinct p.id) into v_recipient_count
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  if v_recipient_count < 1 then raise exception 'Choose at least one active person.'; end if;

  update public.tension_requests
  set status = 'closed',
      closed_at = v_requested_at,
      closed_by = v_actor,
      close_reason = 'superseded'
  where tension_id = target_tension_id
    and status in ('open', 'responded');

  insert into public.tension_requests (
    request_batch_id, tension_id, kind, requester_id, recipient_id, detail, requested_at
  )
  select
    v_batch_id,
    target_tension_id,
    request_kind,
    v_actor,
    p.id,
    nullif(trim(coalesce(detail, '')), ''),
    v_requested_at
  from public.people p
  where p.active = true
    and p.id = any(coalesce(recipient_ids, '{}'::uuid[]))
    and p.id <> v_actor;

  perform public.set_tension_need(
    target_tension_id,
    case when request_kind = 'conversation' then 'sync' else 'input' end,
    recipient_ids,
    detail
  );

  update public.attention_signals s
  set tension_request_id = r.id
  from public.tension_requests r
  where r.request_batch_id = v_batch_id
    and r.recipient_id = s.recipient_id
    and s.tension_id = target_tension_id
    and s.signal_type = 'tension_need'
    and s.acknowledged_at is null;

  return v_batch_id;
end;
$$;

revoke all on function public.define_tension_requests(uuid, text, uuid[], text) from public;
grant execute on function public.define_tension_requests(uuid, text, uuid[], text) to authenticated;

create or replace function public.mark_tension_request_responded(target_request_id uuid)
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

  update public.tension_requests
  set status = 'responded',
      responded_at = now(),
      responded_by = v_actor
  where id = target_request_id
    and recipient_id = v_actor
    and status = 'open';

  if not found then raise exception 'Open request not found for this recipient.'; end if;

  update public.attention_signals
  set acknowledged_at = now()
  where tension_request_id = target_request_id
    and recipient_id = v_actor
    and acknowledged_at is null;
end;
$$;

revoke all on function public.mark_tension_request_responded(uuid) from public;
grant execute on function public.mark_tension_request_responded(uuid) to authenticated;

create or replace function public.maintain_tension_request_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_now timestamptz := now();
begin
  if old.status is not distinct from new.status then return new; end if;
  v_actor := public.activity_actor_id();

  if new.status = 'awaiting_confirmation' then
    if new.resolution_proposed_by is null or new.resolution_proposed_by is distinct from v_actor then
      raise exception 'The authenticated actor must be the person proposing resolution.';
    end if;

    update public.tension_requests
    set status = 'responded',
        responded_at = v_now,
        responded_by = v_actor
    where tension_id = new.id
      and recipient_id = v_actor
      and status = 'open';
  elsif new.status in ('resolved', 'governance') then
    update public.tension_requests
    set status = 'closed',
        closed_at = v_now,
        closed_by = v_actor,
        close_reason = case when new.status = 'resolved' then 'tension_resolved' else 'moved_to_governance' end
    where tension_id = new.id
      and status in ('open', 'responded');
  end if;

  return new;
end;
$$;

revoke all on function public.maintain_tension_request_lifecycle() from public;

drop trigger if exists maintain_tension_request_lifecycle on public.tensions;
create trigger maintain_tension_request_lifecycle
after update of status on public.tensions
for each row execute function public.maintain_tension_request_lifecycle();

-- Legacy, unlinked need signals retain their existing behaviour. Durable signals
-- remain aligned with each recipient's independent request state.
create or replace function public.close_tension_attention_when_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then return new; end if;

  if new.status in ('resolved', 'governance') then
    update public.attention_signals
    set acknowledged_at = now()
    where tension_id = new.id
      and signal_type = 'tension_need'
      and acknowledged_at is null;
  elsif new.status = 'awaiting_confirmation' then
    update public.attention_signals
    set acknowledged_at = now()
    where tension_id = new.id
      and signal_type = 'tension_need'
      and acknowledged_at is null
      and (
        tension_request_id is null
        or recipient_id = new.resolution_proposed_by
      );
  end if;

  return new;
end;
$$;

revoke all on function public.close_tension_attention_when_done() from public;
