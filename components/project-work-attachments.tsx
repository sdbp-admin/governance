"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadProjectConflicts, type ProjectConflict } from "@/lib/supabase/project-coi";
import {
  addWorkLink,
  createWorkFileSignedUrl,
  editWorkLink,
  loadWorkAttachments,
  removeWorkAttachment,
  replaceWorkFile,
  uploadWorkFile,
  type WorkAttachment,
} from "@/lib/supabase/work-attachments";

export function ProjectWorkAttachmentsButton({ projectId, projectTitle, personName }: {
  projectId: string;
  projectTitle: string;
  personName: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="quiet small" type="button" onClick={() => setOpen(true)}>Files &amp; links</button>
    {open && typeof document !== "undefined" ? createPortal(
      <ProjectWorkAttachmentsModal projectId={projectId} projectTitle={projectTitle} personName={personName} onClose={() => setOpen(false)} />,
      document.body,
    ) : null}
  </>;
}

function ProjectWorkAttachmentsModal({ projectId, projectTitle, personName, onClose }: {
  projectId: string;
  projectTitle: string;
  personName: (id: string) => string;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<WorkAttachment[]>([]);
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingLink, setSavingLink] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState<"add" | "edit" | null>(null);
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [replaceTarget, setReplaceTarget] = useState<WorkAttachment | null>(null);
  const uploadInput = useRef<HTMLInputElement | null>(null);
  const replaceInput = useRef<HTMLInputElement | null>(null);

  async function refresh() {
    setAttachments(await loadWorkAttachments("project", projectId));
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([loadWorkAttachments("project", projectId), loadProjectConflicts(projectId)])
      .then(([items, coi]) => { if (alive) { setAttachments(items); setConflicts(coi); } })
      .catch((err) => { if (alive) setError(readError(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [projectId]);

  function confirmCoiSafe(label: string) {
    if (conflicts.length === 0) return true;
    const names = conflicts.map((conflict) => personName(conflict.personId)).join(", ");
    return window.confirm(`Conflict of interest active for ${names}. Make sure the visible ${label} does not reveal sensitive information that could affect the conflict. Continue?`);
  }

  function confirmTemporaryUpload() {
    const coiNames = conflicts.map((conflict) => personName(conflict.personId)).join(", ");
    const coiNote = conflicts.length > 0
      ? `\n\nCOI active for ${coiNames}. Keep the filename free of information that could affect the conflict.`
      : "";
    return window.confirm(`Temporary attachment\n\nThis file is stored in SDBP Workspace only for the duration of this project. It will be automatically deleted when this project is completed.\n\nKeep the permanent copy in Google Drive.${coiNote}\n\nUpload anyway?`);
  }

  function confirmConflictedInput(item: WorkAttachment) {
    if (!item.contributorConflicted) return true;
    return window.confirm(`${personName(item.addedBy)} has an active conflict of interest on this project. This item is conflicted input. Open it deliberately?`);
  }

  function startAddLink() {
    setEditingLinkId(null);
    setLinkTitle("");
    setLinkUrl("");
    setLinkForm("add");
  }

  function startEditLink(item: WorkAttachment) {
    if (item.coiBlocked) return;
    setEditingLinkId(item.id);
    setLinkTitle(item.title);
    setLinkUrl(item.url ?? "");
    setLinkForm("edit");
  }

  async function saveLink() {
    if (!linkTitle.trim() || !linkUrl.trim() || savingLink) return;
    if (!confirmCoiSafe("link title")) return;
    setSavingLink(true);
    setError("");
    try {
      if (linkForm === "edit" && editingLinkId) await editWorkLink(editingLinkId, linkTitle, linkUrl);
      else await addWorkLink("project", projectId, linkTitle, linkUrl);
      setLinkForm(null);
      setEditingLinkId(null);
      setLinkTitle("");
      setLinkUrl("");
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setSavingLink(false);
    }
  }

  async function upload(file?: File) {
    if (!file || uploading) return;
    if (!confirmTemporaryUpload()) return;
    setUploading(true);
    setError("");
    try {
      await uploadWorkFile("project", projectId, file);
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setUploading(false);
    }
  }

  async function replace(file?: File) {
    const target = replaceTarget;
    if (!file || !target || uploading || target.coiBlocked) return;
    if (!confirmTemporaryUpload()) return;
    setUploading(true);
    setError("");
    try {
      await replaceWorkFile(target, file);
      setReplaceTarget(null);
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setUploading(false);
    }
  }

  async function remove(item: WorkAttachment) {
    if (item.coiBlocked) return;
    if (!window.confirm(`Remove “${item.title}” from this project? The file itself will be deleted from Workspace storage and the removal will be recorded in Activity.`)) return;
    setRemovingId(item.id);
    setError("");
    try {
      await removeWorkAttachment(item);
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setRemovingId(null);
    }
  }

  function openLink(item: WorkAttachment) {
    if (item.coiBlocked || !item.url) {
      setError("This link is protected because you have an active conflict of interest on this project.");
      return;
    }
    if (!confirmConflictedInput(item)) return;
    const opened = window.open(item.url, "_blank", "noopener,noreferrer");
    if (!opened) setError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
  }

  async function openFile(item: WorkAttachment) {
    if (item.coiBlocked || !item.storagePath || openingId) {
      if (item.coiBlocked) setError("This file is protected because you have an active conflict of interest on this project.");
      return;
    }
    if (!confirmConflictedInput(item)) return;
    const opened = window.open("about:blank", "_blank");
    if (opened) opened.opener = null;
    setOpeningId(item.id);
    setError("");
    try {
      const url = await createWorkFileSignedUrl(item.storagePath);
      if (!opened) {
        setError("Your browser blocked the new tab. Allow pop-ups for this site and try again.");
        return;
      }
      opened.location.href = url;
    } catch (err) {
      opened?.close();
      setError(readError(err));
    } finally {
      setOpeningId(null);
    }
  }

  const coiNames = conflicts.map((conflict) => personName(conflict.personId)).join(", ");
  const driveReminder = conflicts.length > 0 && isGoogleDriveUrl(linkUrl);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal work-files-modal" role="dialog" aria-modal="true" aria-label={`Files and links for ${projectTitle}`}>
      <div className="editor-head"><div><span className="section-kicker">Files &amp; links</span><h2>{projectTitle}</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">Uploaded files are temporary working copies and are deleted when the project is completed. Keep permanent working documents in Google Drive and link them here.</p>
      {conflicts.length > 0 && <div className="coi-awareness-note"><strong>COI active · {coiNames}</strong><span>Attachment titles remain visible. Keep filenames and link titles free of information that could affect the conflict.</span></div>}

      <div className="work-files-toolbar">
        <button className="secondary small" type="button" disabled={uploading} onClick={() => uploadInput.current?.click()}>{uploading ? "Uploading…" : "+ Upload file"}</button>
        <button className="secondary small" type="button" onClick={startAddLink}>+ Add link</button>
        <input ref={uploadInput} type="file" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        <input ref={replaceInput} type="file" hidden onChange={(event) => { void replace(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </div>

      {linkForm && <div className="work-link-form">
        <label className="field"><span>Link title</span><input autoFocus value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="AGRA budget 2026" /></label>
        <label className="field"><span>URL</span><input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://drive.google.com/…" /></label>
        {driveReminder && <div className="coi-drive-reminder"><strong>COI active: {coiNames}</strong><span>Make sure this Drive folder or document uses limited access and does not give {coiNames} access.</span></div>}
        <div className="process-actions"><button className="quiet small" type="button" onClick={() => setLinkForm(null)}>Cancel</button><button className="primary small" type="button" disabled={!linkTitle.trim() || !linkUrl.trim() || savingLink} onClick={() => void saveLink()}>{savingLink ? "Saving…" : linkForm === "edit" ? "Save link" : "Add link"}</button></div>
      </div>}

      {error && <div className="auth-message error work-files-error">{error}</div>}

      {loading ? <div className="project-context-empty">Loading files and links…</div> : attachments.length ? <div className="work-attachment-list">{attachments.map((item) => <article className={`work-attachment-row${item.contributorConflicted ? " coi-input" : ""}`} key={item.id}>
        <div className={`work-attachment-icon ${item.kind}`}>{item.kind === "file" ? "↓" : "↗"}</div>
        <div className="work-attachment-copy"><strong>{item.title}{item.contributorConflicted && <span className="coi-inline-label">COI input</span>}</strong><small>{item.coiBlocked ? "Content protected by active COI" : item.kind === "file" ? `${item.mimeType || "File"}${item.fileSize ? ` · ${formatBytes(item.fileSize)}` : ""}` : compactUrl(item.url ?? "")}</small><small>Added by {personName(item.addedBy)} · {formatTimestamp(item.createdAt)}</small></div>
        <div className="work-attachment-actions">
          {item.coiBlocked ? <button className="secondary small" type="button" disabled title="Your active conflict of interest prevents opening this content.">COI protected</button> : item.kind === "link" ? <button className="secondary small" type="button" onClick={() => openLink(item)}>Open</button> : <button className="secondary small" type="button" disabled={openingId === item.id} onClick={() => void openFile(item)}>{openingId === item.id ? "Opening…" : "Open"}</button>}
          {!item.coiBlocked && (item.kind === "link" ? <button className="quiet small" type="button" onClick={() => startEditLink(item)}>Edit</button> : <button className="quiet small" type="button" disabled={uploading} onClick={() => { setReplaceTarget(item); replaceInput.current?.click(); }}>Replace</button>)}
          {!item.coiBlocked && <button className="quiet small danger-quiet" type="button" disabled={removingId === item.id} onClick={() => void remove(item)}>{removingId === item.id ? "Removing…" : "Remove"}</button>}
        </div>
      </article>)}</div> : <div className="project-context-empty work-files-empty">No files or links attached yet.</div>}
    </section>
  </div>;
}

function isGoogleDriveUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "drive.google.com" || host === "docs.google.com" || host.endsWith(".drive.google.com") || host.endsWith(".docs.google.com");
  } catch {
    return false;
  }
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function compactUrl(value: string) {
  return value.length <= 72 ? value : `${value.slice(0, 69)}…`;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The files and links could not be updated.";
}
