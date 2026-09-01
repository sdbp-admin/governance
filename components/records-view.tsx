"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { GovernanceProposal, Tension } from "@/lib/domain";
import { formatShortDate } from "@/lib/prototype-utils";
import { MINUTES_GPT_PROMPT } from "@/lib/records-followups";
import { loadActivity, type ActivityEntry } from "@/lib/supabase/activity";
import {
  archiveRecord,
  createRecordSignedUrl,
  loadArchivedRecords,
  loadRecords,
  restoreRecord,
  uploadRecord,
  uploadRecordVersion,
  type RecordSummary,
  type RecordType,
} from "@/lib/supabase/records";

type Props = {
  governanceProposals: GovernanceProposal[];
  tensions: Tension[];
  profileId?: string;
  onNotice?: (message: string) => void;
};

const RECORD_ACCEPT = ".pdf,.txt,.md,.doc,.docx,application/pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function RecordsView({ governanceProposals, tensions, profileId, onNotice }: Props) {
  const [records, setRecords] = useState<RecordSummary[]>([]);
  const [archivedRecords, setArchivedRecords] = useState<RecordSummary[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(Boolean(profileId));
  const [error, setError] = useState("");
  const [uploadingType, setUploadingType] = useState<RecordType | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const accepted = governanceProposals.filter((proposal) => proposal.stage === "accepted");
  const statutes = records.filter((record) => record.recordType === "statutes");
  const minutes = records
    .filter((record) => record.recordType === "board_minutes")
    .sort(compareMinutesByMeetingDate);
  const currentStatutes = statutes[0];

  useEffect(() => {
    if (!profileId) {
      setLoading(false);
      setRecords([]);
      setArchivedRecords([]);
      setActivity([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([loadRecords(), loadArchivedRecords(), loadActivity()])
      .then(([active, archived, recentActivity]) => {
        if (cancelled) return;
        setRecords(active);
        setArchivedRecords(archived);
        setActivity(recentActivity);
      })
      .catch((loadError) => {
        if (!cancelled) setError(readError(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [profileId]);

  async function refreshRecordsAndActivity() {
    const [active, archived, recentActivity] = await Promise.all([loadRecords(), loadArchivedRecords(), loadActivity()]);
    setRecords(active);
    setArchivedRecords(archived);
    setActivity(recentActivity);
  }

  async function copyMinutesPrompt() {
    try {
      await navigator.clipboard.writeText(MINUTES_GPT_PROMPT);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("The browser could not copy the meeting prompt.");
    }
  }

  async function storeFile(recordType: "statutes" | "board_minutes", file: File) {
    if (!profileId || uploadingType) return;

    setUploadingType(recordType);
    setError("");

    try {
      if (recordType === "statutes" && currentStatutes) {
        await uploadRecordVersion({
          recordId: currentStatutes.id,
          file,
          profileId,
          effectiveOn: dateFromFilename(file.name),
        });
        await refreshRecordsAndActivity();
        onNotice?.("SDBP Statutes updated. The previous version remains retained.");
        return;
      }

      await uploadRecord({
        title: recordType === "statutes" ? "SDBP Statutes" : titleFromFilename(file.name),
        recordType,
        effectiveOn: dateFromFilename(file.name),
        file,
        profileId,
      });

      await refreshRecordsAndActivity();
      onNotice?.(recordType === "statutes" ? "SDBP Statutes stored." : "Board minutes stored.");
    } catch (storeError) {
      setError(readError(storeError));
    } finally {
      setUploadingType(null);
    }
  }

  async function openRecord(record: RecordSummary) {
    const storagePath = record.currentVersion?.storagePath;
    if (!storagePath) return;

    if (!isPdfRecord(record)) {
      await downloadRecord(record);
      return;
    }

    const opened = window.open("about:blank", "_blank");
    if (opened) opened.opener = null;

    setOpeningId(record.id);
    setError("");
    try {
      const url = await createRecordSignedUrl(storagePath);
      if (!opened) {
        setError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
        return;
      }
      opened.location.href = url;
    } catch (openError) {
      opened?.close();
      setError(readError(openError));
    } finally {
      setOpeningId(null);
    }
  }

  async function downloadRecord(record: RecordSummary) {
    const storagePath = record.currentVersion?.storagePath;
    if (!storagePath) return;

    setOpeningId(record.id);
    setError("");
    try {
      const url = await createRecordSignedUrl(storagePath, true);
      const link = document.createElement("a");
      link.href = url;
      link.download = displayRecordTitle(record.title);
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (downloadError) {
      setError(readError(downloadError));
    } finally {
      setOpeningId(null);
    }
  }

  async function removeMinutes(record: RecordSummary) {
    const title = displayRecordTitle(record.title);
    const confirmed = window.confirm(`Remove “${title}” from Records?\n\nThe document will be hidden, not destroyed. The removal is recorded in Activity and any board member can restore it.`);
    if (!confirmed) return;

    setRemovingIds((items) => addToSet(items, record.id));
    setError("");
    try {
      await archiveRecord(record.id);
      await refreshRecordsAndActivity();
      onNotice?.(`Removed minutes: “${title}”. It can be restored from Records.`);
    } catch (removeError) {
      setError(readError(removeError));
    } finally {
      setRemovingIds((items) => removeFromSet(items, record.id));
    }
  }

  async function restoreArchived(record: RecordSummary) {
    const title = displayRecordTitle(record.title);
    setRestoringIds((items) => addToSet(items, record.id));
    setError("");
    try {
      await restoreRecord(record.id);
      await refreshRecordsAndActivity();
      onNotice?.(`Restored: “${title}”.`);
    } catch (restoreError) {
      setError(readError(restoreError));
    } finally {
      setRestoringIds((items) => removeFromSet(items, record.id));
    }
  }

  return <>
    <div className="records-intro records-intro-live">
      <span className="section-kicker">Organisational memory</span>
      <strong>Keep the authoritative document. Keep the workflow light.</strong>
      <p>Drop approved documents where they belong. The app keeps them accessible without interpreting them.</p>
    </div>

    {!profileId && <div className="records-status warning">Live Records require an authenticated board profile.</div>}
    {error && <div className="records-status error">{error}</div>}

    <div className="records-grid records-drop-grid">
      <article className="record-card record-1 records-drop-card">
        <div className="record-mark">§</div>
        <span className="kind">Legal backbone</span>
        <h2>SDBP Statutes</h2>
        <p>{currentStatutes ? "The current authoritative statutes are stored here. Drop a newer version to replace them without losing the previous one." : "Drop the current authoritative statutes here."}</p>

        {currentStatutes && <StoredDocument record={currentStatutes} openingId={openingId} onOpen={openRecord} label="Current statutes" />}

        <RecordDropZone
          label={uploadingType === "statutes" ? "Storing statutes…" : currentStatutes ? "Drop replacement statutes here" : "Drop statutes here"}
          hint="or click to choose the document"
          disabled={!profileId || loading || uploadingType !== null}
          onFile={(file) => storeFile("statutes", file)}
        />
      </article>

      <article className="record-card record-2 records-drop-card minutes-card">
        <div className="record-mark">M</div>
        <span className="kind">What happened</span>
        <h2>Board minutes</h2>
        <p>Turn the transcript into approved minutes, then drop the finished document here.</p>

        <button className="primary minutes-prompt-button" type="button" onClick={() => void copyMinutesPrompt()}>
          {copied ? "Prompt copied" : "Copy minutes + coaching prompt"}
        </button>
        <small className="minutes-prompt-note">Creates two PDFs: official minutes plus a separate facilitation coaching document for learning.</small>

        <RecordDropZone
          label={uploadingType === "board_minutes" ? "Storing minutes…" : "Drop approved minutes here"}
          hint="PDF preferred · or click to choose the document"
          disabled={!profileId || loading || uploadingType !== null}
          onFile={(file) => storeFile("board_minutes", file)}
        />

        {minutes.length > 0 && <div className="recent-minutes">
          <strong>Recent minutes</strong>
          {minutes.slice(0, 5).map((record) => <div className="minute-record" key={record.id}>
            <StoredDocument
              record={record}
              openingId={openingId}
              onOpen={openRecord}
              onDelete={() => void removeMinutes(record)}
              deleting={removingIds.has(record.id)}
            />
          </div>)}
          {minutes.length > 5 && <small>{minutes.length - 5} earlier {minutes.length - 5 === 1 ? "record" : "records"} also stored.</small>}
        </div>}
      </article>

      <article className="record-card record-3 records-drop-card governance-record-card">
        <div className="record-mark">G</div>
        <span className="kind">How we work</span>
        <h2>Governance agreements</h2>
        <p>Accepted governance decisions appear here automatically. Nothing needs to be uploaded.</p>

        {accepted.length > 0 ? <div className="governance-record-list">{accepted.map((proposal) => {
          const sourceTension = tensions.find((tension) => tension.id === proposal.tensionId);
          return <div className="governance-record-row" key={proposal.id}>
            <div><strong>{proposal.title}</strong><small>{proposal.proposal}</small>{sourceTension && <small>Source tension: {sourceTension.title}</small>}</div>
            <span>{proposal.acceptedAt ? formatShortDate(proposal.acceptedAt) : "accepted"}</span>
          </div>;
        })}</div> : <div className="records-card-empty"><span>○</span><strong>No accepted governance yet</strong><small>Accepted proposals will appear here automatically.</small></div>}
      </article>
    </div>

    <section className="section records-activity-section">
      <div className="section-head"><div><span className="section-kicker">Transparency</span><h2>Recent activity</h2></div><small className="activity-principle">Actions change the organisation. The ledger shows who changed what.</small></div>

      {archivedRecords.length > 0 && <div className="removed-records-panel">
        <div className="removed-records-head"><div><strong>Removed documents</strong><small>Hidden from normal Records, retained for recovery.</small></div><span>{archivedRecords.length}</span></div>
        <div className="removed-records-list">{archivedRecords.map((record) => <div className="removed-record-row" key={record.id}>
          <div><strong>{displayRecordTitle(record.title)}</strong><small>Removed {record.deletedAt ? formatActivityDate(record.deletedAt) : "recently"}</small></div>
          <div className="stored-record-actions">
            <button className="quiet" type="button" disabled={!record.currentVersion?.storagePath || openingId === record.id || restoringIds.has(record.id)} onClick={() => void openRecord(record)}>{openingId === record.id ? "Opening…" : "Open"}</button>
            <button className="secondary small" type="button" disabled={restoringIds.has(record.id)} onClick={() => void restoreArchived(record)}>{restoringIds.has(record.id) ? "Restoring…" : "Restore"}</button>
          </div>
        </div>)}</div>
      </div>}

      <div className="activity-ledger">
        {activity.length > 0 ? activity.map((entry) => <div className="activity-row" key={entry.id}>
          <span className="activity-dot" aria-hidden="true" />
          <div className="activity-copy"><strong>{entry.actorName}</strong><span>{entry.summary}</span></div>
          <time dateTime={entry.createdAt}>{formatActivityDate(entry.createdAt)}</time>
        </div>) : <div className="records-card-empty activity-empty"><span>○</span><strong>No activity recorded yet</strong><small>New consequential changes will appear here after the activity ledger is enabled.</small></div>}
      </div>
    </section>
  </>;
}

function RecordDropZone({ label, hint, disabled, onFile }: { label: string; hint: string; disabled: boolean; onFile: (file: File) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  function receive(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || disabled) return;
    void onFile(file);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    receive(event.dataTransfer.files);
  }

  return <div
    className={`record-dropzone${dragging ? " dragging" : ""}${disabled ? " disabled" : ""}`}
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-disabled={disabled}
    onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragOver={(event) => event.preventDefault()}
    onDragLeave={() => setDragging(false)}
    onDrop={onDrop}
    onClick={() => { if (!disabled) inputRef.current?.click(); }}
    onKeyDown={(event) => {
      if (!disabled && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        inputRef.current?.click();
      }
    }}
  >
    <input ref={inputRef} type="file" accept={RECORD_ACCEPT} hidden onChange={(event) => { receive(event.target.files); event.currentTarget.value = ""; }} />
    <span className="drop-icon" aria-hidden="true">↓</span>
    <strong>{label}</strong>
    <small>{hint}</small>
  </div>;
}

function StoredDocument({ record, openingId, onOpen, label, onDelete, deleting = false }: {
  record: RecordSummary;
  openingId: string | null;
  onOpen: (record: RecordSummary) => Promise<void>;
  label?: string;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const previewable = isPdfRecord(record);
  return <div className="stored-record-row">
    <div><small>{label}</small><strong>{displayRecordTitle(record.title)}</strong></div>
    <div className="stored-record-actions">
      <button className="quiet" type="button" disabled={!record.currentVersion?.storagePath || openingId === record.id || deleting} onClick={() => void onOpen(record)}>
        {openingId === record.id ? (previewable ? "Opening…" : "Downloading…") : (previewable ? "Open" : "Download")}
      </button>
      {onDelete && <button className="quiet record-delete" type="button" disabled={deleting || openingId === record.id} onClick={onDelete}>{deleting ? "Removing…" : "Remove"}</button>}
    </div>
  </div>;
}

function titleFromFilename(filename: string) {
  return decodeFilename(filename).replace(/\.[^/.]+$/, "").trim() || "SDBP Board Minutes";
}

function dateFromFilename(filename: string) {
  const match = decodeFilename(filename).match(/(?:^|\D)(\d{4}-\d{2}-\d{2})(?:\D|$)/);
  return match?.[1];
}

function compareMinutesByMeetingDate(a: RecordSummary, b: RecordSummary) {
  const aDate = a.currentVersion?.effectiveOn;
  const bDate = b.currentVersion?.effectiveOn;

  if (aDate && bDate) return bDate.localeCompare(aDate) || b.createdAt.localeCompare(a.createdAt);
  if (aDate) return -1;
  if (bDate) return 1;
  return b.createdAt.localeCompare(a.createdAt);
}

function displayRecordTitle(title: string) {
  return decodeFilename(title);
}

function decodeFilename(value: string) {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value.replace(/%20/gi, " ");
  }
}

function isPdfRecord(record: RecordSummary) {
  return record.currentVersion?.mimeType === "application/pdf" || /\.pdf$/i.test(record.currentVersion?.storagePath ?? "");
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function addToSet(items: Set<string>, value: string) {
  const next = new Set(items);
  next.add(value);
  return next;
}

function removeFromSet(items: Set<string>, value: string) {
  const next = new Set(items);
  next.delete(value);
  return next;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected Records error.";
}
