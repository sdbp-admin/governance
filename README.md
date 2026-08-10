# SDBP Governance

A lightweight operating system for SDBP board work: clear roles, visible commitments, tension-driven problem solving, evolving governance, and an asynchronous weekly rhythm.

## Product principle

The app holds structure, rhythm, memory, and process. People retain judgement and leadership.

## Current vertical slice

The first prototype includes:

- My Attention with active and intentionally deferred items
- weekly project-update prompts including a one-click `No change`
- persistent reminders and stale-item visibility
- projects and actions
- tension capture before solution design
- organisation view separating legal positions from operating roles
- lightweight governance and records placeholders
- SDBP Pulse for Process Steward exception visibility
- representative General Assembly / membership workflow data

The prototype deliberately uses in-memory data. Persistence, auth and email reminders come after validating the interaction model.

## Prototype deployment

The review build is published through GitHub Pages from the `feat/v1-foundation` branch.

## Local development

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Architecture

See [`docs/architecture.md`](docs/architecture.md).
