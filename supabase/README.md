# Supabase development handoff

The repository contains the frozen v1 database migration and is connected to the `sdbp-governance-dev` Supabase project through the GitHub integration. The development project follows the `feat/v1-foundation` branch.

`0001_v1_core.sql` has been applied successfully and is visible in Supabase as migration `v1_core`.

## Current connection state

- Data API enabled
- automatic exposure of new tables disabled
- RLS enabled by the migration and project safeguards
- GitHub repository connected: `sdbp-admin/governance`
- Supabase production branch for this development project: `feat/v1-foundation`
- public Project URL and publishable key configured for the GitHub Pages build
- `@supabase/supabase-js` browser client utility added
- no secret/service-role key stored in the repository

The publishable key is intentionally client-visible. Database access remains protected by RLS and authenticated-user policies.

## First persistence milestone

The next connected build should prove only this:

- an invited user can sign in;
- the app resolves that login to a `people` row;
- People/Roles/Projects/Actions/Tensions can be read from Postgres;
- an Action status change persists across browser sessions;
- My Attention is reconstructed from canonical database state rather than copied into another table.

Do not add reminders, file uploads, statute search or additional governance workflow during this milestone.

## Authentication setup still required

Before switching the visible app away from prototype state:

1. configure the production Site URL / allowed redirect URL for the GitHub Pages address;
2. keep self-service signup disabled or use `shouldCreateUser: false` in passwordless sign-in;
3. invite the first real board user from Authentication → Users;
4. create or confirm the matching `people` row and set its `auth_user_id`;
5. verify that authenticated access can read the core tables through RLS.

Do not invent board-member email addresses or legal office assignments from prototype mock data.

## Records storage later

Authoritative documents should use a private Supabase Storage bucket with RLS-controlled access. `record_versions.storage_path` will point to the object path. The bucket and Storage policies belong in a later migration/setup step after the core database/auth connection is proven.

## Seed data

Do not load the prototype mock data into production automatically. Board offices, email addresses and statute-derived role definitions must be confirmed first.

A separate development seed may later reuse representative data, but it must be clearly labelled as non-authoritative.
