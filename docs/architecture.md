# Technical architecture

## Goal

Keep v1 simple enough for a volunteer board while leaving clean seams for persistence, authentication, reminders, email delivery and organisational records.

The application holds structure, rhythm, memory and process. People retain judgement and leadership.

## Current phase: interaction validation

The prototype has no backend. Representative state is held in the browser and mirrored to session storage so interaction testing survives navigation and refresh within the current tab. Closing the tab resets the prototype.

This browser-session persistence is only a testing aid. It is not the production persistence model and should not influence the database design beyond exposing which objects and transitions actually need to persist.

Backend services are deliberately not wired until the central operating loop has been validated.

The interaction gate is one complete loop:

1. a person receives an attention request;
2. a project is updated, confirmed unchanged, or produces a tension;
3. a tension is raised without requiring a solution;
4. the tension is processed into information, an action, a project, a governance change, synchronous discussion, or no further action;
5. resulting commitments become visible in Work and My Attention;
6. SDBP Pulse reflects the changed organisational reality.

Only after this loop is coherent should the persistence model be frozen.

## Proposed production stack

- Next.js App Router + TypeScript
- Supabase Postgres for application data
- Supabase Auth for board-member authentication
- Supabase Storage for authoritative files and organisational records
- Vercel for production hosting and a daily reminder/harvest cron
- transactional email provider for notification delivery
- optional Google Drive / Google Docs links for working documents, not as the application's system of record

## Domain boundaries

### Organisation

People, roles, role definitions and role assignments.

All formal offices and operating responsibilities use the same underlying role model. The distinction is the role's source of authority:

- **Board roles** such as President, Secretary, Treasurer or Vice-President derive authority and mandatory duties from the SDBP Statutes and applicable law.
- **Operating roles** such as Process Steward or Membership Administration derive authority from SDBP governance decisions.

A role may contain purpose, scope, responsibilities, accountabilities, source, definition status and one or more holders.

The app must never silently invent the content of a statute- or law-based role.

### Work

Projects and actions.

Projects represent outcomes requiring more than one step. Actions are concrete next steps. Proposed actions assigned to another person require acceptance before becoming open commitments.

### Tensions

A tension is a gap between current reality and a potential future sensed by a person. It may point to a problem, opportunity, missing clarity or barrier.

A tension may be captured before its solution is known. Processing asks what is needed and may result in:

- information;
- an action;
- a project;
- a governance change;
- synchronous discussion;
- no further action.

### Governance

Structural tensions, proposals, objections, integrations and resulting governance decisions.

Governance changes ongoing roles, accountabilities, domains or policies. Operational work does not become governance merely because it is important.

The prototype uses the Integrative Decision-Making sequence as descriptive guidance rather than attempting to automate human judgement about valid objections.

### Records

Statutes, minutes, transcripts, governance agreements, versions, statute sections and links to other domain objects.

Records are the organisational memory. Working documents may live in Google Docs, but approved or authoritative records belong in the application.

The current statutes should be explicitly identifiable as the authoritative version, with version/date/history and superseded versions retained.

### Cadence

Attention requests, defer-until dates, reminders, project-update prompts and weekly snapshots.

Email is a pull mechanism back into the application, not a second system of record.

## Important rules

1. Board roles and operating roles share a role model; their authority comes from different sources.
2. A tension can be captured before its solution is known.
3. Only items requiring a response enter My Attention.
4. Deferred items have an explicit return date; ignored items remain visible and become stale.
5. The Process Steward sees exceptions, not an approval queue.
6. Project updates are prompted on a regular rhythm and allow a one-click `No change` response.
7. Discussion can happen anywhere; organisational commitments and authoritative records must be captured in the app.
8. The application does not ingest every email or WhatsApp conversation.
9. Statute search is deterministic full-text search. Humans interpret matching provisions.
10. AI is an optional enhancement only and must never be required for core operation.
11. Operating governance cannot silently override the Statutes, applicable law or other nondelegable constraints.

## Candidate persistence model

This remains a candidate until the interaction-validation gate is passed.

Suggested tables:

- `people`
- `roles`
- `role_assignments`
- `role_responsibilities`
- `role_accountabilities`
- `projects`
- `actions`
- `tensions`
- `tension_outcomes`
- `governance_proposals`
- `governance_responses`
- `decisions`
- `records`
- `record_versions`
- `statute_sections`
- `object_links`
- `attention_requests`
- `weekly_snapshots`
- `activity_log`

A role record should include at minimum category (`board` or `operating`), title, purpose, scope, source and definition status. Source links can later connect a board role to a statute provision or governance record.

## Records and file storage

Supabase Storage is the preferred storage layer for authoritative PDFs and other files. The database stores metadata and version relationships; Storage holds the binary file.

Typical record metadata:

- title;
- type;
- version;
- current / superseded status;
- effective date;
- uploaded by;
- source;
- supersedes / superseded-by relationship;
- storage path;
- optional working-document URL.

Google Drive or Google Docs may be linked as a collaborative working source. They should not determine whether an authoritative SDBP record exists or who may access the governance application.

## Reminder engine

A single scheduled job can run daily and:

1. create due project-update prompts;
2. reactivate deferred attention requests whose defer date has arrived;
3. send reminders for unanswered attention requests according to a small cadence;
4. flag old unanswered requests as stale for the Process Steward view;
5. generate the weekly organisational harvest on the configured weekday.

Avoid per-item scheduled jobs. Store dates and let one daily job decide what is due.

## Security

- Board-member-only authenticated application.
- Row-level database policies should enforce organisation membership.
- Records may require a visibility classification if SDBP later stores sensitive board material.
- Statutes and governance records require version history rather than destructive replacement.
- File access should follow application permissions rather than depend on public URLs.

## Revised v1 build order

1. Validate one complete frontend operating loop using browser-session state.
2. Consolidate and freeze the v1 domain model from what was learned.
3. Add Supabase schema and seed data.
4. Add email authentication.
5. Persist projects, actions, tensions and attention requests.
6. Add weekly project-update prompts and defer/reminder behaviour.
7. Add Process Steward pulse queries.
8. Persist organisation and role management.
9. Add lightweight governance workflow persistence.
10. Add records, file storage and statute full-text search.
11. Add weekly snapshot/harvest and notification emails.

UI exploration of later domains is allowed before their persistence step when it helps validate the model. It does not change the backend implementation order.

Do not add dependency graphs, AI, advanced project management, nested circles, performance metrics or communication-channel ingestion unless real SDBP use creates a tension that justifies them.
