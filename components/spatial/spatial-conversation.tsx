"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useLocalDraft } from "@/lib/local-draft";
import { loadProjectComments, addProjectComment, editProjectComment } from "@/lib/supabase/project-comments";
import { loadTensionComments, addTensionComment, editTensionComment } from "@/lib/supabase/tension-comments";
import { loadActionComments, addActionComment, editActionComment } from "@/lib/supabase/action-comments";
import { loadCommentThreadSummary, markCommentThreadSeen, announceCommentThreadChange, type CommentThreadType } from "@/lib/supabase/comment-thread-state";
import { loadProjectConflicts, type ProjectConflict } from "@/lib/supabase/project-coi";
import { acknowledgeAttentionSignal, type WorkspacePerson } from "@/lib/supabase/workspace";
import styles from "./spatial.module.css";

type Comment = Awaited<ReturnType<typeof loadProjectComments>>[number] | Awaited<ReturnType<typeof loadTensionComments>>[number] | Awaited<ReturnType<typeof loadActionComments>>[number];
export function SpatialConversation({ kind, id, people, userId, signalIds = [], targetCommentId, compact = false }: { kind: CommentThreadType; id: string; people: WorkspacePerson[]; userId: string; signalIds?: string[]; targetCommentId?: string; compact?: boolean }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [seenBefore, setSeenBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const [editCursor, setEditCursor] = useState(0);
  const [editSuppressed, setEditSuppressed] = useState(false);
  const [body, setBody, clearBody] = useLocalDraft(`comment:${kind}:${id}:${userId}`, "");
  const [cursor, setCursor] = useState(0);
  const [suppressed, setSuppressed] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const editInput = useRef<HTMLTextAreaElement>(null);
  const signalsOnOpen = useRef(signalIds);
  const name = (personId: string) => people.find(p => p.id === personId)?.name ?? "Unknown";
  useEffect(() => {
    let alive = true;
    void Promise.all([loadThreadComments(kind, id), loadCommentThreadSummary(kind, id), kind === "project" ? loadProjectConflicts(id) : Promise.resolve([])])
      .then(async ([entries, summary, coi]) => {
        if (!alive) return; setComments(entries); setSeenBefore(summary.lastSeenAt); setConflicts(coi); setLoading(false);
        await markCommentThreadSeen(kind, id);
        // Opening conversation acknowledges its prompts, never its durable requests.
        for (const signal of signalsOnOpen.current) await acknowledgeAttentionSignal(signal);
        window.dispatchEvent(new Event("focus"));
      }).catch(e => { if (alive) { setError(String(e.message ?? e)); setLoading(false); } });
    const coiChanged = () => { if (kind === "project") void loadProjectConflicts(id).then(items => { if (alive) setConflicts(items); }).catch(e => { if (alive) setError(String(e.message ?? e)); }); };
    window.addEventListener("project-coi-changed", coiChanged);
    return () => { alive = false; window.removeEventListener("project-coi-changed", coiChanged); };
  }, [id, kind]);
  useEffect(() => {
    if (loading || !targetCommentId) return;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(`spatial-comment-${targetCommentId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [loading, targetCommentId]);
  const mentionIdsFor = (text: string) => {
    const all = /(^|[\s(])@all(?=$|[\s.,!?;:)])/i.test(text);
    return [...new Set(people.filter(p => p.id !== userId && ((all && p.linked) || new RegExp(`(^|\\s)@${escape(p.name)}(?=$|[\\s.,!?;:)])`, "i").test(text))).map(p => p.id))];
  };
  const mentionedIds = mentionIdsFor(body);
  const editMentionedIds = mentionIdsFor(editing?.body ?? "");
  const trigger = suppressed ? null : body.slice(0, cursor).match(/(?:^|\s)@([^@\n]*)$/);
  const query = trigger?.[1].toLowerCase() ?? "";
  const suggestions = trigger ? people.filter(p => p.id !== userId && p.name.toLowerCase().includes(query)).slice(0, 6) : [];
  const editTrigger = editSuppressed ? null : (editing?.body ?? "").slice(0, editCursor).match(/(?:^|\s)@([^@\n]*)$/);
  const editQuery = editTrigger?.[1].toLowerCase() ?? "";
  const editSuggestions = editTrigger ? people.filter(p => p.id !== userId && p.name.toLowerCase().includes(editQuery)).slice(0, 6) : [];
  function insert(label: string) {
    const start = body.lastIndexOf("@", cursor - 1); if (start < 0) return;
    const insertion = `@${label} `; setBody(body.slice(0, start) + insertion + body.slice(cursor)); setCursor(start + insertion.length); setSuppressed(true);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + insertion.length, start + insertion.length); });
  }
  function insertEdit(label: string) {
    if (!editing) return;
    const start = editing.body.lastIndexOf("@", editCursor - 1); if (start < 0) return;
    const insertion = `@${label} `;
    setEditing({ ...editing, body: editing.body.slice(0, start) + insertion + editing.body.slice(editCursor) });
    setEditCursor(start + insertion.length); setEditSuppressed(true);
    requestAnimationFrame(() => { editInput.current?.focus(); editInput.current?.setSelectionRange(start + insertion.length, start + insertion.length); });
  }
  async function add() {
    if (!body.trim() || saving || loading) return;
    if (conflicts.length && !window.confirm(conflicts.some(c => c.personId === userId) ? "You have an active conflict of interest on this project. Your contribution will be marked as conflicted input. Make sure it does not expose sensitive project information. Post this comment?" : `Conflict of interest active for ${conflicts.map(c => name(c.personId)).join(", ")}. Make sure this visible comment does not contain sensitive information that could affect the conflict. Post it?`)) return;
    setSaving(true); setError("");
    try {
      // Each client makes one comment RPC and one downstream notification call.
      await addThreadComment(kind, id, body, mentionedIds);
      clearBody(); setCursor(0); setSuppressed(false);
      setComments(await loadThreadComments(kind, id));
      announceCommentThreadChange(kind, id); window.dispatchEvent(new Event("focus"));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  }
  async function saveEdit() {
    if (!editing?.body.trim() || saving) return;
    if (conflicts.length && !window.confirm(conflicts.some(c => c.personId === userId) ? "You have an active conflict of interest on this project. Your edited contribution remains marked as conflicted input. Save this edit?" : `Conflict of interest active for ${conflicts.map(c => name(c.personId)).join(", ")}. Make sure the edited comment does not contain sensitive information that could affect the conflict. Save this edit?`)) return;
    setSaving(true); setError("");
    try {
      await editThreadComment(kind, editing.id, editing.body, editMentionedIds);
      setEditing(null); setEditCursor(0); setEditSuppressed(false);
      setComments(await loadThreadComments(kind, id));
      window.dispatchEvent(new Event("focus"));
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setSaving(false); }
  }
  const newComment = (c: Comment) => c.authorId !== userId && (!seenBefore || c.createdAt > seenBefore);
  const firstNew = comments.findIndex(newComment);
  return <section className={styles.conversationPlane} data-compact={compact || undefined}><header><h2>Conversation</h2><small>{comments.length} {comments.length === 1 ? "comment" : "comments"}</small></header>
    {conflicts.length > 0 && <p className={styles.coiNote}>COI active · {conflicts.map(c => name(c.personId)).join(", ")}. Visible comments remain visible to conflicted people.</p>}
    <div className={styles.thread} data-targeting={Boolean(targetCommentId) || undefined}>{loading ? <p>Opening conversation…</p> : comments.map((c, index) => {
      const conflict = conflicts.some(item => item.personId === c.authorId);
      const hidden = conflict && c.authorId !== userId && !revealed.has(c.id);
      const isEditing = editing?.id === c.id;
      return <Fragment key={c.id}>{index === firstNew && <div className={styles.newDivider}>New comments</div>}<article tabIndex={c.id === targetCommentId ? -1 : undefined} data-target={c.id === targetCommentId || undefined} data-personal={(c.id === targetCommentId || newComment(c) && c.mentionedIds.includes(userId)) || undefined} id={`spatial-comment-${c.id}`}><div><strong>{name(c.authorId)}{conflict ? " · COI input" : ""}</strong><span className={styles.commentMeta}><time>{new Date(c.createdAt).toLocaleString()}</time>{c.updatedAt && <small>Edited</small>}{c.authorId === userId && !isEditing && <button type="button" onClick={() => { setEditing({ id: c.id, body: c.body }); setEditCursor(c.body.length); setEditSuppressed(false); }}>Edit</button>}</span></div>
        {isEditing ? <div className={styles.commentEditor}><textarea ref={editInput} rows={3} value={editing.body} onChange={event => { setEditing({ ...editing, body: event.target.value }); setEditCursor(event.target.selectionStart); setEditSuppressed(false); }} onClick={event => setEditCursor(event.currentTarget.selectionStart)} onKeyUp={event => setEditCursor(event.currentTarget.selectionStart)} />
          {editTrigger && <div className={styles.mentionSuggestions}>{"all".startsWith(editQuery) && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertEdit("all")}>@all · all active members</button>}{editSuggestions.map(p => <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insertEdit(p.name)}>@{p.name}</button>)}</div>}
          {editMentionedIds.length > 0 && <small>Mentions after edit: {editMentionedIds.map(name).join(", ")}</small>}
          <div><button type="button" onClick={() => { setEditing(null); setEditSuppressed(false); }}>Cancel</button><button type="button" disabled={saving || !editing.body.trim()} onClick={() => void saveEdit()}>{saving ? "Saving…" : "Save"}</button></div>
        </div> : hidden ? <><p>This contribution comes from a person with an active conflict of interest.</p><button onClick={() => setRevealed(old => new Set([...old, c.id]))}>Reveal message</button></> : <><CommentText body={c.body} names={c.mentionedIds.map(name)} />{c.mentionedIds.length > 0 && <small>Notified: {c.mentionedIds.map(name).join(", ")}</small>}</>}
      </article></Fragment>;
    })}{!loading && !comments.length && <p className={styles.quietEmpty}>No conversation yet.</p>}</div>
    <form className={styles.composer} onSubmit={e => { e.preventDefault(); void add(); }}><label>Add to conversation<textarea ref={input} rows={3} value={body} placeholder="Type @ for a person or @all for active members" onChange={e => { setBody(e.target.value); setCursor(e.target.selectionStart); setSuppressed(false); }} onClick={e => setCursor(e.currentTarget.selectionStart)} onKeyUp={e => setCursor(e.currentTarget.selectionStart)} /></label>
      {trigger && <div className={styles.mentionSuggestions}>{"all".startsWith(query) && <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => insert("all")}>@all · all active members</button>}{suggestions.map(p => <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => insert(p.name)}>@{p.name}</button>)}</div>}
      {mentionedIds.length > 0 && <small>Will notify: {mentionedIds.map(name).join(", ")}</small>}{body.trim() && <small>Draft saved on this device.</small>}
      {error && <p role="alert" className={styles.threadError}>{error}</p>}<button disabled={loading || saving || !body.trim()}>{saving ? "Adding…" : "Add to conversation"}</button>
    </form>
  </section>;
}

async function loadThreadComments(kind: CommentThreadType, id: string): Promise<Comment[]> {
  if (kind === "project") return loadProjectComments(id);
  if (kind === "tension") return loadTensionComments(id);
  return loadActionComments(id);
}

async function addThreadComment(kind: CommentThreadType, id: string, body: string, mentionedIds: string[]) {
  if (kind === "project") return addProjectComment(id, body, mentionedIds);
  if (kind === "tension") return addTensionComment(id, body, mentionedIds);
  return addActionComment(id, body, mentionedIds);
}

async function editThreadComment(kind: CommentThreadType, id: string, body: string, mentionedIds: string[]) {
  if (kind === "project") return editProjectComment(id, body, mentionedIds);
  if (kind === "tension") return editTensionComment(id, body, mentionedIds);
  return editActionComment(id, body, mentionedIds);
}

function CommentText({ body, names }: { body: string; names: string[] }) {
  const pattern = ["https?:\\/\\/[^\\s]+", "@all\\b", ...[...names].sort((a, b) => b.length - a.length).map(n => `@${escape(n)}`)].join("|");
  return <p>{body.split(new RegExp(`(${pattern})`, "gi")).map((part, i) => /^https?:\/\//i.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a> : part.startsWith("@") && (part.toLowerCase() === "@all" || names.some(n => `@${n}`.toLowerCase() === part.toLowerCase())) ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>)}</p>;
}
function escape(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
