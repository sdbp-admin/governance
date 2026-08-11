# SDBP Governance

A lightweight operating system for SDBP board work: clear roles, visible commitments, tension-driven problem solving, evolving governance, organisational memory, and an asynchronous weekly rhythm.

## Product principles

The app holds structure, rhythm, memory, and process. People retain judgement and leadership.

The app reduces unnecessary meetings. It does not replace necessary conversations.

Governance is facilitator-led. The app guides the live process and records the resulting governance change; it does not replace the facilitator.

Discussion can happen anywhere. Organisational commitments and authoritative records belong in the app.

## Current validation focus

The prototype deliberately has no backend. For testing, changes are saved in browser-session storage so they survive navigation and refresh within the current tab. Closing the tab resets the prototype.

Before adding production persistence or authentication, the current phase validates two simple loops.

### Operational loop

1. the app prompts a person when an interaction is due;
2. a project can be updated or confirmed unchanged;
3. a tension can be raised without knowing the solution;
4. people resolve the tension through normal organisational work or conversation;
5. if somebody other than the raiser marks it resolved, the raiser confirms;
6. resulting commitments remain visible in Work without automatically controlling the tension lifecycle.

### Governance meeting loop

1. a structural tension is raised and flagged for Governance;
2. a proposal may be prepared before the meeting;
3. the board meets in person or through a tool such as Google Meet;
4. the facilitator uses the Governance screen as a shared guide through the Integrative Decision-Making sequence;
5. the app records the accepted proposal, decision and resulting governance change.

## Current vertical slice

The prototype includes:

- My Attention with active and intentionally deferred items;
- weekly project-update prompts including one-click `No change`;
- projects and actions;
- tension capture and processing;
- Organisation with people and editable role definitions;
- board roles and operating roles as the same underlying concept with different sources of authority;
- role purpose, scope, responsibilities, accountabilities, source and holder assignments;
- an experimental Governance workflow that is now being simplified into a facilitator-controlled live meeting aid;
- Records as the planned home of statutes, minutes, transcripts and governance agreements;
- SDBP Pulse for Process Steward exception visibility;
- representative General Assembly / membership workflow data.

## Tension model

A tension is a gap between current reality and a potential future sensed by a person.

The target v1 lifecycle is intentionally small:

- **Open**
- **Awaiting confirmation** when somebody other than the raiser believes it is resolved
- **Resolved** once the raiser confirms, or when the raiser resolves their own tension

Actions and projects may be linked to a tension for context. Their lifecycles do not automatically control the tension.

## Role model

President, Secretary, Treasurer, Vice-President and similar offices are **board roles**. Their authority and mandatory duties come from SDBP's statutes and applicable law.

Process Steward, Membership Administration, Member Communications and similar responsibilities are **operating roles**. Their authority comes from SDBP governance decisions.

The app must not invent the content of statute- or law-based roles. Their definitions should be completed from the authoritative sources and linked to those sources.

## What is intentionally not in v1

No AI dependency, dependency graph, tension/action/project choreography, exhaustive asynchronous governance workflow, Gantt planning, nested circle hierarchy, performance scoring, automatic email/WhatsApp ingestion, or elaborate project-management layer is required for the core product.

## Next implementation gate

Do not connect the backend until the simplified operational loop and facilitator-led Governance Meeting loop feel coherent in the prototype. After that validation:

1. freeze the v1 domain model;
2. add the Supabase schema and seed data;
3. add authentication;
4. persist the validated workflows;
5. add records/file storage, reminders, statute search and weekly harvest.

See [`docs/operating-model.md`](docs/operating-model.md) for the current product boundary and the complexity scheduled for removal.

## Prototype deployment

The review build is published through GitHub Pages from the `feat/v1-foundation` branch. That branch is allowed to deploy to the `github-pages` environment.

## Local development

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Architecture

See [`docs/architecture.md`](docs/architecture.md).