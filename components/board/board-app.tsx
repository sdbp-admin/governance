"use client";

import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { addBoardPostComment, createBoardPost, editBoardPost, editBoardPostComment, loadBoardFeed, setBoardPostPinned, type BoardFeedPost, type BoardFeedComment } from "@/lib/supabase/board-feed";
import { boardPushEnabled, disableBoardPush, enableBoardPush, loadBoardCounts, markBoardChatSeen, registerBoardWorker, showBoardBadge } from "@/lib/supabase/board-app";
import { BoardAttention } from "./board-attention";
import styles from "./board.module.css";

type Person = { id: string; name: string; active: boolean };
type Message = (BoardFeedPost | BoardFeedComment) & { parent: BoardFeedPost; reply: boolean };
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "Could not connect. Please try again.";

export function BoardApp() {
  const [member, setMember] = useState<Person | null>(null);
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      if (session.error) throw session.error;
      setHasSession(!!session.data.session);
      if (!session.data.session) { setMember(null); return; }
      const user = await supabase.auth.getUser();
      if (user.error) throw user.error;
      const result = await supabase.from("people").select("id,name,active").eq("auth_user_id", user.data.user.id).eq("active", true).maybeSingle();
      if (result.error) throw result.error;
      setMember(result.data);
      setError(result.data ? "" : "This account is not linked to an active SDBP member.");
    } catch (reason) { setMember(null); setError(errorText(reason)); }
    finally { setChecking(false); }
  }, []);

  useEffect(() => {
    void resolve();
    const { data } = supabase.auth.onAuthStateChange(() => { window.setTimeout(() => void resolve(), 0); });
    return () => data.subscription.unsubscribe();
  }, [resolve]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword("");
      await resolve();
    } catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await disableBoardPush(); } catch (reason) { setError(`Could not disconnect this device: ${errorText(reason)}`); return; }
    const result = await supabase.auth.signOut({ scope: "local" });
    if (result.error) setError(result.error.message);
    else { setMember(null); setHasSession(false); setError(""); }
  }

  if (member) return <BoardChat key={member.id} member={member} onSignOut={signOut} authError={error} />;
  return <main className={styles.gate}>
    <form className={styles.login} onSubmit={signIn}>
      <span className={styles.brand}>SDBP</span><h1>Board conversation</h1>
      {checking ? <p role="status">Opening your board…</p> : <>
        <p>Your existing SDBP account. The same board conversation.</p>
        {!hasSession && <><label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></label>
          <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button className={styles.primary} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {hasSession && <><button type="button" onClick={() => void resolve()}>Try again</button><button type="button" onClick={() => void signOut()}>Sign out</button></>}
      </>}
    </form>
  </main>;
}

function BoardChat({ member, onSignOut, authError }: { member: Person; onSignOut: () => Promise<void>; authError: string }) {
  const [tab, setTab] = useState<"chat" | "attention">(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tab") === "attention" ? "attention" : "chat");
  const [chatCount, setChatCount] = useState(0);
  const [chatEngaged, setChatEngaged] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("post"));
  const [attentionCount, setAttentionCount] = useState(0);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState("");
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [posts, setPosts] = useState<BoardFeedPost[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<BoardFeedPost | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [mentions, setMentions] = useState<Person[]>([]);
  const [allSelected, setAllSelected] = useState(false);
  const [caret, setCaret] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);
  const inFlight = useRef(false);
  const initialLoad = useRef(true);
  const lastMarkedAt = useRef("");

  const refreshCounts = useCallback(async () => {
    const counts = await loadBoardCounts();
    setChatCount(counts.chat);
    setAttentionCount(counts.forMe);
  }, []);

  useEffect(() => {
    void registerBoardWorker().catch(reason => setPushError(errorText(reason)));
    void boardPushEnabled().then(setPushEnabled).catch(reason => setPushError(errorText(reason)));
    void refreshCounts().catch(reason => setError(errorText(reason)));
    const timer = window.setInterval(() => { if (!document.hidden) void refreshCounts().catch(reason => setError(errorText(reason))); }, 15000);
    const onPush = (event: MessageEvent) => { if (event.data?.type === "BOARD_REFRESH") void refreshCounts().catch(reason => setError(errorText(reason))); };
    navigator.serviceWorker?.addEventListener("message", onPush);
    return () => { window.clearInterval(timer); navigator.serviceWorker?.removeEventListener("message", onPush); };
  }, [refreshCounts]);

  useEffect(() => { showBoardBadge(chatCount + attentionCount); }, [chatCount, attentionCount]);

  const refresh = useCallback(async () => {
    const [feed, members] = await Promise.all([loadBoardFeed(), supabase.from("people").select("id,name,active").order("name")]);
    if (members.error) throw members.error;
    setPosts(feed); setPeople(members.data ?? []); setError("");
  }, []);

  useEffect(() => {
    let alive = true;
    async function update() {
      try { if (alive) await refresh(); }
      catch (reason) { if (alive) setError(errorText(reason)); }
      finally { if (alive) setLoading(false); }
    }
    void update();
    const timer = window.setInterval(() => { if (!document.hidden) void update(); }, 15000);
    window.addEventListener("focus", update);
    return () => { alive = false; window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, [refresh]);

  useLayoutEffect(() => {
    if (loading || tab !== "chat" || !scroller.current) return;
    const target = initialLoad.current ? new URLSearchParams(window.location.search).get("post") : null;
    initialLoad.current = false;
    if (target && document.getElementById(`board-${target}`)) {
      document.getElementById(`board-${target}`)?.scrollIntoView({ block: "center" });
      followBottom.current = false;
    } else if (followBottom.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [posts, loading, tab]);

  useEffect(() => {
    if (loading || tab !== "chat" || !chatEngaged) return;
    const newest = posts.flatMap(post => [post.createdAt, ...post.comments.map(comment => comment.createdAt)]).sort().at(-1);
    if (!newest || newest <= lastMarkedAt.current) return;
    lastMarkedAt.current = newest;
    void markBoardChatSeen(newest).then(refreshCounts).catch(reason => { lastMarkedAt.current = ""; setError(errorText(reason)); });
  }, [posts, loading, tab, chatEngaged, refreshCounts]);

  useEffect(() => {
    if (tab !== "chat" || !openPostId || loading) return;
    const timer = window.setTimeout(() => { jump(openPostId); setOpenPostId(null); }, 50);
    return () => window.clearTimeout(timer);
  }, [tab, openPostId, loading, posts]);

  const messages = useMemo<Message[]>(() => posts.flatMap(post => [
    { ...post, parent: post, reply: false },
    ...post.comments.map(comment => ({ ...comment, parent: post, reply: true })),
  ]).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || Number(a.reply) - Number(b.reply) || a.id.localeCompare(b.id)), [posts]);
  const names = new Map(people.map(person => [person.id, person.name]));
  const personName = (id: string) => names.get(id) ?? (id === member.id ? member.name : "Former member");
  const mentionQuery = !editing ? body.slice(0, caret).match(/(?:^|\s)@([^@\n]*)$/) : null;
  const suggestions = mentionQuery ? people.filter(person => person.active && person.id !== member.id && person.name.toLowerCase().startsWith(mentionQuery[1].toLowerCase())).slice(0, 6) : [];
  const suggestAll = !!mentionQuery && "all".startsWith(mentionQuery[1].toLowerCase());
  const mentionAll = allSelected && /(?:^|\s)@all(?=$|\s|[.,!?;:])/.test(body);
  const pins = posts.filter(post => post.pinned);

  function chooseMention(person: Person | "all") {
    if (!mentionQuery) return;
    const start = caret - mentionQuery[1].length - 1;
    const text = person === "all" ? "@all " : `@${person.name} `;
    setBody(body.slice(0, start) + text + body.slice(caret));
    if (person === "all") setAllSelected(true);
    else setMentions(items => [...items.filter(item => item.id !== person.id), person]);
    const nextCaret = start + text.length;
    setCaret(nextCaret);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(nextCaret, nextCaret); });
  }

  function jump(id: string) {
    setPinsOpen(false);
    followBottom.current = false;
    document.getElementById(`board-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    document.getElementById(`board-${id}`)?.focus({ preventScroll: true });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || inFlight.current) return;
    setChatEngaged(true);
    inFlight.current = true; setSaving(true); setError("");
    try {
      if (editing) {
        if (editing.reply) await editBoardPostComment(editing.id, body);
        else await editBoardPost(editing.id, body);
      } else {
        const ids = mentions.filter(person => body.includes(`@${person.name}`)).map(person => person.id);
        if (replyTo) await addBoardPostComment(replyTo.id, body, ids, mentionAll);
        else await createBoardPost(body, ids, mentionAll);
      }
      // Clear only after the existing write succeeds; a refresh failure must not invite a duplicate send.
      setBody(""); setMentions([]); setAllSelected(false); setReplyTo(null); setEditing(null); setCaret(0);
      followBottom.current = true;
      try { await refresh(); } catch { setError("Saved. Could not refresh the conversation; use Refresh to retry."); }
    } catch (reason) { setError(errorText(reason)); }
    finally { inFlight.current = false; setSaving(false); }
  }

  async function pin(post: BoardFeedPost) {
    if (pinning) return;
    setPinning(true);
    try { await setBoardPostPinned(post.id, !post.pinned); await refresh(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setPinning(false); }
  }

  async function changePush() {
    if (pushBusy) return;
    setPushBusy(true); setPushError("");
    try {
      if (pushEnabled) await disableBoardPush(); else await enableBoardPush();
      setPushEnabled(!pushEnabled);
      await refreshCounts();
    } catch (reason) { setPushError(errorText(reason)); }
    finally { setPushBusy(false); }
  }

  function beginEdit(message: Message) {
    if (body.trim() && !window.confirm("Replace the current draft with this message to edit?")) return;
    setEditing(message); setReplyTo(null); setMentions([]); setAllSelected(false); setBody(message.body); input.current?.focus();
  }

  return <main className={styles.shell}>
    <header className={styles.header}><div><span className={styles.brand}>SDBP Board</span><p>{tab === "chat" ? "General conversation" : "What currently needs you"}</p></div>
      <details className={styles.account}><summary aria-label="Account settings">{member.name.slice(0, 1)}</summary><div className={styles.accountMenu}><strong>{member.name}</strong><button type="button" disabled={pushBusy} onClick={() => void changePush()}>{pushBusy ? "Please wait…" : pushEnabled ? "Turn off phone notifications" : "Turn on phone notifications"}</button>{pushError && <span role="alert" className={styles.pushError}>{pushError}</span>}<button type="button" onClick={() => void onSignOut()}>Sign out</button></div></details>
    </header>
    <nav className={styles.tabs} aria-label="Board sections"><button type="button" aria-current={tab === "chat" ? "page" : undefined} onClick={() => { followBottom.current = true; setTab("chat"); setChatEngaged(true); }}>Chat{chatCount > 0 && <span>{chatCount}</span>}</button><button type="button" aria-current={tab === "attention" ? "page" : undefined} onClick={() => setTab("attention")}>For me{attentionCount > 0 && <span>{attentionCount}</span>}</button></nav>
    {tab === "chat" && <>
    <nav className={styles.toolbar} aria-label="Conversation tools">
      <button type="button" aria-expanded={pinsOpen} onClick={() => setPinsOpen(!pinsOpen)}>Pinned · {pins.length}</button>
      <button type="button" onClick={() => void refresh().catch(reason => setError(errorText(reason)))}>Refresh</button>
    </nav>
    {pinsOpen && <section className={styles.pins} aria-label="Pinned messages">{pins.length ? pins.map(post => <button type="button" key={post.id} onClick={() => jump(post.id)}><strong>{personName(post.authorId)}</strong><span>{post.body}</span></button>) : <p>No pinned messages.</p>}</section>}
    {(error || authError) && <p className={styles.error} role="alert">{error || authError}</p>}
    <div className={styles.messages} ref={scroller} aria-label="Board conversation" aria-busy={loading} onScroll={() => {
      const node = scroller.current;
      if (node) followBottom.current = node.scrollHeight - node.scrollTop - node.clientHeight < 90;
    }} onPointerDown={() => setChatEngaged(true)} onTouchMove={() => setChatEngaged(true)} onWheel={() => setChatEngaged(true)}>
      {loading ? <p role="status" className={styles.empty}>Loading board conversation…</p> : !messages.length && <p className={styles.empty}>Start the board conversation.</p>}
      {messages.map((message, index) => {
        const day = new Date(message.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
        const previousDay = index ? new Date(messages[index - 1].createdAt).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : null;
        const mine = message.authorId === member.id;
        return <div key={message.id}>
          {day !== previousDay && <div className={styles.day}>{day}</div>}
          <article tabIndex={-1} id={`board-${message.id}`} className={`${styles.message} ${mine ? styles.mine : ""}`}>
            <strong className={styles.sender}>{mine ? "You" : personName(message.authorId)}</strong>
            {message.reply && <button type="button" className={styles.quote} onClick={() => jump(message.parent.id)}><span>Reply to {personName(message.parent.authorId)}</span><span>{message.parent.body}</span></button>}
            <div className={styles.body}>{message.body.split(/(https?:\/\/[^\s]+)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : part)}</div>
            {!!message.mentionedIds.length && <div className={styles.mentions}>Mentioned: {message.mentionedIds.map(personName).join(", ")}</div>}
            <div className={styles.messageFoot}>
              <div className={styles.meta}><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</time>{message.editedAt && <span title={new Date(message.editedAt).toLocaleString()}>Edited</span>}{!message.reply && message.parent.pinned && <span>Pinned</span>}</div>
              <details className={styles.actions}><summary aria-label="Message actions">⋯</summary><div>
                <button type="button" disabled={saving || !!editing} onClick={() => { setReplyTo(message.parent); input.current?.focus(); }}>Reply</button>
                {mine && <button type="button" disabled={saving} onClick={() => beginEdit(message)}>Edit</button>}
                {!message.reply && <button type="button" disabled={pinning} onClick={() => void pin(message.parent)}>{message.parent.pinned ? "Unpin" : "Pin"}</button>}
              </div></details>
            </div>
          </article>
        </div>;
      })}
    </div>
    <form className={styles.composer} onSubmit={send}>
      {(replyTo || editing) && <div className={styles.context}><span>{editing ? "Editing your message · mentions stay unchanged" : `Reply to ${personName(replyTo!.authorId)}: ${replyTo!.body}`}</span><button type="button" disabled={saving} onClick={() => { if (editing) setBody(""); setEditing(null); setReplyTo(null); }}>Cancel</button></div>}
      {(suggestAll || !!suggestions.length) && <div className={styles.suggestions} aria-label="Mention a person">{suggestAll && <button type="button" onClick={() => chooseMention("all")}>@all · All active members except you</button>}{suggestions.map(person => <button type="button" key={person.id} onClick={() => chooseMention(person)}>@{person.name}</button>)}</div>}
      {!editing && (mentionAll || !!mentions.filter(person => body.includes(`@${person.name}`)).length) && <div className={styles.mentions}>Mentioning {mentionAll ? "all active members except you" : mentions.filter(person => body.includes(`@${person.name}`)).map(person => person.name).join(", ")}</div>}
      <div className={styles.composeRow}><textarea ref={input} aria-label={editing ? "Edit message" : "Message the board"} rows={2} placeholder="Message the board… @ to mention" value={body} disabled={saving} onChange={e => { setBody(e.target.value); setCaret(e.target.selectionStart); }} onSelect={e => setCaret(e.currentTarget.selectionStart)} /><button className={styles.primary} type="submit" disabled={!body.trim() || saving || loading}>{saving ? "Saving…" : editing ? "Save" : "Send"}</button></div>
    </form>
    </>}
    <div className={styles.attentionPane} hidden={tab !== "attention"}><BoardAttention userId={member.id} active={tab === "attention"} onCount={setAttentionCount} onOpenChat={postId => { setOpenPostId(postId); setTab("chat"); }} /></div>
  </main>;
}
