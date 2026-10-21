-- SDBP Governance v1 board authentication boundary
-- Only Supabase users created through an invitation are linked into the board workspace.
-- A normal/public auth signup is not enough to gain application data access.

-- Backfill people rows for users that have already been invited in this development project.
-- Names are derived generically from the email local-part so no personal email address
-- needs to be committed to this public repository.
insert into public.people (name, email, auth_user_id)
select
  initcap(replace(split_part(u.email, '@', 1), '.', ' ')),
  u.email,
  u.id
from auth.users u
where u.email is not null
  and u.invited_at is not null
on conflict (email) do update
set auth_user_id = excluded.auth_user_id,
    active = true,
    updated_at = now();

-- Future dashboard/admin invitations become board profiles automatically.
-- Ordinary signups have invited_at = null and therefore do not enter the workspace.
create or replace function public.link_invited_board_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null and new.invited_at is not null then
    insert into public.people (name, email, auth_user_id)
    values (
      initcap(replace(split_part(new.email, '@', 1), '.', ' ')),
      new.email,
      new.id
    )
    on conflict (email) do update
    set auth_user_id = excluded.auth_user_id,
        active = true,
        updated_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.link_invited_board_user() from public;

-- Covers both a new invitation row and a user record whose invitation metadata is
-- completed by a subsequent auth update.
drop trigger if exists link_invited_board_user on auth.users;
create trigger link_invited_board_user
after insert or update of email, invited_at on auth.users
for each row execute function public.link_invited_board_user();

-- Central membership predicate used by the application-table RLS policies.
create or replace function public.is_board_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.people p
    where p.auth_user_id = auth.uid()
      and p.active = true
  );
$$;

revoke all on function public.is_board_member() from public;
grant execute on function public.is_board_member() to authenticated;

-- Replace the temporary "any authenticated user" development policies with the
-- actual single-workspace board-membership boundary.
drop policy if exists "authenticated board workspace" on public.people;
drop policy if exists "authenticated board workspace" on public.roles;
drop policy if exists "authenticated board workspace" on public.role_assignments;
drop policy if exists "authenticated board workspace" on public.projects;
drop policy if exists "authenticated board workspace" on public.tensions;
drop policy if exists "authenticated board workspace" on public.actions;
drop policy if exists "authenticated board workspace" on public.governance_proposals;
drop policy if exists "authenticated board workspace" on public.attention_signals;
drop policy if exists "authenticated board workspace" on public.records;
drop policy if exists "authenticated board workspace" on public.record_versions;

create policy "board workspace" on public.people
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.roles
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.role_assignments
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.projects
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.tensions
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.actions
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.governance_proposals
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.attention_signals
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.records
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());

create policy "board workspace" on public.record_versions
for all to authenticated
using (public.is_board_member())
with check (public.is_board_member());
