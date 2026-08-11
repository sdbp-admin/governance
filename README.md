# SDBP Governance

A lightweight operating system for SDBP board work: clear roles, visible commitments, tension-driven problem solving, evolving governance, organisational memory, and an asynchronous weekly rhythm.

## Product principles

The app holds structure, rhythm, memory, and process. People retain judgement and leadership.

The app reduces unnecessary meetings. It does not replace necessary conversations.

Governance is facilitator-led. The app guides the live process and records the resulting governance change; it does not replace the facilitator.

Discussion can happen anywhere. Organisational commitments and authoritative records belong in the app.

## Current phase: persistence foundation

The interaction model has passed the two validation gates that were required before adding a backend.

### Validated operational loop

- proposed/open actions remain visible in My Attention until done;
- project updates and `No change` work;
- tensions can be raised without knowing the solution;
- linked work can notify the tension raiser without automatically resolving the tension;
- if somebody other than the raiser marks a tension resolved, the raiser confirms or keeps it open.

### Validated governance loop

- a structural tension can move to Governance;
- a proposal can be prepared before the meeting;
- the facilitator can run the Integrative Decision-Making sequence from a dedicated shareable meeting window;
- the app guides rather than replaces the facilitator;
- an accepted proposal returns to the main app and appears under Records → Governance agreements.

The v1 domain model is now frozen in [`docs/v1-domain-model.md`](docs/v1-domain-model.md).

## Important architecture lesson from testing

**My Attention is a projection, not a second source of truth.**

Actions, projects and tensions remain canonical. My Attention derives actionable items from their state and adds only small event-driven signals where needed. This prevents the Work and Attention views from silently diverging.

Likewise, an accepted governance proposal is the governance decision/agreement for v1. The system does not create duplicate `decision` and `governance agreement` records containing the same organisational result.

## Frozen core persistence model

The first schema is defined in [`supabase/migrations/0001_v1_core.sql`](supabase/migrations/0001_v1_core.sql) with ten application tables:

- people
- roles
- role assignments
- projects
- tensions
- actions
- governance proposals
- attention signals
- records
- record versions

The schema deliberately excludes workflow machinery that the validated product does not need.

The `sdbp-governance-dev` Supabase project is connected to `feat/v1-foundation`, and the `v1_core` migration has been applied successfully. The repository now includes the Supabase browser client dependency and public build configuration. The existing UI still uses browser-session prototype state until authentication and confirmed organisational data are ready to replace it.

## Role model

President, Secretary, Treasurer, Vice-President and similar offices are **board roles**. Their authority and mandatory duties come from SDBP's statutes and applicable law.

Process Steward, Membership Administration, Member Communications and similar responsibilities are **operating roles**. Their authority comes from SDBP governance decisions.

The app must not invent the content of statute- or law-based roles. Their definitions should be completed from authoritative sources and linked to those sources.

## What is intentionally not in v1

No AI dependency, dependency graph, tension/action/project choreography, exhaustive asynchronous governance workflow, Gantt planning, nested circle hierarchy, performance scoring, automatic email/WhatsApp ingestion, or elaborate project-management layer is required for the core product.

## Next implementation steps

The current phase is **persistence without product expansion**:

1. configure invite-only authentication and the first confirmed board user;
2. connect that Auth user to a `people` row;
3. read People/Roles/Projects/Actions/Tensions from Postgres;
4. persist an Action status change across browser sessions;
5. rebuild My Attention from canonical persisted state plus attention signals;
6. persist Governance and Records;
7. add reminders, private file storage, statute search and weekly harvest in later passes.

Current prototype data is representative/draft and must not automatically become production seed data. Real board offices, emails and statute-derived role definitions need confirmation first.

See [`docs/operating-model.md`](docs/operating-model.md) for the product boundary and [`docs/architecture.md`](docs/architecture.md) for the persistence architecture.

## Prototype deployment

The review build is published through GitHub Pages from the `feat/v1-foundation` branch. That branch is allowed to deploy to the `github-pages` environment.

The visible prototype still uses browser-session storage. Closing the tab resets the current test state until the persistence cut-over is completed.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example` and provide the public Supabase project URL and publishable key.

Then open `http://localhost:3000`.
