-- Record explicit declines without conflating the tension raiser, requester,
-- proposed commitment recipient, and the person who accepts work.
begin;

alter table public.actions
  add column proposed_by uuid references public.people(id) on delete set null default public.activity_actor_id(),
  add column decline_reason text check (decline_reason in ('outside_scope', 'other')),
  add column decline_note text,
  add column suggested_role_id uuid references public.roles(id) on delete set null,
  add column declined_at timestamptz,
  add constraint actions_decline_detail_check check (
    decline_reason is null or
    (status = 'cancelled' and declined_at is not null and
      (decline_reason = 'outside_scope' or nullif(trim(coalesce(decline_note, '')), '') is not null))
  );

create or replace function public.decline_proposed_action(target_action_id uuid, reason text, explanation text default null, suggested_role uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();
  if reason not in ('outside_scope', 'other') or (reason = 'other' and nullif(trim(coalesce(explanation, '')), '') is null) then
    raise exception 'Choose a decline reason; Other needs a written explanation.';
  end if;
  if suggested_role is not null and not exists (select 1 from public.roles where id = suggested_role and not is_circle) then
    raise exception 'Suggested role not found.';
  end if;
  update public.actions set status = 'cancelled', decline_reason = reason,
    decline_note = nullif(trim(coalesce(explanation, '')), ''), suggested_role_id = suggested_role,
    declined_at = now(), updated_at = now()
  where id = target_action_id and owner_id = v_actor and status = 'proposed';
  if not found then raise exception 'Proposed commitment not found for this recipient.'; end if;
end;
$$;
revoke all on function public.decline_proposed_action(uuid, text, text, uuid) from public;
grant execute on function public.decline_proposed_action(uuid, text, text, uuid) to authenticated;

alter table public.tension_requests
  add column role_id uuid references public.roles(id) on delete set null,
  add column decline_reason text check (decline_reason in ('outside_scope', 'other')),
  add column decline_note text,
  add column suggested_role_id uuid references public.roles(id) on delete set null,
  add column declined_at timestamptz;

alter table public.tension_requests drop constraint tension_requests_status_check;
alter table public.tension_requests add constraint tension_requests_status_check
  check (status in ('open', 'responded', 'declined', 'closed'));
alter table public.tension_requests drop constraint tension_requests_check1;
alter table public.tension_requests add constraint tension_requests_state_check check (
  (status = 'open' and responded_at is null and responded_by is null and closed_at is null and closed_by is null and close_reason is null and declined_at is null and decline_reason is null)
  or (status = 'responded' and responded_at is not null and responded_by is not null and closed_at is null and closed_by is null and close_reason is null and declined_at is null)
  or (status = 'declined' and responded_at is not null and responded_by is not null and closed_at is null and closed_by is null and close_reason is null and declined_at is not null and decline_reason is not null)
  or (status = 'closed' and closed_at is not null and closed_by is not null and close_reason is not null and ((responded_at is null and responded_by is null) or (responded_at is not null and responded_by is not null)))
);
alter table public.tension_requests add constraint tension_requests_decline_detail_check
  check (decline_reason is null or (decline_reason = 'outside_scope' or nullif(trim(coalesce(decline_note, '')), '') is not null));

create or replace function public.define_role_tension_request(target_tension_id uuid, request_kind text, target_role_id uuid, target_recipient_id uuid, detail text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_batch uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  if not exists (
    select 1 from public.roles r join public.role_assignments ra on ra.role_id = r.id
    join public.people p on p.id = ra.person_id
    where r.id = target_role_id and not r.is_circle and ra.ends_on is null
      and ra.person_id = target_recipient_id and p.active
  ) then raise exception 'Choose an active holder of this role.'; end if;
  v_batch := public.define_tension_requests(target_tension_id, request_kind, array[target_recipient_id], detail);
  update public.tension_requests set role_id = target_role_id where request_batch_id = v_batch;
  return v_batch;
end;
$$;
revoke all on function public.define_role_tension_request(uuid, text, uuid, uuid, text) from public;
grant execute on function public.define_role_tension_request(uuid, text, uuid, uuid, text) to authenticated;

create or replace function public.decline_tension_request(target_request_id uuid, reason text, explanation text default null, suggested_role uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid;
begin
  if not public.is_board_member() then raise exception 'Active board membership required.'; end if;
  v_actor := public.activity_actor_id();
  if reason not in ('outside_scope', 'other') or (reason = 'other' and nullif(trim(coalesce(explanation, '')), '') is null) then
    raise exception 'Choose a decline reason; Other needs a written explanation.';
  end if;
  if suggested_role is not null and not exists (select 1 from public.roles where id = suggested_role and not is_circle) then
    raise exception 'Suggested role not found.';
  end if;
  update public.tension_requests set status = 'declined', responded_at = now(), responded_by = v_actor,
    decline_reason = reason, decline_note = nullif(trim(coalesce(explanation, '')), ''),
    suggested_role_id = suggested_role, declined_at = now()
  where id = target_request_id and recipient_id = v_actor and status = 'open';
  if not found then raise exception 'Open request not found for this recipient.'; end if;
  update public.attention_signals set acknowledged_at = now()
  where tension_request_id = target_request_id and recipient_id = v_actor and acknowledged_at is null;
end;
$$;
revoke all on function public.decline_tension_request(uuid, text, text, uuid) from public;
grant execute on function public.decline_tension_request(uuid, text, text, uuid) to authenticated;

commit;
