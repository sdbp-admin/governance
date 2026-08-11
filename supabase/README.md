# Supabase development handoff

The repository contains the frozen v1 database migration and is now connected to the `sdbp-governance-dev` Supabase project through the GitHub integration. The development project currently follows the `feat/v1-foundation` branch.

## Required development-project setup

1. Create a Supabase development project for SDBP Governance.
2. Disable open public sign-up before treating it as a board workspace; board users should be invited/admin-created.
3. Apply `migrations/0001_v1_core.sql` to the development database through the GitHub integration.
4. From the Supabase project Connect panel, copy the Project URL and publishable key into a local `.env.local` file using `.env.example` as the template.
5. Do not put a Supabase secret/service-role key in browser code or commit it to GitHub.
6. Only after the schema applies cleanly should the Next.js Supabase client/auth utilities be added and the validated prototype state moved from session storage to Postgres.

## First persistence milestone

The first connected build should prove only this:

- an invited user can sign in;
- the app resolves that login to a `people` row;
- People/Roles/Projects/Actions/Tensions can be read from Postgres;
- an Action status change persists across browser sessions;
- My Attention is reconstructed from canonical database state rather than copied into another table.

Do not add reminders, file uploads, statute search or additional governance workflow during this milestone.

## Records storage later

Authoritative documents should use a private Supabase Storage bucket with RLS-controlled access. `record_versions.storage_path` will point to the object path. The bucket and Storage policies belong in a later migration/setup step after the core database/auth connection is proven.

## Seed data

Do not load the prototype mock data into production automatically. Board offices, email addresses and statute-derived role definitions must be confirmed first.

A separate development seed may later reuse representative data, but it must be clearly labelled as non-authoritative.
