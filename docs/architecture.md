# Technical architecture

## Goal

Keep v1 simple enough for a volunteer board while leaving clean seams for persistence, authentication, reminders, and email delivery.

## Proposed stack

- Next.js App Router + TypeScript
- Supabase for Postgres and email authentication
- Vercel for hosting and a daily reminder/harvest cron
- Transactional email provider for notification delivery

The prototype currently uses in-memory representative data only. Backend services are deliberately not wired before the interaction model is validated.

## Domain boundaries

### Organisation
People, legal positions, operating roles, role assignments, accountabilities.

### Work
Projects and actions.

### Tensions
Raw tensions and their processing outcomes.

### Governance
Structural tensions, proposals, decisions, policies.

### Records
Statutes, minutes, transcripts, agreements, statute sections and links to other domain objects.

### Cadence
Attention requests, defer-until dates, reminders and weekly snapshots.

## Important rules

1. Legal positions and operating roles are different entities.
2. A tension can be captured before its solution is known.
3. Only items requiring a response enter My Attention.
4. Deferred items have an explicit return date; ignored items remain visible and become stale.
5. The Process Steward sees exceptions, not an approval queue.
6. Project updates are prompted on a regular rhythm and allow a one-click `No change` response.
7. The application stores organisational outcomes; it does not attempt to ingest every email or WhatsApp conversation.
8. Statute search is deterministic full-text search. Humans interpret the result.
9. AI is optional enhancement only and must never be required for core operation.

## Persistence model (next implementation step)

Suggested tables:

- people
- legal_positions
- person_legal_positions
- roles
- role_assignments
- role_accountabilities
- projects
- actions
- tensions
- governance_proposals
- governance_responses
- decisions
- records
- statute_sections
- object_links
- attention_requests
- weekly_snapshots
- activity_log

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
- Statutes and governance records need version history rather than destructive replacement.

## MVP build order

1. Validate the current frontend interaction model.
2. Add database schema and seed data.
3. Add email authentication.
4. Persist projects, actions, tensions and attention requests.
5. Add weekly project-update prompts and defer/reminder behavior.
6. Add Process Steward pulse queries.
7. Add organisation/role management.
8. Add lightweight governance workflow.
9. Add records and statute full-text search.
10. Add weekly snapshot/harvest and notification emails.

Do not add dependency graphs, AI, advanced project management, nested circles, metrics, or communication-channel ingestion unless real use creates a tension that justifies them.
