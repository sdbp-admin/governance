# Frozen v1 domain model

Status: **frozen after interaction validation**

This model reflects the behaviour that was actually tested in the browser prototype. New fields or tables should only be added when a concrete SDBP use case requires them.

## What validation established

Two operating loops were tested successfully.

### Operational loop

- Actions assigned to a person remain visible in **My Attention** until they are done.
- Accepting an action changes it from proposed to open; it does not make it disappear from attention.
- Completing linked work may create a signal for the person who raised the source tension.
- Completing linked work does **not** resolve the tension automatically.
- A tension is resolved by human judgement: the raiser resolves it directly, or confirms another person's proposed resolution.

### Governance loop

- A structural tension can be moved to Governance.
- A proposal can be prepared before a real meeting.
- The facilitator can run the governance sequence from a dedicated shareable meeting window.
- The software guides the process but does not require each participant to complete digital rounds.
- An accepted proposal returns to the main app and appears under **Records → Governance agreements**.

## Canonical objects

### Person

A board member or other person represented in the organisation.

Authentication is a separate concern. A person may exist before their login account is connected.

Core fields:

- name
- email
- active/inactive
- optional Supabase Auth user id

### Role

One underlying role model with two categories:

- `board`
- `operating`

Core fields:

- title
- category
- purpose
- scope
- responsibilities
- accountabilities
- source
- definition status (`draft` or `defined`)

Role holders are assignments, not fields embedded in the persisted role row.

### Role assignment

Connects a person to a role. Multiple people may hold a role and one person may hold multiple roles.

### Project

An outcome requiring more than one step.

Core fields:

- title
- owner
- optional role
- status (`active`, `paused`, `complete`)
- summary
- last update
- next project-update prompt
- optional source tension

### Action

A concrete next step.

Core fields:

- title
- owner
- status (`proposed`, `open`, `done`, `cancelled`)
- optional due date
- optional source label
- optional source tension

**Action status is canonical. My Attention must never store a competing copy of whether an action is proposed/open/done.**

### Tension

A gap between current reality and a potential future sensed by a person.

Core fields:

- title
- raiser
- optional project context
- status
- optional person who proposed resolution
- latest note
- created/resolved dates

For v1 the status values remain deliberately small:

- `open`
- `awaiting_confirmation`
- `resolved`
- `needs_sync`
- `governance`

`needs_sync` and `governance` are practical routing states. They must not grow into dependency machinery.

### Governance proposal

The structural proposal attached to a tension and used during the live governance meeting.

Core fields:

- source tension
- title
- proposal text
- proposer
- current meeting stage
- lightweight meeting notes
- created date
- accepted date

Meeting stages mirror the facilitator guide:

- `prepared`
- `present_proposal`
- `clarifying_questions`
- `reaction_round`
- `clarify`
- `objection_round`
- `integration`
- `accepted`

For v1, the **accepted proposal is the governance decision/agreement**. Records can display accepted proposals directly. We do not create a second `decisions` row containing the same content.

A separate `governance_meetings` table is also not required yet. The dedicated meeting window is a presentation mode around the proposal, not evidence that another persisted domain object is necessary.

### Record

An organisational document such as statutes, board minutes or a transcript.

The Record represents the logical document. Record versions represent authoritative files and their history.

Governance agreements are shown in Records but are sourced directly from accepted governance proposals rather than duplicated into the document tables.

### Attention signal

A small persisted signal used only where the required attention cannot be reliably derived from canonical object state.

The validated example is:

> Edo completed work linked to Luka's open tension; Luka should review whether the real-world tension is now resolved.

A signal points to the tension and recipient. Acknowledging a signal does not change the tension automatically.

## My Attention is a projection, not a source of truth

This is a direct lesson from prototype testing.

My Attention combines things such as:

- proposed/open actions owned by the current person, derived from `actions`;
- due project updates, derived from `projects.next_prompt_at`;
- tension confirmation, derived from `tensions.status = awaiting_confirmation`;
- governance preparation, derived from structural tensions/proposals;
- unacknowledged `attention_signals` created by real events that need somebody to look again.

The application may construct a convenient `AttentionItem` view model, but there is no canonical production table that duplicates every action, project or tension state.

Later, intentional deferral can be stored separately without changing the source object's status.

## Context links are not dependencies

Projects and actions may point to a source tension. A tension may point to a project for context.

These links explain **why** work exists. They do not tell the software that completing one object automatically changes another.

The only automatic consequence validated for linked work is an attention signal to the tension raiser.

## Frozen core persistence tables

The first persistence migration uses ten application tables:

1. `people`
2. `roles`
3. `role_assignments`
4. `projects`
5. `tensions`
6. `actions`
7. `governance_proposals`
8. `attention_signals`
9. `records`
10. `record_versions`

This is intentionally smaller than earlier candidate models.

## Explicitly deferred tables

Do not add these in the first migration:

- generic `attention_requests`
- `governance_meetings`
- `governance_responses`
- separate `decisions`
- `tension_outcomes`
- dependency/link graphs
- `weekly_snapshots`
- generic `activity_log`
- statute-section search tables

Some may become useful later, but they should enter through a real requirement rather than anticipation.

## Authentication and permissions

People and login accounts remain distinct. `people.auth_user_id` may reference Supabase Auth when the person receives access.

For v1, SDBP is a single shared board workspace rather than a multi-tenant product. The initial authorization boundary is therefore simple: only invited/authenticated board users receive access, and board users share the organisational data. More granular record visibility can be introduced later if SDBP starts storing material that requires it.

## Freeze rule

Changes to this model now require one of two things:

1. a concrete failure or awkwardness found while using the validated loops; or
2. a clearly required v1 capability that cannot be represented by this model.

Do not add tables merely to mirror screens, process terminology, or every possible future feature.
