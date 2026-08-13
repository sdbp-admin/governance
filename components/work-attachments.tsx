"use client";

import { useEffect, useRef, useState } from "react";
import {
  addWorkLink,
  createWorkFileSignedUrl,
  editWorkLink,
  loadWorkAttachments,
  removeWorkAttachment,
  replaceWorkFile,
  uploadWorkFile,
  type WorkAttachment,
  type WorkAttachmentParent,
} from "@/lib/supabase/work-attachments";

export function WorkAttachmentsButton({
  parentType,
  parentId,
  parentTitle,
  personName,
}: {
  parentType: WorkAttachmentParent;
  parentId: string;
  parentTitle: string;
  personName: (id: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button className="quiet small" type="button" onClick={() => setOpen(true)}>Files &amp; links</button>
    {open && <WorkAttachmentsModal parentType={parentType} parentId={parentId} parentTitle={parentTitle} personName={personName} onClose={() => setOpen(false)} />}
  </>;
}

function WorkAttachmentsModal({ parentType, parentId, parentTitle, personName, onClose }: {
  parentType: WorkAttachmentParent;
  parentId: string;
  parentTitle: string;
  personName: (id: string) => string;
  onClose: () => void;
}) {
  const [attachments, setAttachments] = useState<WorkAttachment[]>([]);
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
    setAttachments(await loadWorkAttachments(parentType, parentId));
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    void loadWorkAttachments(parentType, parentId)
      .then((items) => { if (alive) setAttachments(items); })
      .catch((err) => { if (alive) setError(readError(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [parentId, parentType]);

  function startAddLink() {
    setEditingLinkId(null);
    setLinkTitle("");
    setLinkUrl("");
    setLinkForm("add");
  }

  function startEditLink(item: WorkAttachment) {
    setEditingLinkId(item.id);
    setLinkTitle(item.title);
    setLinkUrl(item.url ?? "");
    setLinkForm("edit");
  }

  async function saveLink() {
    if (!linkTitle.trim() || !linkUrl.trim() || savingLink) return;
    setSavingLink(true);
    setError("");
    try {
      if (linkForm === "edit" && editingLinkId) await editWorkLink(editingLinkId, linkTitle, linkUrl);
      else await addWorkLink(parentType, parentId, linkTitle, linkUrl);
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
    setUploading(true);
    setError("");
    try {
      await uploadWorkFile(parentType, parentId, file);
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setUploading(false);
    }
  }

  async function replace(file?: File) {
    const target = replaceTarget;
    if (!file || !target || uploading) return;
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
    if (!window.confirm(`Remove “${item.title}” from this ${parentType}? The removal will be recorded in Activity.`)) return;
    setRemovingId(item.id);
    setError("");
    try {
      await removeWorkAttachment(item.id);
      await refresh();
    } catch (err) {
      setError(readError(err));
    } finally {
      setRemovingId(null);
    }
  }

  async function openFile(item: WorkAttachment) {
    if (!item.storagePath || openingId) return;
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

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal work-files-modal" role="dialog" aria-modal="true" aria-label={`Files and links for ${parentTitle}`}>
      <div className="editor-head"><div><span className="section-kicker">Files &amp; links</span><h2>{parentTitle}</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">Keep useful material beside the work. Upload supporting files here, or attach the Google Drive folder, Sheet, Doc or other external link where collaborative editing happens.</p>

      <div className="work-files-toolbar">
        <button className="secondary small" type="button" disabled={uploading} onClick={() => uploadInput.current?.click()}>{uploading ? "Uploading…" : "+ Upload file"}</button>
        <button className="secondary small" type="button" onClick={startAddLink}>+ Add link</button>
        <input ref={uploadInput} type="file" hidden onChange={(event) => { void upload(event.target.files?.[0]); event.currentTarget.value = ""; }} />
        <input ref={replaceInput} type="file" hidden onChange={(event) => { void replace(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </div>

      {linkForm && <div className="work-link-form">
        <label className="field"><span>Link title</span><input autoFocus value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="AGRA budget 2026" /></label>
        <label className="field"><span>URL</span><input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://drive.google.com/…" /></label>
        <div className="process-actions"><button className="quiet small" type="button" onClick={() => setLinkForm(null)}>Cancel</button><button className="primary small" type="button" disabled={!linkTitle.trim() || !linkUrl.trim() || savingLink} onClick={() => void saveLink()}>{savingLink ? "Saving…" : linkForm === "edit" ? "Save link" : "Add link"}</button></div>
      </div>}

      {error && <div className="auth-message error work-files-error">{error}</div>}

      {loading ? <div className="project-context-empty">Loading files and links…</div> : attachments.length ? <div className="work-attachment-list">{attachments.map((item) => <article className="work-attachment-row" key={item.id}>
        <div className={`work-attachment-icon ${item.kind}`}>{item.kind === "file" ? "↓" : "↗"}</div>
        <div className="work-attachment-copy"><strong>{item.title}</strong><small>{item.kind === "file" ? `${item.mimeType || "File"}${item.fileSize ? ` · ${formatBytes(item.fileSize)}` : ""}` : compactUrl(item.url ?? "")}</small><small>Added by {personName(item.addedBy)} · {formatTimestamp(item.createdAt)}</small></div>
        <div className="work-attachment-actions">
          {item.kind === "link" && item.url ? <a className="secondary small" href={item.url} target="_blank" rel="noreferrer">Open</a> : <button className="secondary small" type="button" disabled={openingId === item.id} onClick={() => void openFile(item)}>{openingId === item.id ? "Opening…" : "Open"}</button>}
          {item.kind === "link" ? <button className="quiet small" type="button" onClick={() => startEditLink(item)}>Edit</button> : <button className="quiet small" type="button" disabled={uploading} onClick={() => { setReplaceTarget(item); replaceInput.current?.click(); }}>Replace</button>}
          <button className="quiet small danger-quiet" type="button" disabled={removingId === item.id} onClick={() => void remove(item)}>{removingId === item.id ? "Removing…" : "Remove"}</button>
        </div>
      </article>)}</div> : <div className="project-context-empty work-files-empty">No files or links attached yet.</div>}
    </section>
  </div>;
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
