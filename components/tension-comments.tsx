"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Tension } from "@/lib/domain";
import type { WorkspacePerson } from "@/lib/supabase/workspace";
import { addTensionComment, loadTensionComments, type TensionCommentEntry } from "@/lib/supabase/tension-comments";

export function TensionCommentsButton({ tension, currentUserId, personName, people, forceOpen = false, onOpened }: {
  tension: Tension;
  currentUserId: string;
  personName: (id: string) => string;
  people: WorkspacePerson[];
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
      <TensionCommentsModal tension={tension} currentUserId={currentUserId} personName={personName} people={people} onClose={() => setOpen(false)} />,
      document.body,
    )}
  </>;
}

function TensionCommentsModal({ tension, currentUserId, personName, people, onClose }: {
  tension: Tension;
  currentUserId: string;
  personName: (id: string) => string;
  people: WorkspacePerson[];
  onClose: () => void;
}) {
  const [comments, setComments] = useState<TensionCommentEntry[]>([]);
  const [body, setBody] = useState("");
  const [cursor, setCursor] = useState(0);
  const [mentionSuppressed, setMentionSuppressed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const mentionedIds = useMemo(() => extractMentionIds(body, people, currentUserId), [body, people, currentUserId]);
  const trigger = mentionSuppressed ? null : findMentionTrigger(body, cursor);
  const suggestions = useMemo(() => {
    if (!trigger) return [];
    const query = trigger.query.trim().toLowerCase();
    return people
      .filter((person) => person.id !== currentUserId)
      .filter((person) => !query || person.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [trigger, people, currentUserId]);

  function insertMention(person: WorkspacePerson) {
    if (!trigger) return;
    const insertion = `@${person.name} `;
    const next = `${body.slice(0, trigger.start)}${insertion}${body.slice(cursor)}`;
    const nextCursor = trigger.start + insertion.length;
    setBody(next);
    setCursor(nextCursor);
    setMentionSuppressed(true);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function add() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await addTensionComment(tension.id, body, mentionedIds);
      setBody("");
      setCursor(0);
      setMentionSuppressed(false);
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
      <p className="editor-note">Use comments for short clarification and context. Type @ to notify a specific person. Comments do not change the tension, its status, or what the raiser needs.</p>
      {loading ? <div className="project-context-empty">Loading comments…</div> : comments.length ? <div className="project-comments-list">{comments.map((comment) => <article className={comment.authorId === currentUserId ? "project-comment mine" : "project-comment"} key={comment.id}><div><strong>{personName(comment.authorId)}</strong><time>{formatTimestamp(comment.createdAt)}</time></div><CommentText text={comment.body} mentionedIds={comment.mentionedIds} personName={personName} />{comment.mentionedIds.length > 0 && <small className="tension-comment-notified">Notified: {comment.mentionedIds.map(personName).join(", ")}</small>}</article>)}</div> : <div className="project-context-empty">No comments yet.</div>}
      <label className="field project-comment-composer tension-comment-composer"><span>Add comment</span><textarea ref={textareaRef} rows={3} value={body} onChange={(event) => { setBody(event.target.value); setCursor(event.target.selectionStart); setMentionSuppressed(false); }} onClick={(event) => setCursor(event.currentTarget.selectionStart)} onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)} placeholder="Add clarification or context… Type @ to mention someone." />
        {suggestions.length > 0 && <div className="mention-suggestions" role="listbox" aria-label="Mention a board member">{suggestions.map((person) => <button type="button" role="option" key={person.id} onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(person)}><span className="mini-avatar">{person.name.charAt(0)}</span><span>{person.name}</span></button>)}</div>}
      </label>
      {mentionedIds.length > 0 && <div className="mention-notify-status"><strong>Will notify:</strong>{mentionedIds.map((id) => <span className="mention-pill" key={id}>@{personName(id)}</span>)}</div>}
      {error && <div className="auth-message error">{error}</div>}
      <div className="editor-actions"><div /><button className="primary" type="button" disabled={!body.trim() || saving} onClick={() => void add()}>{saving ? "Adding…" : "Add comment"}</button></div>
    </section>
  </div>;
}

function CommentText({ text, mentionedIds, personName }: { text: string; mentionedIds: string[]; personName: (id: string) => string }) {
  const names = mentionedIds.map((id) => ({ id, name: personName(id) })).filter((item) => item.name && item.name !== "Unknown").sort((a, b) => b.name.length - a.name.length);
  const pattern = ["https?:\\/\\/[^\\s]+", ...names.map((item) => `@${escapeRegExp(item.name)}`)].join("|");
  const parts = pattern ? text.split(new RegExp(`(${pattern})`, "gi")) : [text];

  return <p>{parts.map((part, index) => {
    if (/^https?:\/\//i.test(part)) return <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a>;
    const mention = names.find((item) => part.toLowerCase() === `@${item.name}`.toLowerCase());
    if (mention) return <span className="inline-mention" key={`${mention.id}-${index}`}>@{mention.name}</span>;
    return <span key={index}>{part}</span>;
  })}</p>;
}

function extractMentionIds(text: string, people: WorkspacePerson[], currentUserId: string) {
  return people
    .filter((person) => person.id !== currentUserId)
    .filter((person) => new RegExp(`@${escapeRegExp(person.name)}(?=$|[\\s,.;:!?])`, "i").test(text))
    .map((person) => person.id);
}

function findMentionTrigger(text: string, cursor: number) {
  if (cursor < 0) return null;
  const before = text.slice(0, cursor);
  const match = before.match(/(^|\s)@([^@\n]*)$/);
  if (!match) return null;
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  return { start: at, query: match[2] ?? "" };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Comments could not be loaded.";
}
