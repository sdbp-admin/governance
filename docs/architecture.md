# Technical architecture

## Status

**The interaction-validation phase is complete and the v1 domain model is frozen.**

The browser prototype successfully validated both required loops:

1. normal operational handoffs through Work, My Attention and Tensions;
2. a facilitator-led Governance Meeting that returns an accepted proposal to the main app and Records.

The project now moves from interaction prototyping to persistence implementation. New workflow features should not be added unless real use exposes a concrete problem.

See [`v1-domain-model.md`](v1-domain-model.md) for the frozen domain and [`operating-model.md`](operating-model.md) for the product boundary.

## Product constraints

The application holds structure, rhythm, memory and process. People retain judgement and leadership.

The app reduces unnecessary meetings. It does not replace necessary conversations.

Governance is facilitator-led. The app guides and records the process; it does not replace the facilitator.

Context links explain why work exists. They do not create automatic lifecycle dependencies.

## Production stack

- Next.js App Router + TypeScript
- Supabase Postgres for application data
- Supabase Auth for invited board-member authentication
- Supabase Storage for authoritative files and organisational records
- Vercel for production hosting and scheduled reminder/harvest jobs
- transactional email provider for notification delivery
- optional Google Drive / Google Docs links for working documents, not as the system of record

The current GitHub Pages build remains the review prototype until persistence and authentication require a production deployment model.

## Frozen domain boundaries

### Organisation

People, roles and role assignments.

Board roles and operating roles use the same role model. Their source of authority differs:

- **Board roles** derive mandatory authority and duties from the SDBP Statutes and applicable law.
- **Operating roles** derive authority from SDBP governance decisions.

Persist role holders through `role_assignments`; do not embed a list of holder ids in the database role row.

### Work

Projects and actions are canonical commitments.

Projects represent outcomes requiring more than one step. Actions are concrete next steps. An action assigned to somebody else can begin as `proposed` and become `open` when accepted.

Actions and projects may link to a source tension. Completion does not resolve that tension automatically.

### Tensions

A tension is a gap between current reality and a potential future sensed by a person.

V1 keeps the practical status set small:

- `open`
- `awaiting_confirmation`
- `resolved`
- `needs_sync`
- `governance`

The raiser resolves their own tension directly. If another person marks it resolved, the raiser confirms or keeps it open.

`needs_sync` and `governance` are routing states, not the beginning of a workflow engine.

### Governance

A structural tension may produce a proposal. The proposal is prepared asynchronously and then used by the facilitator during a real governance meeting.

The meeting window guides:

1. Present Proposal
2. Clarifying Questions
3. Reaction Round
4. Option to Clarify
5. Objection Round
6. Integration, when required
7. Proposal Accepted

Meeting notes remain lightweight structured JSON on the proposal. The application does not persist participant-completion matrices.

For v1, an **accepted governance proposal is the governance decision/agreement**. Records displays it directly. There is no separate `decisions` row duplicating the same organisational result.

A separate `governance_meetings` table is also not required by the validated behaviour. The popup/shareable meeting surface is a presentation mode around the proposal.

### Records

Records and record versions hold organisational documents such as statutes, board minutes and transcripts.

The logical record is separate from its file versions so authoritative history can be retained without destructive replacement.

Accepted governance proposals appear in the Records interface as governance agreements but are not copied into the document tables.

### My Attention

This boundary changed as a direct result of testing.

**My Attention is a projection, not a second system of record.**

It combines canonical state such as:

- proposed/open actions owned by the current person;
- due project updates;
- a tension awaiting the raiser's confirmation;
- governance preparation that requires action;
- small event-driven signals that cannot be derived from the object's current status.

The validated example of the final category is completion of work linked to somebody else's open tension. That creates an `attention_signal` for the tension raiser to review the new reality. The signal does not change the tension state.

Do not persist a generic copy of every action/project/tension inside an `attention_requests` table. That duplication already caused prototype divergence and is explicitly rejected in the frozen model.

Intentional deferral can later be stored as a separate user-specific preference without changing the canonical source object.

## Frozen core schema

The first migration is [`../supabase/migrations/0001_v1_core.sql`](../supabase/migrations/0001_v1_core.sql).

It contains ten application tables:

- `people`
- `roles`
- `role_assignments`
- `projects`
- `tensions`
- `actions`
- `governance_proposals`
- `attention_signals`
- `records`
- `record_versions`

This is smaller than the earlier candidate architecture because validation showed that several apparent entities were just workflow/UI artifacts.

### Deliberately absent from the first migration

- generic `attention_requests`
- `governance_meetings`
- `governance_responses`
- separate `decisions`
- `tension_outcomes`
- generic dependency/link graphs
- `weekly_snapshots`
- generic `activity_log`
- statute-section search tables

These can be introduced later through additive migrations if real use requires them.

## Authentication and authorization

People are domain objects and may exist before login access is connected. `people.auth_user_id` therefore optionally references the Supabase Auth user.

SDBP v1 is one shared board workspace, not a multi-tenant product. The initial authorization model is intentionally simple:

- authentication is invite-only for board users;
- unauthenticated clients receive no application-table access;
- authenticated board users share the organisational data;
- Row Level Security is enabled on every exposed application table;
- more granular record visibility can be added later if SDBP stores material that requires it.

Do not expose a Supabase service-role key to the browser.

## Records and file storage

Authoritative files will live in a **private Supabase Storage bucket**. The database keeps the organisational metadata and version relationships; Storage keeps the file itself.

`record_versions.storage_path` stores the object path. Storage access must use authenticated access/RLS rather than public file URLs.

The Storage schema itself should be treated as Supabase-managed. File operations go through the Storage API rather than direct SQL manipulation of Storage metadata.

Google Drive or Google Docs may be linked as collaborative working sources. They do not determine whether an authoritative SDBP record exists.

## Statute search

Statute search remains deterministic and human-interpreted.

Later, extracted statute sections can use Postgres full-text search with a stored `tsvector`/GIN index. Search returns matching provisions; the software does not provide legal interpretation.

This is a later migration because the current core persistence model does not require statute section extraction to save validated board work.

## Reminder and cadence layer

Do not create per-item scheduled jobs.

After core persistence works, one scheduled job can evaluate dates and state daily to:

- identify due project updates;
- reactivate deferred items;
- send reminders for unresolved attention;
- surface stale exceptions to the Process Steward;
- create the weekly organisational harvest.

Open actions and due project updates should be derived from canonical data rather than copied into reminder tables.

## Seed data rule

The current prototype contains representative/draft data and incomplete board-role information. It must **not** be treated as authoritative production seed data.

Production seeding should happen only from confirmed SDBP information, especially:

- real board-member email addresses;
- actual statutory board offices;
- role definitions taken from the SDBP Statutes/applicable law;
- approved operating roles and accountabilities.

Development-only representative seed data can be added separately when local Supabase development is wired.

## Security rules

1. Every exposed application table has RLS enabled.
2. Production access is restricted to invited/authenticated SDBP users.
3. Authoritative files use private Storage access.
4. Statutes and organisational records are versioned rather than destructively overwritten.
5. Board-role definitions derived from statutes/law are not invented by application code.
6. AI is never required for access control, legal interpretation or core operation.

## Persistence implementation order

1. Apply the frozen core schema to a Supabase development project.
2. Connect Supabase to the app without changing the validated UI behaviour.
3. Add invite-only email authentication and map Auth users to `people`.
4. Persist people, roles and role assignments.
5. Persist projects, actions and tensions.
6. Rebuild My Attention as a projection over canonical persisted state plus `attention_signals`.
7. Persist governance proposals/meeting notes and accepted governance.
8. Add records and private file storage.
9. Add project-update cadence, deferral and reminder delivery.
10. Add Process Steward queries and weekly harvest.
11. Add statute extraction/full-text search.

The guiding rule for this phase is **persistence without product expansion**. The behaviour has been validated; the next work should make that behaviour durable and secure.
