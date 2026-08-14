"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Tension } from "@/lib/domain";
import { addTensionComment, loadTensionComments, type TensionCommentEntry } from "@/lib/supabase/tension-comments";

export function TensionCommentsButton({ tension, currentUserId, personName, forceOpen = false, onOpened }: {
  tension: Tension;
  currentUserId: string;
  personName: (id: string) => string;
  forceOpen?: boolean;
  onOpened?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!forceOpen) return;
    setOpen(true);
    onOpened?.();
  }, [forceOpen, onOpened]);

  return <>
    <button className="quiet small" type="button" onClick={() => setOpen(true)}>Comments</button>
    {open && typeof document !== "undefined" && createPortal(
      <TensionCommentsModal tension={tension} currentUserId={currentUserId} personName={personName} onClose={() => setOpen(false)} />,
      document.body,
    )}
  </>;
}

function TensionCommentsModal({ tension, currentUserId, personName, onClose }: {
  tension: Tension;
  currentUserId: string;
  personName: (id: string) => string;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<TensionCommentEntry[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setComments(await loadTensionComments(tension.id));
  }

  useEffect(() => {
    let alive = true;
    void loadTensionComments(tension.id)
      .then((items) => { if (alive) setComments(items); })
      .catch((err) => { if (alive) setError(readError(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tension.id]);

  async function add() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await addTensionComment(tension.id, body);
      setBody("");
      await refresh();
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal tension-comments-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Tension comments</span><h2>{tension.title}</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">Use comments for short clarification and context. They do not change the tension, its status, or what the raiser needs.</p>
      {loading ? <div className="project-context-empty">Loading comments…</div> : comments.length ? <div className="project-comments-list">{comments.map((comment) => <article className={comment.authorId === currentUserId ? "project-comment mine" : "project-comment"} key={comment.id}><div><strong>{personName(comment.authorId)}</strong><time>{formatTimestamp(comment.createdAt)}</time></div><div><LinkifiedText text={comment.body} /></div></article>)}</div> : <div className="project-context-empty">No comments yet.</div>}
      <label className="field project-comment-composer"><span>Add comment</span><textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add clarification or context…" /></label>
      {error && <div className="auth-message error">{error}</div>}
      <div className="editor-actions"><div /><button className="primary" type="button" disabled={!body.trim() || saving} onClick={() => void add()}>{saving ? "Adding…" : "Add comment"}</button></div>
    </section>
  </div>;
}

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <p>{parts.map((part, index) => /^https?:\/\//.test(part) ? <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a> : <span key={index}>{part}</span>)}</p>;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Comments could not be loaded.";
}
