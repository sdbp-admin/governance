-- Preserve the initial current state for projects created after project history was enabled.
create or replace function public.capture_project_baseline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.summary, '')), '') is not null then
    insert into public.project_updates (project_id, author_id, update_kind, summary, created_at)
    values (
      new.id,
      public.activity_actor_id(),
      'baseline',
      new.summary,
      coalesce(new.last_update_at, new.created_at, now())
    );
  end if;
  return new;
end;
$$;

revoke all on function public.capture_project_baseline() from public;

drop trigger if exists capture_project_baseline on public.projects;
create trigger capture_project_baseline
after insert on public.projects
for each row execute function public.capture_project_baseline();
