-- Persist each member's most recent authenticated workspace presence.
-- Realtime online/offline state itself is handled by Supabase Realtime Presence;
-- this timestamp provides the durable "last seen" value after a member disconnects.

alter table public.people
  add column if not exists last_seen_at timestamptz;

create or replace function public.touch_my_last_seen()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  touched_at timestamptz := now();
begin
  update public.people
  set last_seen_at = touched_at
  where auth_user_id = auth.uid()
    and active = true;

  if not found then
    raise exception 'Active workspace membership required.';
  end if;

  return touched_at;
end;
$$;

revoke all on function public.touch_my_last_seen() from public;
grant execute on function public.touch_my_last_seen() to authenticated;
