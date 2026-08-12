"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { GovernanceProposal, Tension } from "@/lib/domain";
import { formatShortDate } from "@/lib/prototype-utils";
import {
  MINUTES_GPT_PROMPT,
  parseMinutesFollowUps,
  type RecordFollowUp,
} from "@/lib/records-followups";
import {
  createRecordSignedUrl,
  loadRecords,
  uploadRecord,
  type RecordSummary,
  type RecordType,
} from "@/lib/supabase/records";

type Props = {
  governanceProposals: GovernanceProposal[];
  tensions: Tension[];
  profileId?: string;
  onNotice?: (message: string) => void;
};

type Draft = {
  title: string;
  recordType: RecordType;
  description: string;
  source: string;
  participants: string;
  effectiveOn: string;
  minutesText: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  recordType: "board_minutes",
  description: "",
  source: "",
  participants: "",
  effectiveOn: "",
  minutesText: "",
};

const RECORD_LABELS: Record<RecordType, string> = {
  statutes: "Statutes",
  board_minutes: "Board minutes",
  transcript: "Transcript",
  other: "Other record",
};

export function RecordsView({ governanceProposals, tensions, profileId, onNotice }: Props) {
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(profileId));
  const [error, setError] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const accepted = governanceProposals.filter((proposal) => proposal.stage === "accepted");
  const extractedFollowUps = useMemo(
    () => draft.recordType === "board_minutes" && draft.minutesText.trim()
      ? parseMinutesFollowUps(draft.minutesText)
      : [],
    [draft.recordType, draft.minutesText],
  );

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      setRecords([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    loadRecords()
      .then((items) => {
        if (!cancelled) setRecords(items);
      })
      .catch((loadError) => {
        if (!cancelled) setError(readError(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [profileId]);

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileId || saving) return;

    const title = draft.title.trim();
    if (!title) {
      setError("Give the record a title.");
      return;
    }

    let recordFile = file;
    let followups: RecordFollowUp[] = [];

    if (draft.recordType === "board_minutes" && draft.minutesText.trim()) {
      const filename = `${slugify(title) || "sdbp-minutes"}.md`;
      recordFile = new File([draft.minutesText.trim() + "\n"], filename, { type: "text/markdown" });
      followups = extractedFollowUps;
    } else if (recordFile && isTextFile(recordFile)) {
      try {
        followups = draft.recordType === "board_minutes"
          ? parseMinutesFollowUps(await recordFile.text())
          : [];
      } catch {
        followups = [];
      }
    }

    if (!recordFile) {
      setError(draft.recordType === "board_minutes"
        ? "Paste the final minutes or choose a file to store."
        : "Choose a file to store.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const created = await uploadRecord({
        title,
        recordType: draft.recordType,
        description: draft.description,
        source: draft.source,
        participants: splitParticipants(draft.participants),
        followups,
        effectiveOn: draft.effectiveOn || undefined,
        file: recordFile,
        profileId,
      });

      setRecords((items) => [created, ...items]);
      setDraft(EMPTY_DRAFT);
      setFile(null);
      setComposerOpen(false);
      onNotice?.(`${RECORD_LABELS[created.recordType]} saved to SDBP Records.`);
    } catch (saveError) {
      setError(readError(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function openRecord(record: RecordSummary, download = false) {
    const storagePath = record.currentVersion?.storagePath;
    if (!storagePath) return;

    setOpeningId(record.id);
    setError("");
    try {
      const url = await createRecordSignedUrl(storagePath, download);
      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.assign(url);
    } catch (openError) {
      setError(readError(openError));
    } finally {
      setOpeningId(null);
    }
  }

  async function copyMinutesPrompt() {
    try {
      await navigator.clipboard.writeText(MINUTES_GPT_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("The browser could not copy the prompt. You can still prepare minutes outside the app and paste them here.");
    }
  }

  const minutes = records.filter((record) => record.recordType === "board_minutes");
  const statutes = records.filter((record) => record.recordType === "statutes");
  const supporting = records.filter((record) => record.recordType === "transcript" || record.recordType === "other");

  return <>
    <section className="records-live-intro">
      <div>
        <span className="section-kicker">Organisational memory</span>
        <h2>Authoritative records stay with the organisation.</h2>
        <p>Approved minutes, statutes and relevant source records are stored privately. Governance agreements remain linked directly to the accepted governance proposal that created them.</p>
      </div>
      <button className="primary" type="button" onClick={() => setComposerOpen((open) => !open)} disabled={!profileId}>
        {composerOpen ? "Close" : "Add record"}
      </button>
    </section>

    {!profileId && <div className="records-status warning">Live Records require an authenticated board profile.</div>}
    {error && <div className="records-status error">{error}</div>}

    {composerOpen && profileId && <form className="record-composer" onSubmit={saveRecord}>
      <div className="record-composer-head">
        <div><span className="section-kicker">New record</span><h2>Store an authoritative version</h2></div>
        <small>Private board storage</small>
      </div>

      <div className="record-form-grid">
        <label><span>Type</span><select value={draft.recordType} onChange={(event) => setDraft((value) => ({ ...value, recordType: event.target.value as RecordType }))}>
          {(Object.keys(RECORD_LABELS) as RecordType[]).map((type) => <option value={type} key={type}>{RECORD_LABELS[type]}</option>)}
        </select></label>
        <label><span>Title</span><input value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} placeholder={draft.recordType === "board_minutes" ? "Board meeting · 12 August 2026" : "Record title"} required /></label>
        <label><span>Effective / meeting date</span><input type="date" value={draft.effectiveOn} onChange={(event) => setDraft((value) => ({ ...value, effectiveOn: event.target.value }))} /></label>
        <label><span>Source</span><input value={draft.source} onChange={(event) => setDraft((value) => ({ ...value, source: event.target.value }))} placeholder="Board meeting, General Assembly, notarial deed…" /></label>
        <label className="record-form-wide"><span>Participants</span><input value={draft.participants} onChange={(event) => setDraft((value) => ({ ...value, participants: event.target.value }))} placeholder="Names separated by commas" /></label>
        <label className="record-form-wide"><span>Description</span><textarea value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} rows={2} placeholder="Optional context for future board members" /></label>
      </div>

      {draft.recordType === "board_minutes" && <div className="minutes-intake">
        <div className="minutes-intake-head"><div><strong>Paste final minutes</strong><small>Preferred for minutes prepared from a transcript. Explicit follow-up blocks are detected locally for human review.</small></div><button className="quiet" type="button" onClick={() => void copyMinutesPrompt()}>{copied ? "Prompt copied" : "Copy minutes prompt"}</button></div>
        <textarea value={draft.minutesText} onChange={(event) => setDraft((value) => ({ ...value, minutesText: event.target.value }))} rows={12} placeholder="Paste the final SDBP minutes here. If you leave this empty, the selected file below will be stored instead." />
        {draft.minutesText.trim() && <FollowUpPreview followups={extractedFollowUps} />}
      </div>}

      <label className="record-file"><span>{draft.recordType === "board_minutes" ? "Or upload a file" : "File"}</span><input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} accept=".pdf,.txt,.md,.doc,.docx,application/pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" /><small>{file ? file.name : "PDF, Word, text or Markdown"}</small></label>

      <div className="record-composer-actions"><button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save record"}</button><button className="secondary" type="button" onClick={() => { setComposerOpen(false); setError(""); }}>Cancel</button></div>
    </form>}

    <section className="section records-section">
      <div className="section-head"><div><span className="section-kicker">Authoritative documents</span><h2>Records</h2></div><small>{loading ? "Loading…" : `${records.length} stored`}</small></div>
      {loading ? <div className="calm-empty compact-empty"><span>○</span><h3>Loading records</h3><p>Reading the private board record index.</p></div> : records.length === 0 ? <div className="calm-empty compact-empty"><span>○</span><h3>No stored records yet</h3><p>Add the first approved minutes, statute version or supporting record.</p></div> : <div className="record-library">
        <RecordGroup title="Board minutes" records={minutes} openingId={openingId} onOpen={openRecord} />
        <RecordGroup title="Statutes" records={statutes} openingId={openingId} onOpen={openRecord} />
        <RecordGroup title="Supporting records" records={supporting} openingId={openingId} onOpen={openRecord} />
      </div>}
    </section>

    <section className="section">
      <div className="section-head"><div><span className="section-kicker">How we work</span><h2>Governance agreements</h2></div></div>
      {accepted.length > 0 ? <div className="soft-list">{accepted.map((proposal) => {
        const sourceTension = tensions.find((tension) => tension.id === proposal.tensionId);
        return <div className="soft-row" key={proposal.id}><div><strong>{proposal.title}</strong><small>{proposal.proposal}</small>{sourceTension && <small>Source tension: {sourceTension.title}</small>}</div><span className="definition-status defined">{proposal.acceptedAt ? formatShortDate(proposal.acceptedAt) : "accepted"}</span></div>;
      })}</div> : <div className="calm-empty compact-empty"><span>○</span><h3>No accepted governance yet</h3><p>An accepted proposal from a Governance Meeting will appear here automatically.</p></div>}
    </section>
  </>;
}

function RecordGroup({ title, records, openingId, onOpen }: { title: string; records: RecordSummary[]; openingId: string | null; onOpen: (record: RecordSummary, download?: boolean) => void }) {
  if (records.length === 0) return null;
  return <div className="record-group"><h3>{title}</h3><div className="record-list">{records.map((record) => <article className="record-row" key={record.id}>
    <div className="record-row-mark">{recordMark(record.recordType)}</div>
    <div className="record-row-copy"><div className="record-row-meta"><span>{RECORD_LABELS[record.recordType]}</span>{record.currentVersion?.effectiveOn && <span>{record.currentVersion.effectiveOn}</span>}<span>v{record.currentVersion?.versionLabel ?? "1"}</span></div><strong>{record.title}</strong>{record.description && <p>{record.description}</p>}{record.participants.length > 0 && <small>Participants: {record.participants.join(", ")}</small>}{record.followups.length > 0 && <div className="record-followup-count">{record.followups.filter((item) => item.status === "unreviewed").length || record.followups.length} follow-up {record.followups.length === 1 ? "candidate" : "candidates"} recorded</div>}</div>
    <div className="record-row-actions"><button className="secondary" type="button" disabled={!record.currentVersion?.storagePath || openingId === record.id} onClick={() => void onOpen(record)}>{openingId === record.id ? "Opening…" : "Open"}</button><button className="quiet" type="button" disabled={!record.currentVersion?.storagePath || openingId === record.id} onClick={() => void onOpen(record, true)}>Download</button></div>
  </article>)}</div></div>;
}

function FollowUpPreview({ followups }: { followups: RecordFollowUp[] }) {
  return <div className="followup-preview"><div><strong>Follow-up candidates</strong><small>{followups.length ? "These are not commitments until a board member reviews them in the normal workflow." : "No explicit follow-up blocks detected."}</small></div>{followups.length > 0 && <div className="followup-preview-list">{followups.map((item) => <div key={item.id}><span>{item.kind}</span><strong>{item.title}</strong><small>{[item.owner && `Owner: ${item.owner}`, item.due && `Due: ${item.due}`].filter(Boolean).join(" · ") || "No owner or due date captured"}</small></div>)}</div>}</div>;
}

function splitParticipants(value: string) {
  return value.split(",").map((name) => name.trim()).filter(Boolean);
}

function isTextFile(file: File) {
  return file.type.startsWith("text/") || /\.(md|txt)$/i.test(file.name);
}

function recordMark(type: RecordType) {
  if (type === "statutes") return "§";
  if (type === "board_minutes") return "M";
  if (type === "transcript") return "T";
  return "R";
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected Records error.";
}
