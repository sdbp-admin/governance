"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@/lib/domain";
import type { WorkspacePerson } from "@/lib/supabase/workspace";
import { addProjectComment, loadProjectComments, type ProjectCommentEntry } from "@/lib/supabase/project-comments";
import { loadProjectConflicts, type ProjectConflict } from "@/lib/supabase/project-coi";
import { announceCommentThreadChange, loadCommentThreadSummary, markCommentThreadSeen } from "@/lib/supabase/comment-thread-state";
import { useLocalDraft } from "@/lib/local-draft";

export function ProjectCommentsModal({ project, currentUserId, personName, people, onClose }: {
  project: Project;
  currentUserId: string;
  personName: (id: string) => string;
  people: WorkspacePerson[];
  onClose: () => void;
}) {
  const [comments, setComments] = useState<ProjectCommentEntry[]>([]);
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [seenBefore, setSeenBefore] = useState<string | null>(null);
  const [revealedCoiComments, setRevealedCoiComments] = useState<Set<string>>(new Set());
  const [body, setBody, clearBody] = useLocalDraft(`comment:project:${project.id}:${currentUserId}`, "");
  const [cursor, setCursor] = useState(0);
  const [mentionSuppressed, setMentionSuppressed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function refresh() {
    setComments(await loadProjectComments(project.id));
  }

  const refreshConflicts = useCallback(async () => {
    setConflicts(await loadProjectConflicts(project.id));
  }, [project.id]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      loadProjectComments(project.id),
      loadProjectConflicts(project.id),
      loadCommentThreadSummary("project", project.id),
    ])
      .then(([items, coi, summary]) => {
        if (!alive) return;
        setComments(items);
        setConflicts(coi);
        setSeenBefore(summary.lastSeenAt);
        void markCommentThreadSeen("project", project.id).catch(() => undefined);
      })
      .catch((err) => { if (alive) setError(readError(err)); })
      .finally(() => { if (alive) setLoading(false); });

    const onCoiChange = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId || detail.projectId === project.id) void refreshConflicts();
    };
    window.addEventListener("project-coi-changed", onCoiChange);
    return () => {
      alive = false;
      window.removeEventListener("project-coi-changed", onCoiChange);
    };
  }, [project.id, refreshConflicts]);

  const mentionedIds = useMemo(() => extractMentionIds(body, people, currentUserId), [body, people, currentUserId]);
  const firstNewIndex = useMemo(() => comments.findIndex((comment) => comment.authorId !== currentUserId && (!seenBefore || new Date(comment.createdAt).getTime() > new Date(seenBefore).getTime())), [comments, currentUserId, seenBefore]);
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

    if (conflicts.length > 0) {
      const names = conflicts.map((conflict) => personName(conflict.personId)).join(", ");
      const ownConflict = conflicts.some((conflict) => conflict.personId === currentUserId);
      const message = ownConflict
        ? `You have an active conflict of interest on this project. Your contribution will be marked as conflicted input for the others. Also make sure the visible text does not expose sensitive project information. Post this comment?`
        : `Conflict of interest active for ${names}. Make sure this visible comment does not contain sensitive information that could affect the conflict. Post it?`;
      if (!window.confirm(message)) return;
    }

    setSaving(true);
    setError("");
    try {
      await addProjectComment(project.id, body, mentionedIds);
      clearBody();
      setCursor(0);
      setMentionSuppressed(false);
      await refresh();
      announceCommentThreadChange("project", project.id);
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal project-context-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Project comments</span><h2>{project.title}</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">Use this for short project-specific clarification. Type @ to notify a specific person. Decisions, next steps and changed project reality still belong in their normal places.</p>
      {conflicts.length > 0 && <div className="coi-awareness-note"><strong>COI active · {conflicts.map((conflict) => personName(conflict.personId)).join(", ")}</strong><span>Visible comments remain visible to the conflicted person. Keep them free of information that could affect the conflict.</span></div>}
      {loading ? <div className="project-context-empty">Loading comments…</div> : comments.length ? <div className="project-comments-list">{comments.map((comment, index) => {
        const conflict = conflicts.find((item) => item.personId === comment.authorId);
        const obscured = Boolean(conflict && comment.authorId !== currentUserId && !revealedCoiComments.has(comment.id));
        return <Fragment key={comment.id}>
          {index === firstNewIndex && <div className="new-comment-divider"><span>New comments</span></div>}
          <article className={`${comment.authorId === currentUserId ? "project-comment mine" : "project-comment"}${conflict ? " coi-input" : ""}`}>
            <div><strong>{personName(comment.authorId)}{conflict && <span className="coi-inline-label">COI input</span>}</strong><time>{formatTimestamp(comment.createdAt)}</time></div>
            {obscured ? <div className="coi-obscured-input"><p>This contribution comes from a person with an active conflict of interest on this project.</p><button className="secondary small" type="button" onClick={() => setRevealedCoiComments((items) => new Set([...items, comment.id]))}>Reveal message</button></div> : <><CommentText text={comment.body} mentionedIds={comment.mentionedIds} personName={personName} />{comment.mentionedIds.length > 0 && <small className="tension-comment-notified">Notified: {comment.mentionedIds.map(personName).join(", ")}</small>}</>}
          </article>
        </Fragment>;
      })}</div> : <div className="project-context-empty">No comments yet.</div>}
      <label className="field project-comment-composer tension-comment-composer"><span>Add comment</span><textarea ref={textareaRef} rows={3} value={body} onChange={(event) => { setBody(event.target.value); setCursor(event.target.selectionStart); setMentionSuppressed(false); }} onClick={(event) => setCursor(event.currentTarget.selectionStart)} onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)} placeholder="Ask for clarification or leave a note… Type @ to mention someone." />
        {suggestions.length > 0 && <div className="mention-suggestions" role="listbox" aria-label="Mention a board member">{suggestions.map((person) => <button type="button" role="option" key={person.id} onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(person)}><span className="mini-avatar">{person.name.charAt(0)}</span><span>{person.name}</span></button>)}</div>}
      </label>
      {body.trim() && <small className="draft-saved-note">Draft saved on this device.</small>}
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
