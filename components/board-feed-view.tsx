"use client";

import { useEffect, useMemo, useState } from "react";
import { WorkAttachmentsButton } from "@/components/work-attachments";
import { addBoardPostComment, createBoardPost, loadBoardFeed, setBoardPostPinned, type BoardFeedPost } from "@/lib/supabase/board-feed";
import type { WorkspacePerson } from "@/lib/supabase/workspace";

export function BoardFeedView({ people, currentUserId, personName, openPostId, onOpenedPost }: {
  people: WorkspacePerson[];
  currentUserId: string;
  personName: (id: string) => string;
  openPostId?: string | null;
  onOpenedPost?: () => void;
}) {
  const [posts, setPosts] = useState<BoardFeedPost[]>([]);
  const [draft, setDraft] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    setPosts(await loadBoardFeed());
  }

  useEffect(() => {
    let alive = true;
    void loadBoardFeed().then((items) => { if (alive) setPosts(items); }).catch((err) => { if (alive) setError(readError(err)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!openPostId) return;
    setExpanded((items) => new Set(items).add(openPostId));
    const timer = window.setTimeout(() => document.getElementById(`feed-post-${openPostId}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    onOpenedPost?.();
    return () => window.clearTimeout(timer);
  }, [openPostId, onOpenedPost]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return posts;
    return posts.filter((post) => `${personName(post.authorId)} ${post.body} ${post.comments.map((comment) => `${personName(comment.authorId)} ${comment.body}`).join(" ")}`.toLowerCase().includes(needle));
  }, [posts, search, personName]);

  async function publish() {
    if (!draft.trim() || saving) return;
    setSaving(true); setError("");
    try {
      await createBoardPost(draft, mentions);
      setDraft(""); setMentions([]);
      await refresh();
      window.dispatchEvent(new Event("focus"));
    } catch (err) { setError(readError(err)); }
    finally { setSaving(false); }
  }

  async function pin(post: BoardFeedPost) {
    setError("");
    try { await setBoardPostPinned(post.id, !post.pinned); await refresh(); }
    catch (err) { setError(readError(err)); }
  }

  return <>
    <section className="feed-composer">
      <div><span className="section-kicker">Shared board communication</span><h2>Post once. Keep it findable.</h2><p>Use this for general notices, requests and context that should not disappear into email or WhatsApp.</p></div>
      <div className="feed-compose-fields"><textarea rows={4} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Share an update, request or useful context…" /><MentionPicker people={people} currentUserId={currentUserId} selected={mentions} setSelected={setMentions} /><div className="feed-compose-actions"><span>{mentions.length ? `${mentions.length} ${mentions.length === 1 ? "person" : "people"} mentioned` : "No one specifically mentioned"}</span><button className="primary" type="button" disabled={!draft.trim() || saving} onClick={() => void publish()}>{saving ? "Posting…" : "Post to Board Feed"}</button></div></div>
    </section>

    {error && <div className="records-status error launch-error">{error}</div>}

    <div className="feed-toolbar"><div><span className="section-kicker">Board Feed</span><h2>Persistent shared history</h2></div><input aria-label="Search Board Feed" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search posts and comments…" /></div>

    {loading ? <div className="calm-empty compact-empty"><span>○</span><h3>Loading Board Feed…</h3></div> : filtered.length ? <div className="feed-list">{filtered.map((post) => <FeedPost key={post.id} post={post} people={people} currentUserId={currentUserId} personName={personName} expanded={expanded.has(post.id)} onToggle={() => setExpanded((items) => { const next = new Set(items); next.has(post.id) ? next.delete(post.id) : next.add(post.id); return next; })} onRefresh={refresh} onPin={() => void pin(post)} />)}</div> : <div className="calm-empty compact-empty"><span>○</span><h3>{search ? "Nothing matches that search" : "No Board Feed posts yet"}</h3><p>{search ? "Try a different word or name." : "Use the feed when something should remain visible to the whole board."}</p></div>}
  </>;
}

function FeedPost({ post, people, currentUserId, personName, expanded, onToggle, onRefresh, onPin }: {
  post: BoardFeedPost;
  people: WorkspacePerson[];
  currentUserId: string;
  personName: (id: string) => string;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => Promise<void>;
  onPin: () => void;
}) {
  return <article className={`feed-post${post.pinned ? " pinned" : ""}`} id={`feed-post-${post.id}`}>
    <div className="feed-post-head"><div className="feed-author"><span className="mini-avatar">{personName(post.authorId).charAt(0)}</span><div><strong>{personName(post.authorId)}</strong><time>{formatTimestamp(post.createdAt)}</time></div></div>{post.pinned && <span className="feed-pin-badge">Pinned</span>}</div>
    <LinkifiedText text={post.body} />
    {post.mentionedIds.length > 0 && <div className="feed-mentioned">Mentioned: {post.mentionedIds.map(personName).join(", ")}</div>}
    <div className="actions compact-actions feed-post-actions"><button className="quiet small" type="button" onClick={onToggle}>{post.comments.length} {post.comments.length === 1 ? "comment" : "comments"}</button><WorkAttachmentsButton parentType="board_post" parentId={post.id} parentTitle="Board Feed post" personName={personName} /><button className="quiet small" type="button" onClick={onPin}>{post.pinned ? "Unpin" : "Pin"}</button></div>
    {expanded && <FeedComments post={post} people={people} currentUserId={currentUserId} personName={personName} onRefresh={onRefresh} />}
  </article>;
}

function FeedComments({ post, people, currentUserId, personName, onRefresh }: {
  post: BoardFeedPost;
  people: WorkspacePerson[];
  currentUserId: string;
  personName: (id: string) => string;
  onRefresh: () => Promise<void>;
}) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    if (!body.trim() || saving) return;
    setSaving(true); setError("");
    try {
      await addBoardPostComment(post.id, body, mentions);
      setBody(""); setMentions([]);
      await onRefresh();
      window.dispatchEvent(new Event("focus"));
    } catch (err) { setError(readError(err)); }
    finally { setSaving(false); }
  }

  return <div className="feed-comments">
    {post.comments.length > 0 && <div className="feed-comment-list">{post.comments.map((comment) => <article className="feed-comment" key={comment.id}><div><strong>{personName(comment.authorId)}</strong><time>{formatTimestamp(comment.createdAt)}</time></div><LinkifiedText text={comment.body} />{comment.mentionedIds.length > 0 && <small>Mentioned: {comment.mentionedIds.map(personName).join(", ")}</small>}</article>)}</div>}
    <div className="feed-comment-compose"><textarea rows={2} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Add a short comment…"/><MentionPicker people={people} currentUserId={currentUserId} selected={mentions} setSelected={setMentions} compact />{error && <div className="auth-message error">{error}</div>}<button className="primary small" type="button" disabled={!body.trim() || saving} onClick={() => void add()}>{saving ? "Adding…" : "Add comment"}</button></div>
  </div>;
}

function MentionPicker({ people, currentUserId, selected, setSelected, compact = false }: { people: WorkspacePerson[]; currentUserId: string; selected: string[]; setSelected: (ids: string[]) => void; compact?: boolean }) {
  const available = people.filter((person) => person.id !== currentUserId);
  return <details className={`feed-mention-picker${compact ? " compact" : ""}`}><summary>@ Mention people</summary><div className="people-picker">{available.map((person) => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, person.id])] : selected.filter((id) => id !== person.id))}/>{person.name}</label>)}</div></details>;
}

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <p>{parts.map((part, index) => /^https?:\/\//.test(part) ? <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a> : <span key={index}>{part}</span>)}</p>;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The Board Feed could not be updated.";
}
