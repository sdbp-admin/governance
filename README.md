# SDBP Governance

A lightweight operating system for SDBP board work: clear roles, visible commitments, tension-driven problem solving, evolving governance, organisational memory, and an asynchronous weekly rhythm.

## Product principle

The app holds structure, rhythm, memory, and process. People retain judgement and leadership.

Discussion can happen anywhere. Organisational commitments and authoritative records belong in the app.

## Current validation focus

The prototype is deliberately in-memory. Before adding persistence or authentication, the current phase validates the central operating loop:

1. the app prompts a person when an interaction is due;
2. a project can be updated or confirmed unchanged;
3. a tension can be raised without knowing the solution;
4. the tension can be processed into an action, project, governance change, synchronous discussion, information, or no further action;
5. resulting work becomes visible in Work and My Attention;
6. SDBP Pulse changes as exceptions are resolved or become stale.

## Current vertical slice

The prototype includes:

- My Attention with active and intentionally deferred items;
- weekly project-update prompts including one-click `No change`;
- projects and actions;
- tension capture and processing;
- Organisation with people and editable role definitions;
- board roles and operating roles as the same underlying concept with different sources of authority;
- role purpose, scope, responsibilities, accountabilities, source and holder assignments;
- lightweight Integrative Decision-Making guidance for governance;
- Records as the planned home of statutes, minutes, transcripts and governance agreements;
- SDBP Pulse for Process Steward exception visibility;
- representative General Assembly / membership workflow data.

## Role model

President, Secretary, Treasurer, Vice-President and similar offices are **board roles**. Their authority and mandatory duties come from SDBP's statutes and applicable law.

Process Steward, Membership Administration, Member Communications and similar responsibilities are **operating roles**. Their authority comes from SDBP governance decisions.

The app must not invent the content of statute- or law-based roles. Their definitions should be completed from the authoritative sources and linked to those sources.

## What is intentionally not in v1

No AI dependency, dependency graph, Gantt planning, nested circle hierarchy, performance scoring, automatic email/WhatsApp ingestion, or elaborate project-management layer is required for the core product.

## Next implementation gate

Do not connect the backend until the central interaction loop above feels coherent in the prototype. After that validation:

1. freeze the v1 domain model;
2. add the Supabase schema and seed data;
3. add authentication;
4. persist the validated workflows;
5. add records/file storage, reminders, statute search and weekly harvest.

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
