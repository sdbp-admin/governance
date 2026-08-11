# Simplified operating model

This document is the current product boundary for SDBP Governance. It exists to prevent the prototype from turning useful organisational concepts into unnecessary software process.

## Core principle

The app holds structure, rhythm, memory and process. People retain judgement and leadership.

Two additional constraints now follow from that principle:

- **The app reduces unnecessary meetings. It does not replace necessary conversations.**
- **The app guides and records governance. A human facilitator runs the governance process.**

A feature should not require additional organisational behaviour merely to satisfy the software.

## Operational rhythm

Normal board work should remain asynchronous wherever that genuinely saves time.

The app should:

- prompt people when a project update, action or response is due;
- allow a one-click `No change` project update;
- keep actions, projects and tensions visible;
- remind people about commitments they have not addressed;
- surface stale or unresolved items to the Process Steward;
- preserve organisational outcomes and records.

Discussion may happen in the app, by email, WhatsApp, phone or in a meeting. The app does not need to reproduce every conversation. It needs the resulting organisational reality.

## Tensions

A tension is a gap between current reality and a potential future sensed by a person. It may point to a problem, opportunity, missing clarity or barrier.

A tension can be raised without knowing the solution.

### Minimal lifecycle

The target lifecycle is deliberately small:

1. **Open** - the tension still exists.
2. **Awaiting confirmation** - somebody other than the raiser believes it is resolved and marks it resolved.
3. **Resolved** - the raiser confirms the tension is resolved, or the raiser resolves their own tension directly.

If the raiser does not agree that it is resolved, they keep it open.

### Example

Luka raises: `Membership list still not received`.

Edo sends the list and marks the tension resolved. The app asks Luka to confirm. Luka checks that the list arrived and confirms. Done.

The app does not need to know whether Edo solved the tension through an Action object, an email, a phone call or another route.

### Links are context, not dependencies

A tension may be linked to an action or project because that connection is useful context. The lifecycle of one object does not automatically control the lifecycle of another.

Therefore v1 should not contain:

- a dependency engine between tensions, actions and projects;
- separate waiting states for `response`, `action`, `project` and `confirmation`;
- automatic tension resolution when an action or project changes state;
- automatic action or project state changes when a tension is resolved.

People decide whether the real-world tension has been resolved.

## Work

Projects and actions remain simple commitments.

- An **Action** is a concrete next step.
- A **Project** is an outcome requiring more than one step.
- Actions proposed to another person may require acceptance before they become that person's commitment.
- Actions and projects may link back to the tension that produced them.
- Completing work does not automatically resolve a linked tension.

The app should show the link without turning it into workflow choreography.

## Governance

Governance is used when a tension requires changing an ongoing role, accountability, domain or standing policy.

Governance should not be implemented as a substitute for a governance meeting or for the facilitator.

### Before a governance meeting

The app should allow a board member to:

- raise a structural tension;
- flag it for Governance;
- optionally draft a proposal;
- keep the tension and proposal visible until a governance meeting is held.

For v1, asynchronous preparation is useful. Full asynchronous governance decision-making is not required.

### During a governance meeting

The facilitator starts a **Governance Meeting** in the app while the board meets in person or through a tool such as Google Meet.

The Governance screen becomes a shared meeting aid that can be screen-shared. It shows:

1. **Present Proposal**
2. **Clarifying Questions**
3. **Reaction Round**
4. **Option to Clarify**
5. **Objection Round**
6. **Integration**, when required
7. **Proposal Accepted**, when no objections remain

For each step, the app should show the proper process language and a concise explanation of what happens in that step.

The facilitator controls progression through the sequence. The app does **not** require every participant to log in and digitally complete or pass each round before the facilitator can continue.

At the Objection Round, the app should make the adopted objection criteria available so participants and the facilitator can use them. The software should not decide whether an objection is valid.

Useful meeting capture may include:

- the current proposal text;
- important clarifications;
- objections that need integration;
- the integrated proposal;
- whether the proposal was accepted, withdrawn or left unresolved.

It does not need a digital transcript of every reaction unless SDBP later finds that useful.

### After the meeting

The app records the organisational result:

- the accepted proposal or decision;
- the role, accountability, domain or policy that changed;
- the source tension;
- the meeting/date and relevant record;
- any follow-up action or project created.

The meeting produces governance. The app preserves it.

## Necessary conversations

The product should actively preserve a route back to real human interaction.

A tension can be marked **Needs sync** whenever asynchronous processing is insufficient. Structural or contested governance can be taken into a Governance Meeting. Relational conflict, ambiguity and difficult judgement should be handled by people, with the app providing context and recording relevant outcomes.

## Organisation and roles

Board roles and operating roles remain the same underlying role concept with different sources of authority.

- Board roles such as President, Secretary, Treasurer or Vice-President derive mandatory authority and duties from the SDBP Statutes and applicable law.
- Operating roles such as Process Steward or Membership Administration derive authority from SDBP governance decisions.

Role definitions should remain editable and inspectable. Statute- or law-based definitions must come from authoritative sources rather than being invented by the app.

## Records

Records remain the organisational memory and are not feature creep.

The app should eventually hold authoritative statutes, approved minutes, governance decisions and governance agreements. Google Docs or Drive may be used for collaborative working documents, while approved or authoritative versions are stored in the governance system.

## Complexity explicitly rejected for v1

The following should not be part of the target v1 model unless real SDBP use later creates a clear need:

- tension/action/project dependency machinery;
- per-participant completion matrices for governance rounds;
- software gates that prevent a facilitator from advancing a live meeting;
- algorithmic objection validity decisions;
- mandatory recording of every reaction or comment;
- meeting replacement through exhaustive asynchronous workflow;
- Gantt planning, dependency graphs or advanced project management;
- nested Holacracy circle machinery;
- performance scoring;
- communication-channel ingestion;
- AI as a requirement for core operation.

## Prototype complexity scheduled for removal

The current prototype contains some machinery added while exploring the interaction model. It should not be treated as the target architecture.

In particular, the next simplification pass should remove or reduce:

- `TensionWaitingKind` and automatic action/project-to-tension transitions;
- participant-by-participant clarification, reaction and objection completion gates;
- the requirement to switch prototype users to advance every governance round;
- granular governance response state that exists only to simulate a meeting asynchronously.

The `Test as` selector can remain temporarily as a prototype testing aid. It is not a production feature.

## Next validation gate

Before Supabase is connected, the simplified prototype should prove two things:

1. **Operational loop:** a person can update work, raise a tension, resolve it through normal human action, and close it with minimal interaction.
2. **Governance meeting loop:** a structural tension can become a proposal, a facilitator can run the real governance sequence from one shared screen, and the resulting decision can be recorded.

Only after those two loops feel natural should the v1 persistence model be frozen.