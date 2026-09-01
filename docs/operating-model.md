# Simplified operating model

This document is the product boundary for SDBP Governance. It exists to prevent useful organisational concepts from turning into unnecessary software process.

## Core principle

The app holds structure, rhythm, memory and process. People retain judgement and leadership.

Two constraints follow from that principle:

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

## My Attention

Testing established an important boundary: **My Attention is a projection over the organisation's actual state, not a second task database.**

If an Action is proposed or open for Edo, that Action itself is the source of truth. My Attention shows it because it needs Edo's attention. Accepting the Action changes the Action from proposed to open; the item remains visible until the Action is done.

The same principle applies to other canonical objects. My Attention may combine:

- proposed/open Actions owned by the current person;
- due Project updates;
- a Tension awaiting confirmation from its raiser;
- Governance preparation that requires action;
- event-driven signals that cannot be inferred from the current object state alone.

The validated example of the last category is linked work being completed. If Edo completes work linked to Luka's open Tension, Luka may receive a **Review tension** signal. That signal tells Luka new reality exists to check. It does not resolve the Tension.

This separation prevents Work and My Attention from silently diverging.

## Tensions

A tension is a gap between current reality and a potential future sensed by a person. It may point to a problem, opportunity, missing clarity or barrier.

A tension can be raised without knowing the solution.

### Minimal lifecycle

The core lifecycle is deliberately small:

1. **Open** - the tension still exists.
2. **Awaiting confirmation** - somebody other than the raiser believes it is resolved and marks it resolved.
3. **Resolved** - the raiser confirms the tension is resolved, or the raiser resolves their own tension directly.

A Tension may also be routed to **Needs sync** or **Governance**. These are practical routes back to real conversation or structural governance; they are not dependency states.

If the raiser does not agree that a proposed resolution actually resolved the real situation, they keep the Tension open.

### Example

Luka raises: `Membership list still not received`.

Edo sends the list. If it is represented as a linked Action, Edo marks the Action done. Luka receives a signal that the linked work was completed and checks the real situation. Luka resolves the Tension when the list is actually received.

Alternatively, Edo can mark Luka's Tension resolved directly after sending the list. Luka then confirms whether the real situation is resolved.

The app does not need to know which route is organisationally 'correct'. People decide whether the tension actually disappeared.

### Links are context, not dependencies

A Tension may be linked to an Action or Project because that connection is useful context. The lifecycle of one object does not automatically control the lifecycle of another.

Completion of linked work may produce an attention signal for the tension raiser. This is a notification, not dependency logic.

Therefore v1 does not contain:

- a dependency engine between tensions, actions and projects;
- separate waiting states for `response`, `action`, `project` and `confirmation`;
- automatic tension resolution when an action or project changes state;
- automatic action or project state changes when a tension is resolved.

## Work

Projects and actions remain simple commitments.

- An **Action** is a concrete next step.
- A **Project** is an outcome requiring more than one step.
- Actions proposed to another person may require acceptance before they become that person's open commitment.
- Actions and projects may link back to the tension that produced them.
- Completing work does not automatically resolve a linked tension.
- Completing linked work may notify the tension raiser that there is new reality to check.

The app shows the link and relevant signals without turning them into workflow choreography.

## Governance

Governance is used when a tension requires changing an ongoing role, accountability, domain or standing policy.

Governance is not a substitute for a governance meeting or for the facilitator.

### Before a governance meeting

The app allows a board member to:

- raise a structural tension;
- flag it for Governance;
- optionally draft a proposal;
- keep the tension and proposal visible until a governance meeting is held.

Asynchronous preparation is useful. Exhaustive asynchronous governance decision-making is not required for v1.

### During a governance meeting

The facilitator starts a **Governance Meeting** while the board meets in person or through a tool such as Google Meet.

The meeting opens in a dedicated shareable window when the browser permits it. The main app remains available behind it. The meeting surface acts as the shared process guide and shows:

1. **Present Proposal**
2. **Clarifying Questions**
3. **Reaction Round**
4. **Option to Clarify**
5. **Objection Round**
6. **Integration**, when required
7. **Proposal Accepted**, when no objections remain

For each step, the app shows proper process language and a concise explanation of what happens.

The facilitator controls progression. The app does **not** require every participant to log in and digitally complete or pass each round before the facilitator can continue.

At the Objection Round, the adopted objection criteria remain visible so participants and the facilitator can use them. The software does not decide whether an objection is valid.

Useful meeting capture may include:

- the current proposal text;
- important clarifications;
- objections that need integration;
- the integrated proposal;
- whether the proposal was accepted.

The app does not need a transcript of every reaction.

When a proposal is accepted in the dedicated meeting window, the accepted result returns to the main app and the meeting window closes when the browser permits it.

### After the meeting

The accepted proposal is the governance decision/agreement for v1. It appears immediately under **Records → Governance agreements**.

This avoids creating duplicate objects called `proposal`, `decision` and `governance agreement` that all contain the same organisational result.

The meeting produces governance. The app preserves it.

## Necessary conversations

The product preserves a route back to real human interaction.

A tension can be marked **Needs sync** whenever asynchronous processing is insufficient. Structural governance can be taken into a Governance Meeting. Relational conflict, ambiguity and difficult judgement should be handled by people, with the app providing context and recording relevant outcomes.

## Organisation and roles

Board roles and operating roles remain the same underlying role concept with different sources of authority.

- Board roles such as President, Secretary, Treasurer or Vice-President derive mandatory authority and duties from the SDBP Statutes and applicable law.
- Operating roles such as Process Steward or Membership Administration derive authority from SDBP governance decisions.

Role definitions remain editable and inspectable. Statute- or law-based definitions must come from authoritative sources rather than being invented by the app.

## Records

Records are organisational memory and are not feature creep.

The app should hold authoritative statutes, approved minutes, transcripts when relevant, and governance decisions. Google Docs or Drive may be used for collaborative working documents, while approved or authoritative versions are stored in the governance system.

A logical document and its file versions are separate so old authoritative versions can be retained rather than overwritten.

Accepted governance decisions are displayed in Records directly from the accepted Governance proposal; they do not need to be duplicated into the document tables.

## Complexity explicitly rejected for v1

Unless real SDBP use later creates a clear need, v1 does not include:

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

## Validation completed

The two pre-persistence validation gates have now passed in the prototype:

1. **Operational loop:** Actions remain coherent between Work and My Attention; linked completion can signal the Tension raiser; real-world resolution remains a human decision.
2. **Governance loop:** a structural Tension becomes a proposal, the facilitator runs the sequence from a dedicated meeting window, and the accepted result returns to the main app and Records.

The model is therefore frozen in [`v1-domain-model.md`](v1-domain-model.md).

## Current phase

The next phase is **persistence without product expansion**.

Connect the validated model to Supabase, authentication and later Records/file storage without redesigning the workflows that just passed testing. Any new workflow concept now needs a concrete SDBP tension that the frozen model cannot represent.
