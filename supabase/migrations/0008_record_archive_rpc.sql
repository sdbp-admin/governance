-- SDBP Governance: reliable reversible Records operations
-- Removal/restoration is an explicit database operation: either the record state and
-- activity entry are both written, or the caller receives an error.

-- Avoid duplicate record remove/restore entries: these two events are now written
-- explicitly by the RPCs below rather than by a generic UPDATE trigger.
drop trigger if exists log_record_activity on public.records;

create or replace function public.archive_record(target_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_type text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  select r.title, r.record_type
    into v_title, v_type
  from public.records r
  where r.id = target_record_id
    and r.deleted_at is null
  for update;

  if not found then
    raise exception 'Record not found or already removed.';
  end if;

  update public.records
  set deleted_at = now(),
      deleted_by = public.activity_actor_id(),
      updated_at = now()
  where id = target_record_id;

  perform public.write_activity(
    'record_removed',
    'record',
    target_record_id,
    'Removed ' || replace(v_type, '_', ' ') || ': ' || v_title,
    jsonb_build_object('record_type', v_type)
  );
end;
$$;

revoke all on function public.archive_record(uuid) from public;
grant execute on function public.archive_record(uuid) to authenticated;

create or replace function public.restore_record(target_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_type text;
begin
  if not public.is_board_member() then
    raise exception 'Active board membership required.';
  end if;

  select r.title, r.record_type
    into v_title, v_type
  from public.records r
  where r.id = target_record_id
    and r.deleted_at is not null
  for update;

  if not found then
    raise exception 'Record not found or already active.';
  end if;

  update public.records
  set deleted_at = null,
      deleted_by = null,
      updated_at = now()
  where id = target_record_id;

  perform public.write_activity(
    'record_restored',
    'record',
    target_record_id,
    'Restored ' || replace(v_type, '_', ' ') || ': ' || v_title,
    jsonb_build_object('record_type', v_type)
  );
end;
$$;

revoke all on function public.restore_record(uuid) from public;
grant execute on function public.restore_record(uuid) to authenticated;
