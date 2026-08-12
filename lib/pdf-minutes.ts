import { parseMinutesFollowUps, type RecordFollowUp, type RecordFollowUpKind } from "@/lib/records-followups";

const SECTION_HEADERS = [
  "Actions and commitments",
  "Projects / project changes",
  "Tensions and unresolved matters",
  "Governance follow-up",
  "Other relevant records or documents",
];

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

export async function extractMinutesFollowUpsFromPdf(source: File | ArrayBuffer): Promise<RecordFollowUp[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const buffer = source instanceof File ? await source.arrayBuffer() : source;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;

  try {
    let text = "";
    const positionedActions: RecordFollowUp[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      const positioned: PositionedText[] = [];

      for (const item of content.items) {
        if (!("str" in item)) continue;
        pageText += item.str;
        pageText += item.hasEOL ? "\n" : " ";

        if (item.str.trim() && Array.isArray(item.transform)) {
          positioned.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5] });
        }
      }

      positionedActions.push(...extractPositionedActionRows(positioned));
      text += `${pageText}\n`;
    }

    return dedupeFollowUps([...positionedActions, ...extractMinutesFollowUpsFromText(text)]);
  } finally {
    await loadingTask.destroy();
  }
}

export function extractMinutesFollowUpsFromText(text: string): RecordFollowUp[] {
  const machineBlocks = parseMinutesFollowUps(text);
  if (machineBlocks.length > 0) return machineBlocks;

  const normalized = normalizePdfText(text);
  const participants = extractParticipants(normalized);
  const actions = extractActionRows(section(normalized, "Actions and commitments", "Projects / project changes"), participants);
  const tensions = extractBullets(section(normalized, "Tensions and unresolved matters", "Governance follow-up"), "tension");
  const governance = extractBullets(section(normalized, "Governance follow-up", "Other relevant records or documents"), "governance");

  return dedupeFollowUps([...actions, ...tensions, ...governance]);
}

function extractPositionedActionRows(items: PositionedText[]): RecordFollowUp[] {
  const actionHeaders = items.filter((item) => item.text === "Action");

  for (const actionHeader of actionHeaders) {
    const ownerHeader = items.find((item) => item.text === "Owner" && Math.abs(item.y - actionHeader.y) <= 3);
    const dueHeader = items.find((item) => item.text === "Due" && Math.abs(item.y - actionHeader.y) <= 3);
    if (!ownerHeader || !dueHeader || !(actionHeader.x < ownerHeader.x && ownerHeader.x < dueHeader.x)) continue;

    const projectsHeader = items
      .filter((item) => item.text === "Projects" && item.y < actionHeader.y - 4)
      .sort((a, b) => b.y - a.y)[0];
    const lowerBoundary = projectsHeader?.y ?? Number.NEGATIVE_INFINITY;
    const ownerStart = ownerHeader.x - 10;
    const dueStart = dueHeader.x - 10;

    const body = items.filter((item) =>
      item.y < actionHeader.y - 4 &&
      item.y > lowerBoundary + 4,
    );

    const anchorYs = uniqueApproximateYs(
      body
        .filter((item) => item.x >= dueStart && isDueValue(item.text))
        .map((item) => item.y),
    ).sort((a, b) => b - a);

    if (anchorYs.length === 0) continue;

    const rows: RecordFollowUp[] = [];
    for (let index = 0; index < anchorYs.length; index += 1) {
      const anchorY = anchorYs[index];
      const nextY = anchorYs[index + 1] ?? lowerBoundary;
      const rowItems = body.filter((item) => item.y <= anchorY + 3 && item.y > nextY + 3);

      const action = joinPositioned(rowItems.filter((item) => item.x < ownerStart));
      if (!action) continue;

      const owner = joinPositioned(rowItems.filter((item) => item.x >= ownerStart && item.x < dueStart && Math.abs(item.y - anchorY) <= 3));
      const due = joinPositioned(rowItems.filter((item) => item.x >= dueStart && Math.abs(item.y - anchorY) <= 3));
      rows.push(makeFollowUp("action", action, owner || undefined, due || undefined));
    }

    if (rows.length > 0) return rows;
  }

  return [];
}

function uniqueApproximateYs(values: number[]) {
  const result: number[] = [];
  for (const value of values.sort((a, b) => b - a)) {
    if (!result.some((candidate) => Math.abs(candidate - value) <= 2)) result.push(value);
  }
  return result;
}

function joinPositioned(items: PositionedText[]) {
  return normalizeWhitespace(
    [...items]
      .sort((a, b) => Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x)
      .map((item) => item.text)
      .join(" "),
  );
}

function normalizePdfText(text: string) {
  return text
    .replace(/SDBP Meeting Minutes\s*\|\s*[^\n]*\n?/gi, "")
    .replace(/Page\s+\d+\s*/gi, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractParticipants(text: string) {
  const meetingStart = text.indexOf("Meeting");
  const keyUpdatesStart = text.indexOf("Key updates");
  const meeting = meetingStart >= 0 && keyUpdatesStart > meetingStart
    ? text.slice(meetingStart, keyUpdatesStart)
    : text;

  const match = meeting.match(/Participants\s+([^\n]+(?:\n(?!Context \/ project)[^\n]+)*)/i);
  if (!match) return new Set<string>();

  return new Set(
    match[1]
      .replace(/\n/g, " ")
      .split(/;|,/)
      .map((name) => normalizeWhitespace(name))
      .filter(Boolean),
  );
}

function section(text: string, startHeader: string, endHeader: string) {
  const start = text.indexOf(startHeader);
  if (start < 0) return "";
  const bodyStart = start + startHeader.length;
  const end = text.indexOf(endHeader, bodyStart);
  return text.slice(bodyStart, end >= 0 ? end : undefined).trim();
}

function extractActionRows(rawSection: string, participants: Set<string>): RecordFollowUp[] {
  if (!rawSection) return [];

  const lines = rawSection
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !/^(Action|Owner|Due)$/i.test(line));

  const rows: RecordFollowUp[] = [];
  let buffer: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];

    if (line === "Unclear" && next === "Unclear" && buffer.length > 0) {
      rows.push(makeFollowUp("action", buffer.join(" ")));
      buffer = [];
      index += 1;
      continue;
    }

    if (isDueValue(line) && buffer.length > 1) {
      const ownerCandidate = buffer[buffer.length - 1];
      if (looksLikeOwner(ownerCandidate, participants)) {
        buffer.pop();
        rows.push(makeFollowUp("action", buffer.join(" "), ownerCandidate === "Unclear" ? undefined : ownerCandidate, line));
        buffer = [];
        continue;
      }
    }

    buffer.push(line);
  }

  return rows;
}

function extractBullets(rawSection: string, kind: RecordFollowUpKind): RecordFollowUp[] {
  if (!rawSection) return [];

  const bullets: string[] = [];
  let current = "";

  for (const rawLine of rawSection.split("\n")) {
    const line = normalizeWhitespace(rawLine);
    if (!line) continue;

    if (/^[•●▪]\s*/.test(line)) {
      if (current) bullets.push(current);
      current = line.replace(/^[•●▪]\s*/, "");
    } else if (current) {
      current += ` ${line}`;
    }
  }
  if (current) bullets.push(current);

  return bullets.map((bullet) => makeFollowUp(kind, conciseTitle(bullet)));
}

function conciseTitle(value: string) {
  const normalized = normalizeWhitespace(value);
  const colon = normalized.indexOf(":");
  if (colon > 0 && colon <= 90) return normalized.slice(0, colon).trim();

  const sentence = normalized.match(/^(.{20,180}?[.!?])(?:\s|$)/)?.[1] ?? normalized;
  return sentence.length <= 180 ? sentence : `${sentence.slice(0, 177).trim()}…`;
}

function makeFollowUp(kind: RecordFollowUpKind, rawTitle: string, owner?: string, due?: string): RecordFollowUp {
  const title = normalizeWhitespace(rawTitle).replace(/[.;]+$/, "");
  const normalizedOwner = owner && owner.toLowerCase() !== "unclear" ? normalizeWhitespace(owner) : undefined;
  const normalizedDue = due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined;
  return {
    id: `followup-${crypto.randomUUID()}`,
    kind,
    title,
    owner: normalizedOwner,
    due: normalizedDue,
    status: "unreviewed",
  };
}

function isDueValue(value: string) {
  return value === "Unclear" || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function looksLikeOwner(value: string, participants: Set<string>) {
  if (value === "Unclear" || participants.has(value)) return true;
  if (/[.!?:;]/.test(value)) return false;
  const words = value.split(/\s+/);
  return words.length >= 1 && words.length <= 4 && value.length <= 60;
}

function dedupeFollowUps(items: RecordFollowUp[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${normalizeWhitespace(item.title).toLowerCase()}`;
    if (!item.title || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function hasMinutesSections(text: string) {
  return SECTION_HEADERS.some((header) => text.includes(header));
}
