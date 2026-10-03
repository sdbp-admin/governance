export type RecordFollowUpKind = "action" | "project" | "tension" | "governance";
export type RecordFollowUpStatus = "unreviewed" | "captured" | "not_needed";

export type RecordFollowUp = {
  id: string;
  kind: RecordFollowUpKind;
  title: string;
  owner?: string;
  due?: string;
  status: RecordFollowUpStatus;
};

const FOLLOW_UP_BLOCK = /\[SDBP FOLLOW-UP\]([\s\S]*?)\[\/SDBP FOLLOW-UP\]/gi;

export const MINUTES_GPT_PROMPT = `Use the meeting transcript below to create two clearly separate documents:

1. the authoritative SDBP meeting minutes;
2. a non-authoritative facilitation coaching document for learning and improving how SDBP meetings are run.

Do not merge coaching observations into the official minutes.

The official minutes are not a generic transcript summary. Their purpose is to reconstruct the organisational reality established by the meeting: what is true now, what was decided, what people committed to, what conditions or constraints affect SDBP's ability to proceed, and what important matters remain unresolved.

# OUTPUT FILES

Create two separate downloadable PDF files when your environment supports file creation. Do not combine them into one PDF.

Determine the meeting date from the transcript title/header, meeting metadata and transcript body.

- If the full date is explicit, use it.
- If the day and month are explicit but the year is omitted, use the current calendar year unless the transcript, document title or meeting context indicates another year.
- Only use "Undated" when even the day/month cannot be established reliably.
- Do not write caveats such as "year not explicit" in the official date field when the current-year rule above resolves it.

Use these filename rules:

- standard: \`YYYY-MM-DD SDBP Board Minutes.pdf\`
- if one clearly dominant subject or project exists, you may add a short 2–5 word descriptor after the date, for example: \`YYYY-MM-DD SDBP Board Minutes - Membership Review.pdf\`
- if the meeting covers several unrelated subjects, do not force a subject into the filename.
- coaching: use the same date and optional subject, replacing \`Board Minutes\` with \`Facilitation Coaching\`.
- only if no reliable day/month exists: \`Undated SDBP Board Minutes.pdf\` and \`Undated SDBP Facilitation Coaching.pdf\`

If you cannot create downloadable PDF files, still produce the two documents separately and tell the user to export each one as PDF using the filenames above.

# SOURCE AUTHORITY

Use actual speaker dialogue as the only substantive evidence for decisions, commitments, owners, deadlines, tensions, agreements, constraints and organisational conclusions.

- Treat Fathom meeting titles, timestamps, speaker labels, participant metadata and recording metadata as structural metadata. They may help establish date, participants, speaker attribution and sequence, but they are not evidence that a substantive decision, commitment, tension or conclusion exists.
- Treat Fathom-generated action items, highlights, summaries, chapter descriptions, key points and other annotations as non-authoritative.
- Never copy Fathom-generated annotations into the minutes as facts unless the underlying spoken dialogue independently supports them.
- Every recorded decision, commitment, owner, deadline, material tension or organisational condition must be supported by the actual spoken exchange.
- If Fathom annotations conflict with the spoken dialogue, the spoken dialogue wins.
- A person's name appearing in a Fathom-generated action item or summary does not establish that the person accepted or owns that action.
- If the spoken dialogue does not clearly establish an owner, deadline, decision or commitment, write "Unclear" or omit it as appropriate. Do not infer it from Fathom annotations.

# NAME INTEGRITY

Names are important organisational data.

- Preserve the exact spelling of names from the most authoritative written source available in the input: meeting metadata/attendee list first, then clearly written names in the transcript.
- Do not silently "correct" a name based on pronunciation or a similar-looking name.
- If the transcript contains conflicting spellings for what appears to be the same person, use the most authoritative written spelling available.
- If uncertainty remains, mark the name with \`[spelling uncertain]\` for human review rather than guessing.
- Do not infer that similarly named people are the same person.

# DOCUMENT 1 — OFFICIAL MINUTES

Purpose: preserve organisational reality, decisions, commitments, constraints and unresolved matters accurately and concisely.

## Core principles

- Record current reality, decisions, commitments, unresolved matters and relevant context.
- Record not only facts, but also material consequences explicitly stated in the meeting.
- Do not invent decisions, owners, deadlines, participants, agreement, authority, legal conclusions, organisational consequences or consensus.
- List only participants who are demonstrably present in the transcript.
- Do not turn discussion, a suggestion, a Fathom-generated action item, or another person's proposal into a commitment.
- A commitment requires explicit spoken acceptance, volunteering, an assignment that was clearly accepted, or an unambiguous group decision in the dialogue.
- If ownership or a deadline is unclear, write "Unclear".
- Distinguish a concrete next action from a multi-step project.
- Do not infer formal board membership, office, decision authority, conflict-of-interest status, statutory duties or legal requirements from casual discussion.
- If such a question is raised but not verified from an authoritative source, record it as a question or matter to verify.
- Governance follow-up must come from the meeting itself. Include it only when the transcript explicitly raises a governance, statutory or process issue, or when an agreed proposal clearly changes an ongoing role, accountability, domain or standing policy.
- Do not create new governance tasks merely because they seem sensible.
- If a new role, accountability, policy or structural change was explicitly decided, record that decision clearly under Governance follow-up.
- Keep relational or trust issues neutral and factual. Include them only when they were explicitly raised as an organisational matter that requires attention.

## Materiality and compression rules

Conciseness must come from removing conversational repetition, not from removing distinct organisational consequences.

- Preserve consequential organisational statements even when they are not formal decisions or commitments.
- In particular, retain statements that establish a condition for:
  - organisational continuation;
  - board succession;
  - financial viability;
  - project viability;
  - access to funds;
  - the ability to fulfil commitments;
  - organisational legitimacy or credibility;
  - assuming a new role or responsibility;
  - proceeding with future work.
- Do not compress away the consequence of a fact.

For example:

- "SDBP has debt" is not equivalent to "a new board will only step in once the debt is cleared."
- "AGRA can operationally proceed" is not equivalent to "AGRA creates sustainable financial value for SDBP."
- "The known debts appear complete" is not equivalent to "the debt has been resolved."
- "A project has external value" is not equivalent to "SDBP captures financial value from it."
- Distinguish different questions within the same topic.

For example, where debt is discussed, separately consider:

- approximate amount;
- whether the liability picture appears complete;
- who is owed money;
- whether repayment or settlement has been agreed;
- consequences for future income;
- consequences for board succession;
- consequences for organisational continuation.

Do not merge these into one generic "debt unresolved" statement if the dialogue establishes separate consequences.

- Preserve unresolved business-model and strategic tensions when they materially affect SDBP's viability.
- If participants explicitly question:
  - what SDBP gains from an activity;
  - whether value created by SDBP is monetised;
  - who bears costs and risk;
  - who receives the benefit;
  - whether an activity contributes to SDBP's financial future;
  - whether SDBP repeatedly creates value without capturing sufficient revenue;
  record that tension even if no solution was agreed.
- Track substantive issues across the whole transcript before summarising them.
- Do not summarise an important issue from only its first or final occurrence if later discussion materially changes, deepens or clarifies it.
- When the same underlying concern reappears later, integrate the relevant exchanges into one accurate account.
- Repetition of wording should normally be removed, but recurrence of the same issue in different contexts may indicate that the issue is materially important.
- If one participant raises a material condition or constraint and another participant responds to a different aspect of the issue, do not imply that the original condition was resolved.

Example:

- one participant says old debt prevents a new board from taking over;
- another says all known debts are probably now disclosed.

The minutes should record both:

- the liability picture may be substantially known;
- the condition preventing board succession remains unresolved unless the dialogue establishes otherwise.

## Organisational reality test

Keep the minutes readable for a board member who was not present.

After reading them, that person should understand:

- what the organisation's current situation is;
- what was decided;
- what people explicitly committed to;
- which projects changed;
- what conditions must be met before SDBP can move forward;
- what principal financial, governance, strategic or operational constraints remain;
- what important questions were raised but not resolved;
- what the meeting established about SDBP's operating or business model when that affects organisational viability.

Do not assume that only decisions and actions are important. A clearly stated unresolved condition may be more consequential than an action item.

## Materiality pass before finalising

Before finalising the minutes, review the full transcript again specifically for consequential language and substantive threads.

Check whether the minutes capture every material spoken statement equivalent to:

- "we cannot continue unless..."
- "this has to happen before..."
- "the new board cannot / will not..."
- "we need to be clear of..."
- "this prevents us from..."
- "if we do not do this..."
- "this is the biggest obstacle..."
- "we are carrying the risk..."
- "what does SDBP gain from this?"
- "how do we monetise this?"
- "we create value but..."
- "we are not getting paid..."
- "this model does not work..."
- "this needs to change..."
- "we cannot work with..."
- "this remains unresolved..."

These are examples of consequential meaning, not exact phrases to search for.

Do not omit a material organisational statement merely because:

- no vote followed it;
- nobody converted it into an action;
- the conversation moved on;
- another participant answered a related but different question.

## Avoid duplication

- Avoid duplicating the same point across several sections.
- Put each item in the section where it is most useful.
- Cross-reference only when necessary.
- If one issue has both an unresolved operational aspect and a governance consequence, it may be referenced briefly in both sections when needed for clarity, but do not repeat the full narrative.

## Keep facilitation separate

Keep facilitation and process-efficiency observations out of the official minutes unless they directly affected an organisational decision, commitment or substantive outcome.

Do not put observations about:

- tangents;
- repetition;
- unclear agenda;
- meeting pace;
- weak timekeeping;
- facilitation technique;
- discussion efficiency;

into the official minutes.

Put those observations only in the coaching document.

## Required structure

# SDBP Meeting Minutes

## Meeting

Date:
Participants:
Context / project (if relevant):

## Key updates

## Decisions

## Actions and commitments

## Projects / project changes

## Tensions and unresolved matters

## Governance follow-up

## Other relevant records or documents

# DOCUMENT 2 — FACILITATION COACHING

Purpose: help whoever facilitates SDBP meetings become more effective over time.

This is a learning document, not an organisational record, not a performance score, and not a compliance audit.

## Method-neutral coaching

Do not assume that the meeting is intended to follow Holacracy, Sociocracy, parliamentary procedure or any other formal meeting methodology unless the transcript explicitly establishes that.

Concepts such as:

- tensions;
- projects;
- actions;
- governance;
- ownership;
- accountabilities;

may be useful analytical distinctions, but they are not compliance criteria.

Evaluate the meeting against:

- its actual purpose;
- the process visible in the transcript;
- whether the group obtained sufficient clarity to move its work forward.

Do not criticise the meeting merely for failing to follow a formal process that participants did not establish as their intended process.

## Facilitator participation in content

The facilitator may also participate substantively in the discussion.

Do not treat the facilitator:

- expressing an opinion;
- contributing expertise;
- supplying information;
- challenging an assumption;
- making a proposal;
- arguing for a substantive position;

as a facilitation failure in itself.

Where the facilitator also participates in the content:

- distinguish the person's substantive contribution from their facilitation behaviour;
- assess whether switching between participant and facilitator roles affected clarity, participation, decision-making or the group's ability to process important issues;
- recognise when substantive participation helped expose an important constraint or question;
- identify moments when, after contributing substantively, a brief return to facilitation could have helped restate the question, summarise disagreement or move toward resolution.

Do not assume that an effective facilitator must remain neutral or silent on content.

If the facilitator cannot be identified reliably from the transcript, say so and review the meeting process without attributing observations to a particular person.

## Review only evidence visible in the transcript

Do not speculate about:

- motives;
- personality;
- competence;
- private relationships;
- what someone "really meant";
- why someone behaved a certain way.

Base coaching only on observable meeting behaviour and process evidence.

## Pay particular attention to

- whether the purpose and agenda stayed sufficiently clear;
- whether status updates remained concise and useful;
- whether important concerns, constraints or tensions were made sufficiently explicit to be understood and addressed rather than becoming buried in broader discussion;
- whether the group sufficiently distinguished status information, questions to resolve, decisions, actions, longer-running work and governance matters where those distinctions were relevant;
- whether the group moved into solutions before the underlying tension, constraint or question was sufficiently clear;
- whether different questions inside one topic became conflated;
- whether participants answered the actual question being raised or shifted to a related but different issue;
- repetition, tangents or discussion that continued after enough clarity existed to move forward;
- whether ownership, next steps and deadlines became explicit where appropriate;
- whether important unresolved matters were explicitly acknowledged before the meeting moved on;
- whether matters that needed a synchronous conversation, external verification or governance process were recognised as such;
- whether the facilitator periodically synthesised long discussions into:
  - what is known;
  - what remains disputed or unclear;
  - what question now needs answering;
  - whether a decision is required;
  - what happens next;
- moments where a simple facilitator intervention could have shortened the meeting or substantially improved clarity;
- facilitation practices that worked well and should be repeated.

## Important coaching distinction

Do not criticise repetition merely because a topic reappears.

Ask first whether the recurrence means:

- the original question was not answered;
- the consequence of the issue was not acknowledged;
- participants were talking about different dimensions of the same problem;
- the group had moved into solutions without agreeing what problem it was solving.

For example, if debt repeatedly returns because participants discuss:

- amount;
- completeness;
- repayment;
- liquidity;
- board succession;

those are distinct questions. The coaching should identify whether facilitation helped distinguish them rather than simply labelling the discussion repetitive.

Similarly, if an event such as AGRA is discussed in terms of:

- delivery;
- immediate liquidity;
- reputation;
- strategic value;
- revenue;
- who benefits;
- who bears cost;

the coaching should notice whether these different questions were separated clearly enough.

## Required structure

# SDBP Facilitation Coaching

## What worked

## Where the process lost clarity or time

## Facilitation interventions that could have helped

## Practices to try next meeting

Keep the coaching concrete.

Refer to specific meeting topics or moments rather than making generic statements.

Under \`Practices to try next meeting\`, choose:

**PRIMARY PRACTICE:**
The single facilitation experiment most likely to improve the next meeting.

You may add up to two:

**SECONDARY PRACTICE 1:**
Optional.

**SECONDARY PRACTICE 2:**
Optional.

Do not give the facilitator a long improvement list.

# FINAL SEPARATION RULE

The official minutes are the organisational record.

The facilitation coaching document is a learning document only.

Do not allow:

- coaching judgments;
- process criticism;
- interpretations of facilitator effectiveness;

to leak into the official minutes.

Conversely, do not weaken or omit an organisationally material statement from the official minutes merely because it also reveals a facilitation issue.

Do not add machine-processing notes, follow-up blocks or a third document.

TRANSCRIPT:
`;

export function parseMinutesFollowUps(text: string): RecordFollowUp[] {
  const items: RecordFollowUp[] = [];
  let match: RegExpExecArray | null;
  let index = 0;

  FOLLOW_UP_BLOCK.lastIndex = 0;
  while ((match = FOLLOW_UP_BLOCK.exec(text)) !== null) {
    const fields = new Map<string, string>();
    for (const rawLine of match[1].split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const colon = line.indexOf(":");
      if (colon < 1) continue;
      fields.set(line.slice(0, colon).trim().toUpperCase(), line.slice(colon + 1).trim());
    }

    const rawType = fields.get("TYPE")?.toLowerCase();
    const title = fields.get("TITLE")?.trim();
    if (!title || !isFollowUpKind(rawType)) continue;

    const owner = normalizeOptional(fields.get("OWNER"));
    const due = normalizeDue(fields.get("DUE"));

    items.push({
      id: `followup-${Date.now()}-${index++}`,
      kind: rawType,
      title,
      owner,
      due,
      status: "unreviewed",
    });
  }

  return items;
}

function isFollowUpKind(value: string | undefined): value is RecordFollowUpKind {
  return value === "action" || value === "project" || value === "tension" || value === "governance";
}

function normalizeOptional(value: string | undefined) {
  if (!value || value.trim().toLowerCase() === "unclear") return undefined;
  return value.trim();
}

function normalizeDue(value: string | undefined) {
  const normalized = normalizeOptional(value);
  if (!normalized) return undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : undefined;
}
