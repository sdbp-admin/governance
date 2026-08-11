# Technical architecture

## Goal

Keep v1 simple enough for a volunteer board while leaving clean seams for persistence, authentication, reminders, email delivery and organisational records.

The application holds structure, rhythm, memory and process. People retain judgement and leadership.

The app reduces unnecessary meetings. It does not replace necessary conversations.

Governance is facilitator-led. The app guides and records the process; it does not replace the facilitator or force the board to reproduce a real meeting as asynchronous software workflow.

See [`operating-model.md`](operating-model.md) for the current product boundary.

## Current phase: simplification and interaction validation

The prototype has no backend. Representative state is held in the browser and mirrored to session storage so interaction testing survives navigation and refresh within the current tab. Closing the tab resets the prototype.

This browser-session persistence is only a testing aid. It is not the production persistence model.

The prototype recently accumulated more state than the target product needs, particularly around tension dependencies and participant-by-participant governance rounds. That complexity is now explicitly scheduled for removal before the persistence model is frozen.

Backend services remain deliberately unwired until two loops have been validated.

### Operational interaction gate

1. a person receives an attention request;
2. a project is updated, confirmed unchanged, or produces a tension;
3. a tension is raised without requiring a solution;
4. people address the tension through normal work or conversation;
5. a person may mark the tension resolved;
6. if that person is not the raiser, the raiser confirms or keeps it open;
7. SDBP Pulse reflects the resulting organisational reality.

Actions and projects may be linked to the tension for context, but their states do not automatically determine whether the tension is resolved.

### Governance meeting interaction gate

1. a structural tension is flagged for Governance;
2. the raiser may prepare a proposal before the meeting;
3. the board holds a real governance meeting, in person or through a tool such as Google Meet;
4. the facilitator runs the Integrative Decision-Making sequence from one shared Governance screen;
5. the app displays the current step, proper process language, useful guidance and objection criteria;
6. the facilitator advances the process manually;
7. the accepted proposal and resulting governance change are recorded.

The prototype should not require every participant to log in and digitally complete each round before the facilitator can continue.

Only after these loops are coherent should the persistence model be frozen.

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

Projects represent outcomes requiring more than one step. Actions are concrete next steps. Proposed actions assigned to another person may require acceptance before becoming that person's open commitment.

Actions and projects may link to a source tension. That link is contextual. It is not a dependency rule.

### Tensions

A tension is a gap between current reality and a potential future sensed by a person. It may point to a problem, opportunity, missing clarity or barrier.

A tension can be captured before its solution is known.

The target v1 lifecycle is intentionally small:

- `open`
- `awaiting_confirmation`
- `resolved`

The raiser can resolve their own tension directly. If another person marks it resolved, the raiser confirms or keeps it open.

A tension may also be routed to a synchronous conversation or Governance when that is the appropriate way to process it. Those routes should not grow into a dependency state machine.

The target v1 model does not need separate waiting kinds for responses, actions, projects or confirmation, and does not automatically resolve tensions when linked work changes state.

### Governance

Governance changes ongoing roles, accountabilities, domains or standing policies. Operational work does not become governance merely because it is important.

A structural tension and optional draft proposal can be prepared asynchronously. The actual governance process is facilitator-led and can be run during a real meeting.

The Governance Meeting screen should act as a live guide through:

1. Present Proposal
2. Clarifying Questions
3. Reaction Round
4. Option to Clarify
5. Objection Round
6. Integration, when required
7. Proposal Accepted

The application may capture important clarifications, objections, integration notes and the current proposal text. These are meeting records, not software gates.

The facilitator controls progression. The app displays the adopted objection criteria but does not algorithmically decide whether an objection is valid.

The target persistence model should store the meaningful proposal, decision and governance result rather than a participant completion matrix for every round.

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
3. Links between tensions, actions and projects provide context, not automatic lifecycle dependencies.
4. Only items requiring a response enter My Attention.
5. Deferred items have an explicit return date; ignored items remain visible and become stale.
6. The Process Steward sees exceptions, not an approval queue.
7. Project updates are prompted on a regular rhythm and allow a one-click `No change` response.
8. Discussion can happen anywhere; organisational commitments and authoritative records must be captured in the app.
9. The app reduces unnecessary meetings but preserves a route to synchronous conversation whenever judgement or interaction requires it.
10. Governance is facilitator-led. The software guides and records; it does not replace the facilitator.
11. The application does not ingest every email or WhatsApp conversation.
12. Statute search is deterministic full-text search. Humans interpret matching provisions.
13. AI is an optional enhancement only and must never be required for core operation.
14. Operating governance cannot silently override the Statutes, applicable law or other nondelegable constraints.

## Candidate persistence model

This remains a candidate until the simplified interaction-validation gate is passed.

Prefer a small schema first. Suggested core tables:

- `people`
- `roles`
- `role_assignments`
- `projects`
- `actions`
- `tensions`
- `governance_proposals`
- `governance_meetings`
- `decisions`
- `records`
- `record_versions`
- `attention_requests`
- `weekly_snapshots`
- `activity_log`

Do not normalize every array or meeting note into a separate table before real use shows a need. For example, role responsibilities/accountabilities and lightweight governance meeting notes may initially live as structured fields on their parent record.

The earlier candidate tables `tension_outcomes` and `governance_responses` are not assumed to be necessary. They were partly artifacts of an over-detailed prototype workflow.

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

## Complexity scheduled for removal from the prototype

The next code pass should simplify rather than expand.

Remove or reduce:

- `TensionWaitingKind` and automatic action/project-to-tension choreography;
- automatic resolution of tensions when linked actions or projects change state;
- participant-by-participant completion arrays for clarification, reaction and objection rounds;
- software gates requiring every board member to click through each governance round;
- granular governance response state whose only purpose is to simulate a meeting asynchronously.

Retain:

- links from work to source tensions for context;
- a minimal raiser-confirmation mechanism when somebody else marks a tension resolved;
- structural tension capture and proposal preparation;
- proper Integrative Decision-Making terminology and explanations;
- visible objection criteria;
- facilitator-controlled progression through a live Governance Meeting;
- the resulting decision and governance record.

The `Test as` selector can remain temporarily to test normal handoffs. It is not a production requirement.

## Revised v1 build order

1. Simplify the current prototype to match the target operating model.
2. Validate the operational tension-resolution loop.
3. Validate a facilitator-led Governance Meeting from one shared screen.
4. Consolidate and freeze the v1 domain model from what was learned.
5. Add Supabase schema and seed data.
6. Add email authentication.
7. Persist projects, actions, tensions and attention requests.
8. Add weekly project-update prompts and defer/reminder behaviour.
9. Add Process Steward pulse queries.
10. Persist organisation and role management.
11. Persist lightweight governance meetings and decisions.
12. Add records, file storage and statute full-text search.
13. Add weekly snapshot/harvest and notification emails.

Do not add dependency graphs, AI, advanced project management, nested circles, performance metrics, exhaustive asynchronous governance, or communication-channel ingestion unless real SDBP use creates a tension that justifies them.