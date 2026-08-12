"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Action, AttentionItem, GovernanceProposal, GovernanceStage, Project, RoleDefinition, Tension } from "@/lib/domain";
import { RecordsView } from "@/components/records-view";
import { CompassModal, HelpTip } from "@/components/guidance";
import {
  acceptGovernanceProposal,
  canInvitePeople,
  completeProject,
  createAction,
  createGovernanceProposal,
  createProject,
  createTension,
  deleteRole,
  invitePerson,
  loadWorkspace,
  saveGovernanceProposal,
  saveRole,
  setActionStatus,
  todayISO,
  touchProject,
  updateProject,
  updateTension,
  type WorkspaceData,
  type WorkspacePerson,
} from "@/lib/supabase/workspace";

type View = "attention" | "work" | "tensions" | "organisation" | "governance" | "records" | "pulse";
type LiveProfile = { id: string; name: string; email: string };

type NoticeFn = (message: string) => void;

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [] };

const LABELS: Record<View, string> = {
  attention: "My Attention",
  work: "Work",
  tensions: "Tensions",
  organisation: "Organisation",
  governance: "Governance",
  records: "Records",
  pulse: "SDBP Pulse",
};

const NAV_META: Record<View, string> = {
  attention: "What needs you",
  work: "Projects & actions",
  tensions: "What could be better",
  organisation: "People, roles & groups",
  governance: "Change how we work",
  records: "Organisational memory",
  pulse: "Where things are stuck",
};

export function LaunchApp({ liveProfile }: { liveProfile?: LiveProfile }) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [view, setView] = useState<View>("attention");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteAllowed, setInviteAllowed] = useState(false);
  const [projectEditorId, setProjectEditorId] = useState<string | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [compassOpen, setCompassOpen] = useState(false);

  const currentUserId = liveProfile?.id ?? "";

  const refresh = useCallback(async (quiet = false) => {
    if (!liveProfile) return;
    if (!quiet) setLoading(true);
    try {
      const [next, canInvite] = await Promise.all([loadWorkspace(), canInvitePeople()]);
      setWorkspace(next);
      setInviteAllowed(canInvite);
      setError("");
    } catch (refreshError) {
      setError(readError(refreshError));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [liveProfile]);

  useEffect(() => {
    const meeting = new URLSearchParams(window.location.search).get("meeting");
    if (meeting) {
      setActiveMeetingId(meeting);
      setView("governance");
    }
    void refresh();

    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const peopleById = useMemo(() => new Map(workspace.people.map((person) => [person.id, person])), [workspace.people]);
  const personName = (id: string) => peopleById.get(id)?.name ?? "Unknown";
  const personInitial = (id: string) => personName(id).charAt(0).toUpperCase();
  const announce: NoticeFn = (message) => setNotice(message);

  const attention = useMemo(() => deriveAttention(workspace, currentUserId, personName), [workspace, currentUserId]);
  const activeMeeting = activeMeetingId ? workspace.governanceProposals.find((proposal) => proposal.id === activeMeetingId) : undefined;

  async function run(action: () => Promise<void>, success?: string) {
    try {
      setError("");
      await action();
      await refresh(true);
      if (success) announce(success);
      return true;
    } catch (actionError) {
      setError(readError(actionError));
      return false;
    }
  }

  async function handleAttention(item: AttentionItem) {
    if (item.kind === "project_update" && item.targetId) {
      setProjectEditorId(item.targetId);
      setView("work");
      return;
    }
    if (item.kind === "action" && item.targetId) {
      const action = workspace.actions.find((candidate) => candidate.id === item.targetId);
      if (!action) return;
      const next = action.status === "proposed" ? "open" : "done";
      await run(() => setActionStatus(action.id, next), next === "open" ? "Action accepted." : "Action completed.");
      return;
    }
    if (item.kind === "tension") {
      setView("tensions");
      return;
    }
    if (item.kind === "governance") setView("governance");
  }

  async function addOwnAction(title: string) {
    return run(() => createAction({ title, ownerId: currentUserId, status: "open" }), "Action added.");
  }

  async function addProject(input: { title: string; ownerId: string; participantIds: string[]; summary: string; sourceTensionId?: string }) {
    return run(() => createProject(input), "Project added.");
  }

  async function saveProjectUpdate(projectId: string, summary: string) {
    const ok = await run(() => updateProject(projectId, summary), "Project updated.");
    if (ok) setProjectEditorId(null);
  }

  async function noProjectChange(projectId: string) {
    const ok = await run(() => touchProject(projectId), "Project checked. No change recorded.");
    if (ok) setProjectEditorId(null);
  }

  async function markProjectComplete(projectId: string) {
    await run(() => completeProject(projectId), "Project outcome achieved.");
  }

  async function raiseTension(title: string, projectId?: string) {
    return run(() => createTension({ title, raiserId: currentUserId, projectId }), "Tension raised.");
  }

  async function markTensionResolved(tension: Tension) {
    if (tension.raiserId === currentUserId) {
      await run(() => updateTension(tension.id, { status: "resolved", resolutionProposedBy: null, latestNote: `${personName(currentUserId)} confirmed the tension is resolved.` }), "Tension resolved.");
      return;
    }
    await run(() => updateTension(tension.id, { status: "awaiting_confirmation", resolutionProposedBy: currentUserId, latestNote: `${personName(currentUserId)} believes this is resolved. Waiting for ${personName(tension.raiserId)} to confirm.` }), "Marked resolved; waiting for the raiser to confirm.");
  }

  async function keepTensionOpen(tension: Tension) {
    await run(() => updateTension(tension.id, { status: "open", resolutionProposedBy: null, latestNote: `${personName(currentUserId)} confirmed the tension still exists.` }), "Tension kept open.");
  }

  async function tensionAction(tension: Tension, title: string, ownerId: string) {
    const status: Action["status"] = ownerId === currentUserId ? "open" : "proposed";
    const ok = await run(async () => {
      await createAction({ title, ownerId, status, source: tension.title, sourceTensionId: tension.id });
      await updateTension(tension.id, { latestNote: `Related action created: “${title}”. The tension remains open until the real situation is resolved.` });
    }, ownerId === currentUserId ? "Action created." : `Action proposed to ${personName(ownerId)}.`);
    return ok;
  }

  async function tensionProject(tension: Tension, title: string) {
    const ok = await run(async () => {
      await createProject({ title, ownerId: currentUserId, participantIds: [currentUserId], sourceTensionId: tension.id, summary: "" });
      await updateTension(tension.id, { latestNote: `Related project created: “${title}”. The tension remains open until the real situation is resolved.` });
    }, "Project created.");
    return ok;
  }

  async function moveTension(tension: Tension, status: "governance" | "needs_sync") {
    const note = status === "governance"
      ? "This tension needs a change to an ongoing role, responsibility, authority or standing way of working."
      : "This tension needs a real-time conversation.";
    const ok = await run(() => updateTension(tension.id, { status, resolutionProposedBy: null, latestNote: note }), status === "governance" ? "Moved to Governance." : "Marked for a real-time conversation.");
    if (ok && status === "governance") setView("governance");
  }

  async function resolveWithNote(tension: Tension, note: string) {
    await run(() => updateTension(tension.id, { status: "resolved", resolutionProposedBy: null, latestNote: note }), "Tension resolved.");
  }

  async function addProposal(tensionId: string, title: string, proposal: string) {
    return run(() => createGovernanceProposal({ tensionId, title, proposal, proposerId: currentUserId }), "Proposal prepared.");
  }

  async function startMeeting(proposal: GovernanceProposal) {
    const next = { ...proposal, stage: "present_proposal" as GovernanceStage };
    const ok = await run(() => saveGovernanceProposal(next));
    if (ok) setActiveMeetingId(proposal.id);
  }

  async function updateMeeting(proposal: GovernanceProposal) {
    await run(() => saveGovernanceProposal(proposal));
  }

  async function acceptProposal(proposal: GovernanceProposal) {
    const ok = await run(() => acceptGovernanceProposal(proposal), "Proposal accepted and recorded.");
    if (ok) setActiveMeetingId(null);
  }

  if (!liveProfile) return null;

  if (loading) {
    return <main className="launch-loading"><span className="auth-spinner" aria-hidden="true" /><h1>Opening SDBP</h1><p>Loading the shared workspace.</p></main>;
  }

  if (activeMeetingId) {
    if (!activeMeeting) return <main className="main"><div className="calm-empty"><span>○</span><h2>Meeting item not found</h2><button className="secondary" onClick={() => setActiveMeetingId(null)}>Back to Governance</button></div></main>;
    return <main className="main governance-meeting-popout launch-meeting">
      <GovernanceMeeting proposal={activeMeeting} tension={workspace.tensions.find((item) => item.id === activeMeeting.tensionId)} personName={personName} onChange={updateMeeting} onAccept={acceptProposal} onClose={() => setActiveMeetingId(null)} />
      {error && <div className="records-status error launch-error">{error}</div>}
      {notice && <Toast message={notice} />}
    </main>;
  }

  const projectEditor = projectEditorId ? workspace.projects.find((project) => project.id === projectEditorId) : undefined;

  return <div className="shell launch-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /><span /></div><div className="brand">SDBP Governance<small>Structure · rhythm · memory</small></div></div>
      <nav className="nav">{(Object.keys(LABELS) as View[]).map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><strong>{LABELS[key]}</strong><small>{NAV_META[key]}</small></button>)}</nav>
      <div className="sidebar-foot launch-sidebar-foot"><div className="avatar">{liveProfile.name.charAt(0)}</div><div><strong>{liveProfile.name}</strong><small>Signed in</small></div><button className="sidebar-compass" type="button" onClick={() => setCompassOpen(true)}>Compass</button></div>
    </aside>

    <main className="main">
      <PageHeader view={view} attentionCount={attention.length} currentName={liveProfile.name} />
      {error && <div className="records-status error launch-error">{error}</div>}

      {view === "attention" && <AttentionView items={attention} onPrimary={handleAttention} onRaiseTension={() => setView("tensions")} />}
      {view === "work" && <WorkView workspace={workspace} currentUserId={currentUserId} personName={personName} personInitial={personInitial} onAddAction={addOwnAction} onAddProject={addProject} onCompleteAction={(id) => run(() => setActionStatus(id, "done"), "Action completed.")} onCompleteProject={markProjectComplete} onUpdateProject={setProjectEditorId} />}
      {view === "tensions" && <TensionsView workspace={workspace} currentUserId={currentUserId} personName={personName} onRaise={raiseTension} onMarkResolved={markTensionResolved} onKeepOpen={keepTensionOpen} onAction={tensionAction} onProject={tensionProject} onMove={moveTension} onResolve={resolveWithNote} />}
      {view === "organisation" && <OrganisationView workspace={workspace} currentUserId={currentUserId} canInvite={inviteAllowed} personName={personName} onInvite={async (name, email) => { const ok = await run(() => invitePerson(name, email), `Invitation sent to ${email}.`); return ok; }} onSaveRole={async (role) => run(() => saveRole(role), "Role saved.")} onDeleteRole={async (id) => run(() => deleteRole(id), "Role removed.")} onOpenProject={() => setView("work")} />}
      {view === "governance" && <GovernanceView workspace={workspace} currentUserId={currentUserId} personName={personName} onCreateProposal={addProposal} onStartMeeting={startMeeting} onGoTensions={() => setView("tensions")} />}
      {view === "records" && <RecordsView governanceProposals={workspace.governanceProposals} tensions={workspace.tensions} profileId={liveProfile.id} onNotice={announce} />}
      {view === "pulse" && <PulseView workspace={workspace} />}
    </main>

    {notice && <Toast message={notice} />}
    {compassOpen && <CompassModal onClose={() => setCompassOpen(false)} />}
    {projectEditor && <ProjectUpdateModal project={projectEditor} onSave={saveProjectUpdate} onNoChange={noProjectChange} onClose={() => setProjectEditorId(null)} />}
  </div>;
}

function PageHeader({ view, attentionCount, currentName }: { view: View; attentionCount: number; currentName: string }) {
  const description: Record<View, React.ReactNode> = {
    attention: attentionCount === 0 ? `Nothing needs ${currentName}'s attention right now.` : `${attentionCount} ${attentionCount === 1 ? "thing needs" : "things need"} ${currentName}'s attention. Start with the one that creates the most movement.`,
    work: "Keep commitments visible and project updates short. The current reality matters more than reporting activity.",
    tensions: "A tension is a gap between current reality and a potential future you sense. Raise one whenever something could be better.",
    organisation: "Board roles and operating roles are both roles. Board-role authority comes from the statutes and applicable law; operating-role authority comes from SDBP governance.",
    governance: "Change ongoing roles, responsibilities, authority or standing ways of working here — not ordinary project work.",
    records: "The legal and organisational memory you can return to when context matters.",
    pulse: "A quiet overview of where SDBP may be losing momentum or clarity.",
  };
  return <header className="page-head"><div><div className="eyebrow">SDBP · working space</div><h1>{LABELS[view]}</h1><p>{description[view]}</p></div><div className="brand-signal" aria-hidden="true"><span /><span /><span /></div></header>;
}

function deriveAttention(workspace: WorkspaceData, userId: string, personName: (id: string) => string): AttentionItem[] {
  const today = todayISO();
  const items: AttentionItem[] = [];

  for (const project of workspace.projects) {
    if (project.status !== "active" || project.ownerId !== userId || project.nextPrompt > today) continue;
    items.push({ id: `project-${project.id}`, ownerId: userId, kind: "project_update", targetId: project.id, title: project.title, reason: `Project update is due. Last checked ${formatDate(project.lastUpdate)}.`, primaryAction: "Update project", status: "needs_action" });
  }

  for (const action of workspace.actions) {
    if (action.ownerId !== userId || (action.status !== "proposed" && action.status !== "open")) continue;
    items.push({ id: `action-${action.id}`, ownerId: userId, kind: "action", targetId: action.id, title: action.title, reason: action.status === "proposed" ? `${action.source ? `From ${action.source}. ` : ""}Accept it if this is your commitment.` : `${action.source ? `From ${action.source}. ` : ""}This is an open commitment.`, primaryAction: action.status === "proposed" ? "Accept action" : "Mark done", status: "needs_action", due: action.due });
  }

  for (const tension of workspace.tensions) {
    if (tension.raiserId !== userId) continue;
    if (tension.status === "awaiting_confirmation") items.push({ id: `tension-${tension.id}`, ownerId: userId, kind: "tension", targetId: tension.id, title: tension.title, reason: `${personName(tension.resolutionProposedBy ?? "")} believes this is resolved. Check the real situation.`, primaryAction: "Review tension", status: "needs_action" });
    if (tension.status === "open") items.push({ id: `tension-${tension.id}`, ownerId: userId, kind: "tension", targetId: tension.id, title: tension.title, reason: "You raised this tension and it is still open.", primaryAction: "Process tension", status: "needs_action" });
    if (tension.status === "governance" && !workspace.governanceProposals.some((proposal) => proposal.tensionId === tension.id)) items.push({ id: `governance-${tension.id}`, ownerId: userId, kind: "governance", targetId: tension.id, title: tension.title, reason: "This structural tension needs a proposal before it can be processed in Governance.", primaryAction: "Prepare proposal", status: "needs_action" });
  }

  return items.sort((a, b) => attentionWeight(a) - attentionWeight(b));
}

function attentionWeight(item: AttentionItem) {
  if (item.kind === "action" && item.due && item.due < todayISO()) return 0;
  if (item.kind === "governance") return 1;
  if (item.kind === "tension") return 2;
  if (item.kind === "action") return 3;
  return 4;
}

function AttentionView({ items, onPrimary, onRaiseTension }: { items: AttentionItem[]; onPrimary: (item: AttentionItem) => void; onRaiseTension: () => void }) {
  const featured = items[0];
  if (!featured) return <div className="calm-empty"><span>✓</span><h2>Clear for now</h2><p>Nothing is waiting for you.</p><button className="text-action" onClick={onRaiseTension}>+ Raise a tension</button></div>;
  return <>
    <div className="attention-layout"><article className="focus-card"><div className="focus-top"><span className="kind">Most important now · {humanKind(featured.kind)}</span></div><div className="focus-body"><div><h2>{featured.title}</h2><p>{featured.reason}</p></div><div className="focus-orb" aria-hidden="true"><span>→</span></div></div><div className="actions"><button className="primary" onClick={() => onPrimary(featured)}>{featured.primaryAction}</button><button className="quiet" onClick={onRaiseTension}>Raise a tension</button></div></article><aside className="week-card"><div><span className="kind">Open now</span><div className="week-number">{items.length}</div><p>interactions</p></div><div className="week-divider" /><small>Do the thing that releases the most movement first.</small></aside></div>
    {items.length > 1 && <section className="section"><div className="section-head"><div><span className="section-kicker">Next</span><h2>Then move these forward</h2></div></div><div className="attention-grid">{items.slice(1).map((item) => <article className="attention-card" key={item.id}><div className={`type-dot type-${item.kind}`} /><div className="attention-copy"><span className="kind">{humanKind(item.kind)}</span><h3>{item.title}</h3><p>{item.reason}</p></div><div className="actions compact-actions"><button className="primary small" onClick={() => onPrimary(item)}>{item.primaryAction}</button></div></article>)}</div></section>}
  </>;
}

function WorkView({ workspace, currentUserId, personName, personInitial, onAddAction, onAddProject, onCompleteAction, onCompleteProject, onUpdateProject }: {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  personInitial: (id: string) => string;
  onAddAction: (title: string) => Promise<boolean>;
  onAddProject: (input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<boolean>;
  onCompleteAction: (id: string) => Promise<unknown>;
  onCompleteProject: (id: string) => Promise<void>;
  onUpdateProject: (id: string) => void;
}) {
  const [actionText, setActionText] = useState("");
  const [actionOpen, setActionOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const activeProjects = workspace.projects.filter((project) => project.status === "active");
  const openActions = workspace.actions.filter((action) => action.status === "open" || action.status === "proposed");

  return <>
    <div className="work-toolbar"><button className="primary small" onClick={() => setProjectOpen(true)}>+ Add project</button><button className="secondary small" onClick={() => setActionOpen((value) => !value)}>+ Add my action</button></div>
    {actionOpen && <form className="inline-create" onSubmit={async (event) => { event.preventDefault(); const title = actionText.trim(); if (!title) return; if (await onAddAction(title)) { setActionText(""); setActionOpen(false); } }}><input autoFocus value={actionText} onChange={(event) => setActionText(event.target.value)} placeholder="Concrete next step" /><button className="primary small" disabled={!actionText.trim()}>Save</button></form>}
    <div className="work-layout"><section className="work-main"><div className="section-head"><div><span className="section-kicker">Current outcomes</span><h2>Active projects</h2></div></div>{activeProjects.length ? <div className="project-grid">{activeProjects.map((project) => <article className="project-card" key={project.id}><div className="project-accent" /><span className="kind">{project.role ?? "SDBP project"}</span><h3>{project.title}</h3>{project.summary && <p>{project.summary}</p>}<div className="project-team-row">{(project.participantIds ?? [project.ownerId]).map((id) => <span className="mini-avatar" title={personName(id)} key={id}>{personInitial(id)}</span>)}</div><div className="project-meta"><span><strong>{personName(project.ownerId)}</strong><small>owner</small></span><span><strong>{formatDate(project.lastUpdate)}</strong><small>last checked</small></span><span><strong>{formatDate(project.nextPrompt)}</strong><small>next prompt</small></span></div>{project.ownerId === currentUserId && <div className="actions compact-actions"><button className="secondary small" onClick={() => onUpdateProject(project.id)}>Update</button><button className="quiet small" onClick={() => void onCompleteProject(project.id)}>Outcome achieved</button></div>}</article>)}</div> : <div className="calm-empty compact-empty"><span>○</span><h3>No active projects yet</h3><p>Add them when they become real work.</p></div>}</section>
    <aside className="action-rail"><div className="section-head"><div><span className="section-kicker">Concrete next steps</span><h2>Actions</h2></div></div><div className="action-stack">{openActions.length ? openActions.map((action) => <article className="action-slip" key={action.id}><span className="action-status">{action.status}</span><h3>{action.title}</h3>{action.source && <p>{action.source}</p>}<div className="action-owner"><span className="mini-avatar">{personInitial(action.ownerId)}</span>{personName(action.ownerId)}</div>{action.due && <small>Due {formatDate(action.due)}</small>}{action.status === "open" && action.ownerId === currentUserId && <button className="secondary small action-done" onClick={() => void onCompleteAction(action.id)}>Mark done</button>}</article>) : <div className="calm-empty compact-empty"><span>✓</span><h3>No open actions</h3></div>}</div></aside></div>
    {projectOpen && <ProjectCreateModal people={workspace.people} currentUserId={currentUserId} onClose={() => setProjectOpen(false)} onSave={async (input) => { const ok = await onAddProject(input); if (ok) setProjectOpen(false); }} />}
  </>;
}

function ProjectCreateModal({ people, currentUserId, onClose, onSave }: { people: WorkspacePerson[]; currentUserId: string; onClose: () => void; onSave: (input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [participants, setParticipants] = useState<string[]>([currentUserId]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor compact-modal" role="dialog" aria-modal="true"><div className="editor-head"><div><span className="section-kicker">New project</span><h2>What outcome are we working toward?</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><label className="field"><span>Project</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => { const id = event.target.value; setOwnerId(id); setParticipants((items) => items.includes(id) ? items : [...items, id]); }}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><div className="field"><span>People involved</span><div className="people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={(event) => setParticipants((items) => event.target.checked ? [...new Set([...items, person.id])] : person.id === ownerId ? items : items.filter((id) => id !== person.id))} />{person.name}</label>)}</div></div><label className="field"><span>Current state <em>optional</em></span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label><div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!title.trim()} onClick={() => void onSave({ title, ownerId, participantIds: [...new Set([ownerId, ...participants])], summary })}>Save project</button></div></div></section></div>;
}

function ProjectUpdateModal({ project, onSave, onNoChange, onClose }: { project: Project; onSave: (id: string, summary: string) => Promise<void>; onNoChange: (id: string) => Promise<void>; onClose: () => void }) {
  const [summary, setSummary] = useState(project.summary);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Project update</span><h2>{project.title}</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">Has anything meaningfully changed? Keep this short. The app needs current reality, not a report.</p><label className="field"><span>Current state</span><textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} /></label><div className="workflow-choice-row"><button className="secondary" onClick={() => void onNoChange(project.id)}>No change</button><button className="primary" onClick={() => void onSave(project.id, summary)}>Save update</button></div></section></div>;
}

function TensionsView({ workspace, currentUserId, personName, onRaise, onMarkResolved, onKeepOpen, onAction, onProject, onMove, onResolve }: {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  onRaise: (title: string, projectId?: string) => Promise<boolean>;
  onMarkResolved: (tension: Tension) => Promise<void>;
  onKeepOpen: (tension: Tension) => Promise<void>;
  onAction: (tension: Tension, title: string, ownerId: string) => Promise<boolean>;
  onProject: (tension: Tension, title: string) => Promise<boolean>;
  onMove: (tension: Tension, status: "governance" | "needs_sync") => Promise<void>;
  onResolve: (tension: Tension, note: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const active = workspace.tensions.filter((tension) => tension.status !== "resolved");
  return <>
    <div className="tension-composer"><div className="composer-copy"><span className="section-kicker">Raise a tension</span><h2>What could be better?</h2><p>You do not need to know the solution yet.</p></div><div className="composer-input"><textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Something is unclear, blocked or could work better…" /><button className="primary" disabled={!draft.trim()} onClick={async () => { if (await onRaise(draft)) setDraft(""); }}>Raise tension</button></div></div>
    <section className="section"><div className="section-head"><div><span className="section-kicker">Open</span><h2>Tensions that still exist</h2></div><span className="counter">{active.length}</span></div>{active.length ? <div className="tension-stream">{active.map((tension) => <article className="tension-card" key={tension.id}><div className="tension-line" /><div className="tension-content"><div className="tension-meta"><span>Raised by {personName(tension.raiserId)}</span><span>{tensionLabel(tension.status)}</span></div><h3>{tension.title}</h3>{tension.latestNote && <p>{tension.latestNote}</p>}{tension.status === "awaiting_confirmation" && tension.raiserId === currentUserId && <div className="tension-process-panel"><span className="kind">Resolution check</span><h4>{personName(tension.resolutionProposedBy ?? "")} believes this is resolved. Is it resolved for you?</h4><div className="process-actions"><button className="secondary" onClick={() => void onKeepOpen(tension)}>No, keep open</button><button className="primary" onClick={() => void onResolve(tension, `${personName(currentUserId)} confirmed the tension is resolved.`)}>Yes, resolved</button></div></div>}{processingId === tension.id && tension.raiserId === currentUserId && tension.status === "open" && <TensionProcess tension={tension} people={workspace.people} currentUserId={currentUserId} onClose={() => setProcessingId(null)} onAction={onAction} onProject={onProject} onMove={onMove} onResolve={onResolve} />}</div>{processingId !== tension.id && tension.status === "open" && <div className="actions compact-actions">{tension.raiserId === currentUserId && <button className="secondary" onClick={() => setProcessingId(tension.id)}>What do you need? →</button>}<button className="quiet" onClick={() => void onMarkResolved(tension)}>Resolve</button></div>}</article>)}</div> : <div className="calm-empty compact-empty"><span>✓</span><h3>No open tensions</h3></div>}</section>
  </>;
}

function TensionProcess({ tension, people, currentUserId, onClose, onAction, onProject, onMove, onResolve }: { tension: Tension; people: WorkspacePerson[]; currentUserId: string; onClose: () => void; onAction: (tension: Tension, title: string, ownerId: string) => Promise<boolean>; onProject: (tension: Tension, title: string) => Promise<boolean>; onMove: (tension: Tension, status: "governance" | "needs_sync") => Promise<void>; onResolve: (tension: Tension, note: string) => Promise<void> }) {
  const [choice, setChoice] = useState<"action" | "project" | "governance" | "sync" | "resolved" | null>(null);
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  return <div className="tension-process-panel"><span className="kind">Process tension</span><h4>What do you need from the organisation?</h4><div className="outcome-grid compact-outcomes">{[
    ["action", "Action"], ["project", "Project"], ["governance", "Change how we work"], ["sync", "Real-time conversation"], ["resolved", "Nothing further"],
  ].map(([id, label]) => <button key={id} className={choice === id ? "outcome-option selected" : "outcome-option"} onClick={() => setChoice(id as typeof choice)}><strong>{label}</strong></button>)}</div>
    {choice === "action" && <div className="outcome-form outcome-form-grid"><label className="field"><span>Action</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button className="primary small" disabled={!title.trim()} onClick={async () => { if (await onAction(tension, title, ownerId)) onClose(); }}>Create action</button></div>}
    {choice === "project" && <div className="outcome-form"><label className="field"><span>Project outcome</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><button className="primary small" disabled={!title.trim()} onClick={async () => { if (await onProject(tension, title)) onClose(); }}>Create project</button></div>}
    {choice === "governance" && <div className="outcome-form"><p>Use this when an ongoing role, responsibility, authority or standing way of working needs to change.</p><button className="primary small" onClick={() => void onMove(tension, "governance")}>Move to Governance</button></div>}
    {choice === "sync" && <div className="outcome-form"><p>Some tensions need people in the same conversation. The app keeps the tension visible.</p><button className="primary small" onClick={() => void onMove(tension, "needs_sync")}>Needs conversation</button></div>}
    {choice === "resolved" && <div className="outcome-form"><button className="primary small" onClick={() => void onResolve(tension, "No further action is needed. The tension is resolved.")}>Resolve tension</button></div>}
    <div className="process-actions"><button className="quiet" onClick={onClose}>Close</button></div>
  </div>;
}

function OrganisationView({ workspace, currentUserId, canInvite, personName, onInvite, onSaveRole, onDeleteRole, onOpenProject }: {
  workspace: WorkspaceData;
  currentUserId: string;
  canInvite: boolean;
  personName: (id: string) => string;
  onInvite: (name: string, email: string) => Promise<boolean>;
  onSaveRole: (role: RoleDefinition) => Promise<boolean>;
  onDeleteRole: (id: string) => Promise<boolean>;
  onOpenProject: (id: string) => void;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const activeProjects = workspace.projects.filter((project) => project.status === "active");

  return <>
    <div className="org-launch-top"><div><span className="section-kicker">People and structure</span><h2>Who is here, and how are we working together?</h2></div><div className="org-actions">{canInvite && <button className="primary small" onClick={() => setInviteOpen(true)}>+ Invite person</button>}<button className="secondary small" onClick={() => setEditingRole(blankRole(currentUserId))}>+ Add role</button></div></div>

    <section className="org-constellation" aria-label="SDBP and active project groups"><div className="sdbp-core-bubble"><strong>SDBP</strong><small>{workspace.people.length} people</small></div>{activeProjects.map((project) => <button className="project-bubble" key={project.id} onClick={() => onOpenProject(project.id)}><strong>{project.title}</strong><span className="bubble-people">{(project.participantIds ?? [project.ownerId]).slice(0, 5).map((id) => <span key={id} title={personName(id)}>{personName(id).charAt(0)}</span>)}</span></button>)}</section>

    <section className="section"><div className="section-head"><div><span className="section-kicker">People</span><h2>SDBP workspace</h2></div></div><div className="people-strip">{workspace.people.map((person) => { const roles = workspace.roles.filter((role) => role.holderIds.includes(person.id)); return <article className="people-compact" key={person.id}><div className="person-avatar">{person.name.charAt(0)}</div><div><h3>{person.name}</h3><small>{person.linked ? "active account" : "invited"}</small><div className="role-list compact-role-list">{roles.map((role) => <button className={`role-chip role-chip-${role.category}`} key={role.id} onClick={() => setEditingRole(role)}>{role.title}</button>)}</div></div></article>; })}</div></section>

    {workspace.roles.filter((role) => role.holderIds.length === 0).length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Unfilled</span><h2>Roles without a holder <HelpTip label="Why show unfilled roles?">An unfilled role makes a missing responsibility visible instead of letting it disappear into the background.</HelpTip></h2></div></div><div className="unfilled-role-list">{workspace.roles.filter((role) => role.holderIds.length === 0).map((role) => <button className={`role-chip role-chip-${role.category}`} key={role.id} onClick={() => setEditingRole(role)}>{role.title}</button>)}</div></section>}

    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvite={async (name, email) => { if (await onInvite(name, email)) setInviteOpen(false); }} />}
    {editingRole && <RoleModal role={editingRole} people={workspace.people} existing={workspace.roles.some((role) => role.id === editingRole.id)} onClose={() => setEditingRole(null)} onSave={async (role) => { if (await onSaveRole(role)) setEditingRole(null); }} onDelete={async (id) => { if (await onDeleteRole(id)) setEditingRole(null); }} />}
  </>;
}

function InviteModal({ onClose, onInvite }: { onClose: () => void; onInvite: (name: string, email: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Invite</span><h2>Add someone to SDBP</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">Add the person now. Roles and positions can be added later.</p><label className="field"><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={sending || !name.trim() || !email.trim()} onClick={async () => { setSending(true); await onInvite(name, email); setSending(false); }}>{sending ? "Sending…" : "Send invitation"}</button></div></div></section></div>;
}

function blankRole(holderId: string): RoleDefinition {
  return { id: crypto.randomUUID(), title: "", category: "operating", holderIds: holderId ? [holderId] : [], purpose: "", scope: "", responsibilities: [], accountabilities: [], source: "SDBP governance", status: "draft" };
}

function RoleModal({ role, people, existing, onClose, onSave, onDelete }: { role: RoleDefinition; people: WorkspacePerson[]; existing: boolean; onClose: () => void; onSave: (role: RoleDefinition) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [draft, setDraft] = useState(role);
  const [details, setDetails] = useState(Boolean(role.purpose || role.scope || role.responsibilities.length || role.accountabilities.length));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="role-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Role</span><h2>{existing ? `Edit ${role.title}` : "Add role"}</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><div className="editor-grid"><label className="field field-wide"><span>Role title</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label className="field"><span>Type</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as RoleDefinition["category"], source: event.target.value === "board" ? "SDBP Statutes / applicable law" : "SDBP governance" })}><option value="board">Board role</option><option value="operating">Operating role</option></select></label><label className="field"><span>Holder</span><select value={draft.holderIds[0] ?? ""} onChange={(event) => setDraft({ ...draft, holderIds: event.target.value ? [event.target.value] : [] })}><option value="">Unfilled</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label></div><button className="quiet role-details-toggle" onClick={() => setDetails((value) => !value)}>{details ? "Hide details" : "Add details (optional)"}</button>{details && <div className="editor-grid role-extra"><label className="field field-wide"><span>Purpose</span><textarea rows={2} value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} /></label><label className="field field-wide"><span>Scope</span><textarea rows={2} value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })} /></label><label className="field"><span>Responsibilities</span><textarea rows={4} value={draft.responsibilities.join("\n")} onChange={(event) => setDraft({ ...draft, responsibilities: splitLines(event.target.value) })} /></label><label className="field"><span>Accountabilities</span><textarea rows={4} value={draft.accountabilities.join("\n")} onChange={(event) => setDraft({ ...draft, accountabilities: splitLines(event.target.value) })} /></label></div>}<div className="editor-actions">{existing ? <button className="danger" onClick={() => { if (window.confirm(`Remove “${role.title}”?`)) void onDelete(role.id); }}>Remove role</button> : <div />}<div className="editor-actions-right"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!draft.title.trim()} onClick={() => void onSave({ ...draft, title: draft.title.trim(), status: draft.purpose || draft.scope || draft.responsibilities.length || draft.accountabilities.length ? "defined" : "draft" })}>Save role</button></div></div></section></div>;
}

function GovernanceView({ workspace, currentUserId, personName, onCreateProposal, onStartMeeting, onGoTensions }: { workspace: WorkspaceData; currentUserId: string; personName: (id: string) => string; onCreateProposal: (tensionId: string, title: string, proposal: string) => Promise<boolean>; onStartMeeting: (proposal: GovernanceProposal) => Promise<void>; onGoTensions: () => void }) {
  const used = new Set(workspace.governanceProposals.map((proposal) => proposal.tensionId));
  const ready = workspace.tensions.filter((tension) => tension.status === "governance" && !used.has(tension.id));
  const open = workspace.governanceProposals.filter((proposal) => proposal.stage !== "accepted");
  const accepted = workspace.governanceProposals.filter((proposal) => proposal.stage === "accepted");
  return <>
    <div className="governance-lean-intro"><strong>One person facilitates the process; the group does the thinking.</strong><HelpTip label="What belongs in Governance?">Use Governance for changes that remain true after today: roles, responsibilities, authority or standing ways of working. Ordinary actions and projects belong in Work.</HelpTip></div>
    {ready.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Needs a proposal</span><h2>Structural tensions</h2></div></div><div className="governance-ready-list">{ready.map((tension) => <ProposalStarter key={tension.id} tension={tension} mine={tension.raiserId === currentUserId} personName={personName} onCreate={onCreateProposal} />)}</div></section>}
    {open.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Prepared</span><h2>Ready to process</h2></div></div><div className="governance-proposal-stack">{open.map((proposal) => <article className="governance-proposal-card" key={proposal.id}><div className="governance-proposal-head"><div><span className="kind">Proposed by {personName(proposal.proposerId)}</span><h3>{proposal.title}</h3></div><span className="governance-stage-badge">{stageName(proposal.stage)}</span></div><div className="governance-proposal-text"><strong>Proposal</strong><p>{proposal.proposal}</p></div><div className="process-actions"><button className="primary" onClick={() => void onStartMeeting(proposal)}>{proposal.stage === "prepared" ? "Start governance meeting" : "Continue meeting"}</button></div></article>)}</div></section>}
    {!ready.length && !open.length && !accepted.length && <div className="calm-empty compact-empty"><span>○</span><h3>No governance item is waiting</h3><p>If something structural needs to change, raise the tension first.</p><button className="secondary small" onClick={onGoTensions}>Go to Tensions</button></div>}
    {accepted.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Decided</span><h2>Accepted governance</h2></div></div><div className="soft-list">{accepted.map((proposal) => <div className="soft-row" key={proposal.id}><div><strong>{proposal.title}</strong><small>{proposal.proposal}</small></div><span className="definition-status defined">accepted</span></div>)}</div></section>}
  </>;
}

function ProposalStarter({ tension, mine, personName, onCreate }: { tension: Tension; mine: boolean; personName: (id: string) => string; onCreate: (tensionId: string, title: string, proposal: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  return <article className="governance-starter"><span className="kind">Raised by {personName(tension.raiserId)}</span><h3>{tension.title}</h3>{!mine ? <small>The person who raised this tension can prepare the proposal.</small> : !open ? <button className="primary small" onClick={() => setOpen(true)}>Prepare proposal</button> : <div className="governance-inline-form"><label className="field"><span>Proposal title</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>What should change?</span><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label><div className="process-actions"><button className="quiet" onClick={() => setOpen(false)}>Cancel</button><button className="primary small" disabled={!title.trim() || !text.trim()} onClick={async () => { if (await onCreate(tension.id, title, text)) setOpen(false); }}>Save proposal</button></div></div>}</article>;
}

function GovernanceMeeting({ proposal, tension, personName, onChange, onAccept, onClose }: { proposal: GovernanceProposal; tension?: Tension; personName: (id: string) => string; onChange: (proposal: GovernanceProposal) => Promise<void>; onAccept: (proposal: GovernanceProposal) => Promise<void>; onClose: () => void }) {
  const [note, setNote] = useState(proposal.meetingNotes[proposal.stage] ?? "");
  const [proposalText, setProposalText] = useState(proposal.proposal);
  useEffect(() => { setNote(proposal.meetingNotes[proposal.stage] ?? ""); setProposalText(proposal.proposal); }, [proposal]);
  const steps: GovernanceStage[] = ["present_proposal", "clarifying_questions", "reaction_round", "clarify", "objection_round", "integration"];
  const index = steps.indexOf(proposal.stage);

  async function move(stage: GovernanceStage, text = proposalText) {
    const next: GovernanceProposal = { ...proposal, proposal: text.trim() || proposal.proposal, stage, meetingNotes: { ...proposal.meetingNotes, [proposal.stage]: note.trim() } };
    await onChange(next);
  }

  return <div className="governance-meeting-surface"><div className="meeting-window-head"><div><span className="section-kicker">Governance meeting</span><h1>{proposal.title}</h1><p>{tension?.title ?? "Structural proposal"}</p></div><button className="quiet" onClick={onClose}>Close meeting</button></div><article className="governance-proposal-card"><div className="governance-proposal-head"><div><span className="kind">Proposed by {personName(proposal.proposerId)}</span><h3>{stageName(proposal.stage)}</h3></div><span className="governance-stage-badge">{Math.max(index + 1, 1)} / 6</span></div><div className="governance-proposal-text"><strong>Current proposal</strong><p>{proposal.proposal}</p></div><div className="governance-round"><p className="meeting-guidance">{stageDescription(proposal.stage)}</p>
    {proposal.stage === "present_proposal" && <MeetingNav onNext={() => void move("clarifying_questions")} next="Start clarifying questions" />}
    {proposal.stage === "clarifying_questions" && <><MeetingNote value={note} setValue={setNote} label="Useful clarification (optional)" /><MeetingNav onPrevious={() => void move("present_proposal")} onNext={() => void move("reaction_round")} next="Start reaction round" /></>}
    {proposal.stage === "reaction_round" && <><MeetingNote value={note} setValue={setNote} label="Useful reactions to retain (optional)" /><MeetingNav onPrevious={() => void move("clarifying_questions")} onNext={() => void move("clarify")} next="Give proposer option to clarify" /></>}
    {proposal.stage === "clarify" && <><label className="field"><span>Proposal</span><textarea rows={5} value={proposalText} onChange={(event) => setProposalText(event.target.value)} /></label><MeetingNav onPrevious={() => void move("reaction_round")} onNext={() => void move("objection_round", proposalText)} next="Open objection round" /></>}
    {proposal.stage === "objection_round" && <><div className="objection-essential"><strong>An objection is not a preference, disagreement, or a better idea.</strong><p>It identifies a concrete way this proposal could harm SDBP or reduce its capacity to fulfil its purpose or responsibilities.</p><HelpTip label="How do we test an objection?"><strong>Test the reasoning, not the person.</strong><br />Ask whether the harm is caused or worsened by adopting this proposal, whether it matters to SDBP or a role the objector represents, and whether there would be too little time to adapt before significant harm occurs.</HelpTip></div><ol className="objection-tests"><li><span>1</span><p>What concrete harm or loss of capacity would this proposal create?</p></li><li><span>2</span><p>Is that problem caused or made worse by adopting this proposal?</p></li><li><span>3</span><p>Is it significant enough that the proposal should not proceed as written?</p></li></ol><MeetingNote value={note} setValue={setNote} label="Objection to integrate (optional)" /><div className="process-actions"><button className="quiet" onClick={() => void move("clarify")}>Previous</button><button className="secondary" onClick={() => void move("integration")}>Objection needs integration</button><button className="primary" onClick={() => void onAccept({ ...proposal, meetingNotes: { ...proposal.meetingNotes, objection_round: note.trim() } })}>No objections · accept</button></div></>}
    {proposal.stage === "integration" && <><label className="field"><span>Integrated proposal</span><textarea rows={5} value={proposalText} onChange={(event) => setProposalText(event.target.value)} /></label><MeetingNote value={note} setValue={setNote} label="What was integrated?" /><MeetingNav onPrevious={() => void move("objection_round")} onNext={() => void move("objection_round", proposalText)} next="Return to objection round" /></>}
  </div></article></div>;
}

function MeetingNote({ value, setValue, label }: { value: string; setValue: (value: string) => void; label: string }) {
  return <label className="field"><span>{label}</span><textarea rows={3} value={value} onChange={(event) => setValue(event.target.value)} /></label>;
}

function MeetingNav({ onPrevious, onNext, next }: { onPrevious?: () => void; onNext: () => void; next: string }) {
  return <div className="process-actions">{onPrevious && <button className="quiet" onClick={onPrevious}>Previous</button>}<button className="primary" onClick={onNext}>{next}</button></div>;
}

function PulseView({ workspace }: { workspace: WorkspaceData }) {
  const today = todayISO();
  const overdueActions = workspace.actions.filter((action) => (action.status === "open" || action.status === "proposed") && action.due && action.due < today).length;
  const updatesDue = workspace.projects.filter((project) => project.status === "active" && project.nextPrompt <= today).length;
  const openTensions = workspace.tensions.filter((tension) => tension.status !== "resolved").length;
  const governanceWaiting = workspace.governanceProposals.filter((proposal) => proposal.stage !== "accepted").length + workspace.tensions.filter((tension) => tension.status === "governance" && !workspace.governanceProposals.some((proposal) => proposal.tensionId === tension.id)).length;
  return <><div className="pulse-reminder"><strong>Look for stuck work, not scores.</strong><p>Pulse is only a signal for where a conversation or update may be needed.</p></div><div className="pulse-grid launch-pulse-grid"><PulseCard label="Project updates due" value={updatesDue} /><PulseCard label="Overdue actions" value={overdueActions} /><PulseCard label="Open tensions" value={openTensions} /><PulseCard label="Governance waiting" value={governanceWaiting} /></div></>;
}

function PulseCard({ label, value }: { label: string; value: number }) {
  return <article className="pulse-card"><span className="kind">{label}</span><strong>{value}</strong></article>;
}

function Toast({ message }: { message: string }) { return <div className="save-toast" role="status"><span>✓</span>{message}</div>; }
function humanKind(value: string) { return value.replace("_", " "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function tensionLabel(status: Tension["status"]) { if (status === "awaiting_confirmation") return "awaiting confirmation"; if (status === "needs_sync") return "needs conversation"; if (status === "governance") return "governance"; return status; }
function splitLines(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
function readError(error: unknown) { return error instanceof Error ? error.message : "Something could not be saved."; }
function stageName(stage: GovernanceStage) { return ({ prepared: "Prepared", present_proposal: "Present proposal", clarifying_questions: "Clarifying questions", reaction_round: "Reaction round", clarify: "Option to clarify", objection_round: "Objection round", integration: "Integration", accepted: "Accepted" } as Record<GovernanceStage, string>)[stage]; }
function stageDescription(stage: GovernanceStage) { return ({ prepared: "Prepare the proposal before the meeting.", present_proposal: "The proposer describes the tension and presents the proposal. The group listens for understanding.", clarifying_questions: "Ask factual questions needed to understand the tension or proposal. Opinions and reactions wait.", reaction_round: "Each person may react. The proposer listens without debating the reactions.", clarify: "The proposer may clarify or change the proposal after hearing the reactions.", objection_round: "Ask whether anyone sees concrete harm in adopting the proposal as written.", integration: "Change the proposal enough to resolve the objection while still addressing the original tension.", accepted: "The proposal has been adopted." } as Record<GovernanceStage, string>)[stage]; }
