"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Project, Tension, Action } from "@/lib/domain";
import { ProjectSettingsModal } from "@/components/project-settings-modal";
import { WorkAttachmentsButton } from "@/components/work-attachments";
import { ProjectCoiBadge } from "@/components/project-coi-badge";
import { TensionAvailabilityPoll } from "@/components/tension-availability-poll";
import { ContextualNextSteps } from "@/components/contextual-next-steps";
import { createAction, createProject, createTensionAndReturnId, completeProject, updateProject, touchProject, loadProjectUpdates, createTensionPoll, voteTensionPoll, chooseTensionPollOption, updateTension, type ProjectUpdateEntry, type WorkspaceData } from "@/lib/supabase/workspace";
import { saveProjectSettings, reopenProject } from "@/lib/supabase/project-management";
import { updateTensionTitle } from "@/lib/supabase/tension-title-edit";
import { setTensionProject } from "@/lib/supabase/tension-project";
import { setTensionUrgency } from "@/lib/supabase/tension-urgency";
import { updateTensionNeedNote } from "@/lib/supabase/tension-need-edit";
import { declineProposedAction, removeAction, updateActionDetails } from "@/lib/supabase/action-management";
import { DeclineDecision } from "@/components/decline-decision";
import { loadCommentThreadSummary, type CommentThreadSummary } from "@/lib/supabase/comment-thread-state";
import { SpatialConversation } from "./spatial-conversation";
import { SpatialPulsePause } from "./spatial-pulse-pause";
import styles from "./spatial.module.css";

export type SpatialRun = (action: () => Promise<void>, message?: string) => Promise<boolean>;

export function SpatialDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); previous?.focus(); };
  }, [onClose]);
  return createPortal(<div className={styles.dialogBackdrop} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><section className={`${styles.dialog} ${styles.adapted}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button onClick={onClose} aria-label={`Close ${title}`}>Close</button></header>{children}</section></div>, document.body);
}

export function Capture({ kind, projectId, userId, run, onCreated, onClose }: { kind: "project" | "tension"; projectId?: string; userId: string; run: SpatialRun; onCreated?: (id: string) => void; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return <SpatialDialog title={kind === "project" ? "Add a project" : "Bring something up"} onClose={onClose}><form className={styles.simpleForm} onSubmit={async e => {
    e.preventDefault(); if (!text.trim() || busy) return; setBusy(true);
    let createdId: string | undefined;
    const ok = await run(async () => {
      if (kind === "project") createdId = await createProject({ title: text, ownerId: userId });
      else createdId = await createTensionAndReturnId({ title: text, raiserId: userId, projectId });
    }, kind === "project" ? "Project added to the landscape." : "Captured. Decide what would help when you open it.");
    setBusy(false); if (ok) { onClose(); if (createdId) onCreated?.(createdId); }
  }}><label>{kind === "project" ? "Project title" : "What needs dealing with?"}<textarea autoFocus rows={kind === "project" ? 2 : 4} value={text} placeholder={kind === "tension" ? "What do you see that needs attention? You can decide what’s needed next." : undefined} onChange={e => setText(e.target.value)} /></label>{kind === "project" && <small>You start as owner. People and settings can be completed inside the project.</small>}<button type="submit" disabled={busy || !text.trim()}>{busy ? "Saving…" : kind === "project" ? "Create project" : "Capture"}</button></form></SpatialDialog>;
}

export function ProjectTools({ project, workspace, userId, run, needsUpdate = false }: { project: Project; workspace: WorkspaceData; userId: string; run: SpatialRun; needsUpdate?: boolean }) {
  const [panel, setPanel] = useState<"update" | "history" | "settings" | null>(null);
  const [draft, setDraft] = useState(project.summary);
  const [busy, setBusy] = useState(false);
  const name = (id: string) => workspace.people.find(p => p.id === id)?.name ?? "Unknown";
  return <div className={`${styles.projectTools} ${styles.adapted}`}>
    {project.ownerId === userId && project.status === "active" && <button data-personal={needsUpdate && panel !== "update" || undefined} onClick={() => { setDraft(project.summary); setPanel("update"); }}>Update current state</button>}
    <details><summary>Project tools</summary><div className={styles.toolLinks}>
      <button onClick={() => setPanel("history")}>History</button><WorkAttachmentsButton parentType="project" parentId={project.id} parentTitle={project.title} personName={name} />
      <button onClick={() => setPanel("settings")}>People, settings & COI</button>
      {project.status === "complete" && <button onClick={() => void run(() => reopenProject(project.id), "Project reopened.")}>Reopen project</button>}
    </div></details><ProjectCoiBadge projectId={project.id} personName={name} />
    {panel === "settings" && <ProjectSettingsModal project={project} people={workspace.people} openNextStepCount={workspace.actions.filter(a => a.projectId === project.id && (a.status === "open" || a.status === "proposed")).length} onSave={(id, input) => run(() => saveProjectSettings(id, input), "Project settings saved.")} onComplete={async id => { await run(() => completeProject(id), "Project completed."); }} onClose={() => setPanel(null)} />}
    {panel === "history" && <SpatialDialog title="Project history" onClose={() => setPanel(null)}><ProjectHistory projectId={project.id} personName={name} /></SpatialDialog>}
    {panel === "update" && <SpatialDialog title="Current state" onClose={() => setPanel(null)}><form className={styles.simpleForm} onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); const ok = await run(() => updateProject(project.id, draft), "Project updated."); setBusy(false); if (ok) setPanel(null); }}>
      <label>What is true now?<textarea autoFocus rows={7} value={draft} onChange={e => setDraft(e.target.value)} /></label><div className={styles.toolLinks}><button type="button" disabled={busy} onClick={async () => { setBusy(true); const ok = await run(() => touchProject(project.id), "Project checked. No change recorded."); setBusy(false); if (ok) setPanel(null); }}>No change</button><button disabled={busy}>Save update</button></div>
    </form></SpatialDialog>}
  </div>;
}

function ProjectHistory({ projectId, personName }: { projectId: string; personName: (id: string) => string }) {
  const [entries, setEntries] = useState<ProjectUpdateEntry[]>([]);
  const [state, setState] = useState("Loading history…");
  useEffect(() => { let alive = true; void loadProjectUpdates(projectId).then(items => { if (alive) { setEntries(items); setState(items.length ? "" : "No history recorded."); } }).catch(e => { if (alive) setState(String(e.message ?? e)); }); return () => { alive = false; }; }, [projectId]);
  return <div className={styles.history}>{state && <p>{state}</p>}{entries.map(entry => <article key={entry.id}><small>{entry.updateKind.replace("_", " ")} · {entry.authorId ? personName(entry.authorId) : "System"} · {new Date(entry.createdAt).toLocaleString()}</small><p>{entry.summary}</p></article>)}</div>;
}

export function TensionTools({ tension, workspace, userId, urgent, run, onGovernance, hasDurable }: { tension: Tension; workspace: WorkspaceData; userId: string; urgent: boolean; run: SpatialRun; onGovernance: () => void; hasDurable: boolean }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(tension.title);
  const [projectId, setProjectId] = useState(tension.linkedProjectId ?? "");
  const [busy, setBusy] = useState(false);
  const [needEdit, setNeedEdit] = useState(false);
  const [needDetail, setNeedDetail] = useState("");
  const [governancePrep, setGovernancePrep] = useState(false);
  const mine = tension.raiserId === userId;
  const name = (id: string) => workspace.people.find(p => p.id === id)?.name ?? "Unknown";
  return <div className={`${styles.adapted} ${styles.objectTools}`}><details><summary>Object tools</summary><div className={styles.toolLinks}>
    {mine && tension.status !== "resolved" && tension.status !== "governance" && <button onClick={() => { setTitle(tension.title); setEditing(true); }}>Edit original text</button>}
    {mine && !hasDurable && (tension.status === "open" || tension.status === "needs_sync") && /^(Needs input or help from |Needs a real conversation with )/.test(tension.latestNote ?? "") && <button onClick={() => { const note = tension.latestNote ?? ""; setNeedDetail(note.includes(" — ") ? note.slice(note.indexOf(" — ") + 3) : ""); setNeedEdit(true); }}>Edit recorded need</button>}
    {mine && <button disabled={busy} onClick={async () => { setBusy(true); await run(() => setTensionUrgency(tension.id, !urgent)); setBusy(false); }}>{urgent ? "Remove urgent flag" : "Mark urgent"}</button>}
    <WorkAttachmentsButton parentType="tension" parentId={tension.id} parentTitle={tension.title} personName={name} />
    {mine && (tension.status === "open" || tension.status === "needs_sync") && <button disabled={busy} onClick={() => setGovernancePrep(true)}>Prepare for Governance</button>}
    {tension.status === "governance" && <button onClick={onGovernance}>Continue Governance preparation</button>}
    <form className={styles.simpleForm} onSubmit={async e => { e.preventDefault(); setBusy(true); await run(() => setTensionProject(tension.id, projectId || null), "Project link saved."); setBusy(false); }}><label>Project<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">No project</option>{workspace.projects.filter(p => p.status === "active" || p.id === tension.linkedProjectId).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label><button disabled={busy || projectId === (tension.linkedProjectId ?? "")}>Save project link</button></form>
  </div></details>{editing && <SpatialDialog title="Edit original text" onClose={() => setEditing(false)}><form className={styles.simpleForm} onSubmit={async e => { e.preventDefault(); setBusy(true); const ok = await run(() => updateTensionTitle(tension.id, userId, title)); setBusy(false); if (ok) setEditing(false); }}><textarea autoFocus aria-label="Original text" rows={6} value={title} onChange={e => setTitle(e.target.value)} /><button disabled={busy || !title.trim()}>Save</button></form></SpatialDialog>}
    {needEdit && <SpatialDialog title="Edit recorded need" onClose={() => setNeedEdit(false)}><form className={styles.simpleForm} onSubmit={async e => { e.preventDefault(); setBusy(true); const base = (tension.latestNote ?? "").split(" — ")[0].replace(/\.$/, ""); const ok = await run(() => updateTensionNeedNote(tension.id, needDetail.trim() ? `${base} — ${needDetail.trim()}` : `${base}.`)); setBusy(false); if (ok) setNeedEdit(false); }}><label>What do you need?<textarea autoFocus rows={4} value={needDetail} onChange={e => setNeedDetail(e.target.value)} /></label><button disabled={busy}>Save</button></form></SpatialDialog>}
    {governancePrep && <SpatialDialog title="Prepare for Governance" onClose={() => setGovernancePrep(false)}><div className={styles.simpleForm}><p><strong>About to record</strong></p><p>This tension will be identified as structural and placed in Governance preparation. Its original text and current note will be preserved. A proposal must still be prepared before a Governance Meeting can process it.</p><div className={styles.toolLinks}><button type="button" disabled={busy} onClick={() => setGovernancePrep(false)}>Cancel</button><button type="button" disabled={busy} onClick={async () => { setBusy(true); const ok = await run(() => updateTension(tension.id, { status: "governance", resolutionProposedBy: null }), "Marked for Governance preparation."); setBusy(false); if (ok) { setGovernancePrep(false); onGovernance(); } }}>Record and open preparation</button></div></div></SpatialDialog>}
  </div>;
}

export function SpatialPoll({ tension, userId, workspace, run }: { tension: Tension; userId: string; workspace: WorkspaceData; run: SpatialRun }) {
  return <div className={styles.adapted}><TensionAvailabilityPoll tension={tension} currentUserId={userId} personName={id => workspace.people.find(p => p.id === id)?.name ?? "Unknown"} onCreate={(id, times) => run(() => createTensionPoll(id, times))} onVote={(id, options) => run(() => voteTensionPoll(id, options))} onChoose={(id, option) => run(() => chooseTensionPollOption(id, option))} /></div>;
}

export function SpatialNextSteps({ parent, kind, workspace, userId, run, onOpen, attentionActionId, attentionActionIds = [] }: { parent: Project | Tension; kind: "project" | "tension"; workspace: WorkspaceData; userId: string; run: SpatialRun; onOpen?: (action: Action) => void; attentionActionId?: string; attentionActionIds?: string[] }) {
  const relevant = workspace.actions.filter(a => kind === "project" ? a.projectId === parent.id : a.sourceTensionId === parent.id);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!attentionActionId) return;
    const row = root.current?.querySelector<HTMLElement>(`[data-action-id="${attentionActionId}"]`);
    if (!row) return;
    row.tabIndex = -1;
    row.dataset.attentionTarget = "true";
    row.scrollIntoView({ block: "center" });
    row.focus({ preventScroll: true });
    return () => { delete row.dataset.attentionTarget; row.removeAttribute("tabindex"); };
  }, [attentionActionId]);
  return <div ref={root} className={styles.adapted} data-spatial-commitments={parent.id}>
    <style>{`@keyframes spatialActionAttentionPulse { 0%, 100% { background: #2596be05; box-shadow: inset 3px 0 0 #2596be58, 0 0 2px 0 #2596be08; } 50% { background: #2596be30; box-shadow: inset 3px 0 0 #1689b1, 0 0 28px 5px #2596be4a; } }\n${relevant.filter(a => attentionActionIds.includes(a.id)).map(a => `[data-spatial-commitments="${parent.id}"] [data-action-id="${a.id}"] { border-left-color: #2596be; animation: spatialActionAttentionPulse 1.6s ease-in-out infinite; }`).join("\n")}`}</style>
    <ContextualNextSteps parentType={kind} parentId={parent.id} parentTitle={parent.title} projectId={kind === "tension" ? (parent as Tension).linkedProjectId : parent.id} actions={workspace.actions} people={workspace.people} roles={workspace.roles} currentUserId={userId} personName={id => workspace.people.find(p => p.id === id)?.name ?? "Unknown"}
    onAdd={input => run(() => createAction({ ...input, status: input.ownerId === userId ? "open" : "proposed" }))} onStatus={async (id, status) => { const { setActionStatus } = await import("@/lib/supabase/workspace"); return run(() => setActionStatus(id, status)); }} />
    <div className={styles.commitmentContext}>{relevant.filter(a => a.status === "open" || a.status === "proposed").map(a => <div key={a.id} data-personal={a.ownerId === userId || undefined}>{a.due && a.due < localToday() && <small>Overdue · {a.title}</small>}{a.sourceTensionId && kind === "project" && <button onClick={() => onOpen?.(a)}>From tension · {workspace.tensions.find(t => t.id === a.sourceTensionId)?.title ?? "Open source"}</button>}</div>)}</div>
    {relevant.some(a => a.status === "done") && <details><summary>Completed commitments</summary>{relevant.filter(a => a.status === "done").map(a => <p key={a.id}>{a.title} · {workspace.people.find(p => p.id === a.ownerId)?.name ?? "Unknown"} · completed</p>)}</details>}
  </div>;
}

export function SpatialCommitmentFocus({ action, people, roles, currentUserId, sourceTension, position, run, signalIds = [], targetCommentId, needsAttention = false, conversationNeedsAttention = false, unreadCount = 0, hasPulse = false, pulseUntil, onPulsePause, onOpenSource, onClose }: {
  action: Action; people: WorkspaceData["people"]; roles: WorkspaceData["roles"]; currentUserId: string; sourceTension?: Tension;
  position: { x: number; y: number; side: "left" | "right" }; run: SpatialRun; signalIds?: string[]; targetCommentId?: string; needsAttention?: boolean; conversationNeedsAttention?: boolean; unreadCount?: number; hasPulse?: boolean; pulseUntil?: number; onPulsePause?: (hours: 0 | 24 | 48 | 72 | 168) => void; onOpenSource?: () => void; onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [title, setTitle] = useState(action.title);
  const [ownerId, setOwnerId] = useState(action.ownerId);
  const [due, setDue] = useState(action.due ?? "");
  const [busy, setBusy] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(Boolean(targetCommentId));
  const [threadSummary, setThreadSummary] = useState<CommentThreadSummary | null>(null);
  const name = (id: string) => people.find(person => person.id === id)?.name ?? "Unknown";

  useEffect(() => {
    let alive = true;
    const refreshSummary = () => void loadCommentThreadSummary("action", action.id)
      .then(summary => { if (alive) setThreadSummary(summary); })
      .catch(() => { if (alive) setThreadSummary(null); });
    const onThreadEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ threadType?: string; threadId?: string }>).detail;
      if (detail?.threadType === "action" && detail.threadId === action.id) refreshSummary();
    };
    refreshSummary();
    window.addEventListener("comment-thread-seen", onThreadEvent);
    window.addEventListener("comment-thread-changed", onThreadEvent);
    return () => { alive = false; window.removeEventListener("comment-thread-seen", onThreadEvent); window.removeEventListener("comment-thread-changed", onThreadEvent); };
  }, [action.id]);

  async function changeStatus(status: "open" | "done") {
    setBusy(true);
    const { setActionStatus } = await import("@/lib/supabase/workspace");
    await run(() => setActionStatus(action.id, status), status === "open" ? "Commitment accepted." : "Commitment completed.");
    setBusy(false);
  }
  async function save() {
    if (!title.trim() || !ownerId || busy) return;
    setBusy(true);
    const ok = await run(() => updateActionDetails(action.id, { title, ownerId, due: due || undefined, currentUserId, currentOwnerId: action.ownerId, currentStatus: action.status }), "Commitment updated.");
    setBusy(false);
    if (ok) setEditing(false);
  }
  async function remove() {
    if (busy || !window.confirm("Remove this next step from active work?")) return;
    setBusy(true);
    await run(() => removeAction(action.id), "Commitment removed from active work.");
    setBusy(false);
  }

  return <aside className={styles.commitmentFocus} data-side={position.side} data-proposed={action.status === "proposed" || undefined}
    style={{ left: position.x, top: position.y }} aria-label={`Focused commitment: ${action.title}`}>
    <div className={styles.commitmentFocusScroll}>
    <header><span>{action.status === "proposed" ? "Proposed commitment" : action.status === "done" ? "Completed commitment" : "Commitment"}</span><button onClick={onClose} aria-label="Close commitment details">×</button></header>
    {!editing ? <>
      <h2>{action.title}</h2>
      <dl><div><dt>{action.status === "proposed" ? "Proposed to" : "Owner"}</dt><dd>{name(action.ownerId)}</dd></div><div><dt>Due</dt><dd>{action.due ? formatCommitmentDate(action.due) : "No deadline"}</dd></div></dl>
      {hasPulse && onPulsePause && <SpatialPulsePause until={pulseUntil} onPause={onPulsePause} />}
      {sourceTension && <div className={styles.commitmentSource}><span>From tension ↗</span><button onClick={onOpenSource} aria-label={`Open tension: ${sourceTension.title}`}>{sourceTension.title}</button></div>}
      <button className={styles.commitmentConversation} data-personal={!conversationOpen && conversationNeedsAttention || undefined} data-unread={unreadCount > 0 || undefined} aria-expanded={conversationOpen}
        onClick={() => setConversationOpen(open => !open)}>Comments{unreadCount > 0 && <span className={styles.activityBadge}>{unreadCount > 9 ? "9+" : unreadCount}</span>}{threadSummary ? ` · ${threadSummary.totalCount}` : ""}</button>
      {conversationOpen && <SpatialConversation kind="action" id={action.id} people={people} userId={currentUserId} signalIds={signalIds} targetCommentId={targetCommentId} compact />}
      <div className={styles.commitmentActions}><button disabled={busy} onClick={() => { setTitle(action.title); setOwnerId(action.ownerId); setDue(action.due ?? ""); setEditing(true); }}>Edit</button>
        {action.ownerId === currentUserId && action.status === "proposed" && <button data-personal={needsAttention || undefined} disabled={busy} onClick={() => void changeStatus("open")}>Accept</button>}
        {action.ownerId === currentUserId && action.status === "proposed" && <button disabled={busy} onClick={() => setDeclining(true)}>Decline</button>}
        {action.ownerId === currentUserId && action.status === "open" && <button data-personal={needsAttention || undefined} disabled={busy} onClick={() => void changeStatus("done")}>Done</button>}</div>
      {declining && <DeclineDecision roles={roles} busy={busy} onCancel={() => setDeclining(false)} onDecline={async (reason, explanation, suggestedRoleId) => {
        setBusy(true);
        const ok = await run(() => declineProposedAction(action.id, reason, explanation, suggestedRoleId), "Decline recorded for the proposer.");
        setBusy(false);
        if (ok) { setDeclining(false); onClose(); }
      }} />}
    </> : <form onSubmit={event => { event.preventDefault(); void save(); }}>
      <label>Commitment<input autoFocus value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Owner<select value={ownerId} onChange={event => setOwnerId(event.target.value)}>{people.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <label>Due date<input type="date" value={due} onChange={event => setDue(event.target.value)} /></label>
      <div className={styles.commitmentActions}><button type="button" disabled={busy} onClick={() => void remove()}>Remove</button><button type="button" disabled={busy} onClick={() => setEditing(false)}>Cancel</button><button disabled={busy || !title.trim() || !ownerId}>{busy ? "Saving…" : "Save"}</button></div>
    </form>}
    </div>
  </aside>;
}

function localToday() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function formatCommitmentDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
