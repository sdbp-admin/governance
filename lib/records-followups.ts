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

export const MINUTES_GPT_PROMPT = `Turn the transcript below into concise SDBP meeting minutes.

Use these principles:
- Record current reality, decisions, commitments, unresolved matters and relevant context.
- Do not invent decisions, owners, deadlines, participants or agreement.
- Do not turn a suggestion or discussion into a commitment.
- If ownership or a deadline is unclear, write "Unclear".
- Distinguish a concrete next action from a multi-step project.
- If something appears to require changing an ongoing role, accountability, domain or standing policy, describe it as a possible governance follow-up rather than changing the structure yourself.
- Keep the minutes readable for a board member who was not present.

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

At the very end, repeat only explicit organisational follow-ups using zero or more blocks in exactly this format:

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
