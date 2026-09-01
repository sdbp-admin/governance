-- SDBP Governance v1 core schema
-- Frozen after the operational and facilitator-led governance loops were validated.
-- This migration defines application data only. Storage buckets, auth invitations,
-- reminder jobs and statute search are added in later migrations.

create table public.people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  active boolean not null default true,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('board', 'operating')),
  purpose text not null default '',
  scope text not null default '',
  responsibilities text[] not null default '{}',
  accountabilities text[] not null default '{}',
  source text not null default '',
  definition_status text not null default 'draft' check (definition_status in ('draft', 'defined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index role_assignments_active_person_role
  on public.role_assignments(role_id, person_id)
  where ends_on is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner_id uuid not null references public.people(id),
  role_id uuid references public.roles(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'paused', 'complete')),
  summary text not null default '',
  last_update_at timestamptz,
  next_prompt_on date,
  source_tension_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.tensions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  raiser_id uuid not null references public.people(id),
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'awaiting_confirmation', 'resolved', 'needs_sync', 'governance')),
  resolution_proposed_by uuid references public.people(id) on delete set null,
  latest_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.projects
  add constraint projects_source_tension_fk
  foreign key (source_tension_id) references public.tensions(id) on delete set null;

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner_id uuid not null references public.people(id),
  status text not null default 'proposed' check (status in ('proposed', 'open', 'done', 'cancelled')),
  due_on date,
  source_label text,
  source_tension_id uuid references public.tensions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.governance_proposals (
  id uuid primary key default gen_random_uuid(),
  tension_id uuid not null unique references public.tensions(id) on delete restrict,
  title text not null,
  proposal text not null,
  proposer_id uuid not null references public.people(id),
  stage text not null default 'prepared' check (stage in (
    'prepared',
    'present_proposal',
    'clarifying_questions',
    'reaction_round',
    'clarify',
    'objection_round',
    'integration',
    'accepted'
  )),
  meeting_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Persist only event-driven attention that cannot be safely derived from canonical
-- object state. Proposed/open actions and due project updates are projections and
-- are intentionally not duplicated here.
create table public.attention_signals (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.people(id) on delete cascade,
  tension_id uuid not null references public.tensions(id) on delete cascade,
  message text not null,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table public.records (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  record_type text not null check (record_type in ('statutes', 'board_minutes', 'transcript', 'other')),
  description text not null default '',
  source text,
  working_document_url text,
  created_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.record_versions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.records(id) on delete cascade,
  version_label text not null,
  status text not null default 'draft' check (status in ('draft', 'current', 'superseded')),
  effective_on date,
  storage_path text,
  mime_type text,
  uploaded_by uuid references public.people(id) on delete set null,
  supersedes_version_id uuid references public.record_versions(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index record_versions_one_current
  on public.record_versions(record_id)
  where status = 'current';

create index people_auth_user on public.people(auth_user_id);
create index role_assignments_person on public.role_assignments(person_id) where ends_on is null;
create index projects_owner_status on public.projects(owner_id, status);
create index projects_next_prompt on public.projects(next_prompt_on) where status = 'active';
create index tensions_raiser_status on public.tensions(raiser_id, status);
create index actions_owner_status on public.actions(owner_id, status);
create index actions_due on public.actions(due_on) where status in ('proposed', 'open');
create index governance_proposals_stage on public.governance_proposals(stage);
create index attention_signals_recipient_open on public.attention_signals(recipient_id, created_at desc) where acknowledged_at is null;
create index record_versions_record on public.record_versions(record_id, created_at desc);

-- SDBP v1 is a single shared board workspace. Authentication is invite-only;
-- authenticated board users share the organisational data. RLS remains enabled so
-- unauthenticated clients cannot access these tables and more granular policies can
-- be introduced later without changing the data model.

alter table public.people enable row level security;
alter table public.roles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.projects enable row level security;
alter table public.tensions enable row level security;
alter table public.actions enable row level security;
alter table public.governance_proposals enable row level security;
alter table public.attention_signals enable row level security;
alter table public.records enable row level security;
alter table public.record_versions enable row level security;

grant select, insert, update, delete on public.people to authenticated;
grant select, insert, update, delete on public.roles to authenticated;
grant select, insert, update, delete on public.role_assignments to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.tensions to authenticated;
grant select, insert, update, delete on public.actions to authenticated;
grant select, insert, update, delete on public.governance_proposals to authenticated;
grant select, insert, update, delete on public.attention_signals to authenticated;
grant select, insert, update, delete on public.records to authenticated;
grant select, insert, update, delete on public.record_versions to authenticated;

create policy "authenticated board workspace" on public.people for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.roles for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.role_assignments for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.projects for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.tensions for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.actions for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.governance_proposals for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.attention_signals for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.records for all to authenticated using (true) with check (true);
create policy "authenticated board workspace" on public.record_versions for all to authenticated using (true) with check (true);
