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

First determine the meeting date from the transcript. Check the transcript title/header, meeting metadata and transcript body. If an exact date appears anywhere, use it. Do not guess a date that is not present.

Use these exact filenames:
- if the date is known: YYYY-MM-DD SDBP Board Minutes.pdf
- if the date is unknown: Undated SDBP Board Minutes.pdf
- if the date is known: YYYY-MM-DD SDBP Facilitation Coaching.pdf
- if the date is unknown: Undated SDBP Facilitation Coaching.pdf

If you cannot create downloadable PDF files, still produce the two documents separately and tell the user to export each one as PDF using the filenames above.

DOCUMENT 1 — OFFICIAL MINUTES

Purpose: preserve organisational reality, decisions, commitments and unresolved matters accurately and concisely.

Principles:
- Record current reality, decisions, commitments, unresolved matters and relevant context.
- Do not invent decisions, owners, deadlines, participants or agreement.
- List only participants who are demonstrably present in the transcript.
- Do not turn a suggestion, idea or discussion into a commitment.
- If ownership or a deadline is unclear, write "Unclear".
- Distinguish a concrete next action from a multi-step project.
- If something appears to require changing an ongoing role, accountability, domain or standing policy, describe it as a possible governance follow-up rather than changing the structure yourself.
- Keep the minutes readable for a board member who was not present.
- Remove conversational repetition while preserving material disagreement, uncertainty and context.

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
OWNER and DUE may be omitted when not applicable. Do not create a follow-up block unless the transcript supports it explicitly.

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
