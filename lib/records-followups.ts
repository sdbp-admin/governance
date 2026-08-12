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

OUTPUT FILES
Create two separate downloadable PDF files when your environment supports file creation. Do not combine them into one PDF.

Determine the meeting date from the transcript title/header, meeting metadata and transcript body.
- If the full date is explicit, use it.
- If the day and month are explicit but the year is omitted, use the current calendar year unless the transcript, document title or meeting context indicates another year.
- Only use "Undated" when even the day/month cannot be established reliably.
- Do not write caveats such as "year not explicit" in the official date field when the current-year rule above resolves it.

Use these filename rules:
- standard: YYYY-MM-DD SDBP Board Minutes.pdf
- if one clearly dominant subject or project exists, you may add a short 2–5 word descriptor after the date, for example: YYYY-MM-DD SDBP Board Minutes - Membership Review.pdf
- if the meeting covers several unrelated subjects, do not force a subject into the filename.
- coaching: use the same date and optional subject, replacing "Board Minutes" with "Facilitation Coaching".
- only if no reliable day/month exists: Undated SDBP Board Minutes.pdf and Undated SDBP Facilitation Coaching.pdf

If you cannot create downloadable PDF files, still produce the two documents separately and tell the user to export each one as PDF using the filenames above.

NAME INTEGRITY
Names are important organisational data.
- Preserve the exact spelling of names from the most authoritative written source available in the input: meeting metadata/attendee list first, then clearly written names in the transcript.
- Do not silently "correct" a name based on pronunciation or a similar-looking name.
- If the transcript contains conflicting spellings for what appears to be the same person, use the most authoritative written spelling available. If uncertainty remains, mark the name with "[spelling uncertain]" for human review rather than guessing.
- Do not infer that similarly named people are the same person.

DOCUMENT 1 — OFFICIAL MINUTES

Purpose: preserve organisational reality, decisions, commitments and unresolved matters accurately and concisely.

Principles:
- Record current reality, decisions, commitments, unresolved matters and relevant context.
- Do not invent decisions, owners, deadlines, participants, agreement, authority or legal conclusions.
- List only participants who are demonstrably present in the transcript.
- Do not turn a suggestion, idea or discussion into a commitment.
- If ownership or a deadline is unclear, write "Unclear".
- Distinguish a concrete next action from a multi-step project.
- Do not infer formal board membership, office, decision authority, conflict-of-interest status, statutory duties or legal requirements from casual discussion. If such a question is raised but not verified from an authoritative source, record it as a question or matter to verify.
- Governance follow-up must come from the meeting itself: include it only when the transcript explicitly raises a governance/statutory/process issue or when an agreed proposal clearly changes an ongoing role, accountability, domain or standing policy. Do not create new governance tasks merely because they seem sensible.
- Keep the minutes readable for a board member who was not present.
- Remove conversational repetition while preserving material disagreement, uncertainty and context.
- Avoid duplicating the same point across several sections. Put each item in the most useful section and cross-reference only when necessary.
- Keep facilitation/process-efficiency observations out of the official minutes unless they directly affected an organisational decision or commitment. Put observations about tangents, repetition, unclear agenda, meeting pace or facilitation only in the coaching document.
- Keep relational or trust issues neutral and factual. Include them only when they were explicitly raised as an organisational matter that requires attention.

Use this structure:
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

DOCUMENT 2 — FACILITATION COACHING

Purpose: help whoever facilitates SDBP meetings become more effective over time. This is a learning document, not an organisational record and not a performance score.

Review only facilitation behaviour and process evidence visible in the transcript. Do not speculate about motives, personality or competence. If the facilitator cannot be identified reliably from the transcript, say so and review the meeting process without attributing observations to a person.

Pay particular attention to:
- whether the purpose and agenda stayed clear;
- whether status updates remained concise and useful;
- whether tensions were surfaced and processed rather than buried in discussion;
- whether operational updates, decisions, actions, projects and governance matters were distinguished clearly;
- whether the group moved into solutions before the underlying tension or question was clear;
- repetition, tangents or discussion that continued after enough clarity existed to move forward;
- whether ownership, next steps and deadlines became explicit where appropriate;
- whether matters that needed a synchronous conversation or governance process were recognised as such;
- moments where a simple facilitator intervention could have shortened the meeting or improved clarity;
- facilitation practices that worked well and should be repeated.

Use this structure:
# SDBP Facilitation Coaching
## What worked
## Where the process lost clarity or time
## Facilitation interventions that could have helped
## Practices to try next meeting

Keep the coaching concrete. Refer to meeting topics or moments rather than making generic statements. Recommend no more than three practical improvements for the next meeting.

SDBP PROCESSING NOTES — NOT PART OF EITHER DOCUMENT

After both documents, repeat only explicit organisational follow-ups using zero or more blocks in exactly this format:

[SDBP FOLLOW-UP]
TYPE: ACTION
TITLE: Concrete next step
OWNER: Person name or Unclear
DUE: YYYY-MM-DD or Unclear
[/SDBP FOLLOW-UP]

For projects use TYPE: PROJECT. For unresolved matters use TYPE: TENSION. For structural role/accountability/policy matters use TYPE: GOVERNANCE.
OWNER and DUE may be omitted when not applicable. Do not create a follow-up block unless the transcript supports it explicitly. Do not convert analytical suggestions from the coaching document into organisational follow-ups.

TRANSCRIPT:\n`;

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
