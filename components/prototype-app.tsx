"use client";

import { useEffect, useState } from "react";
import { actions, myAttention, people, projects, roleDefinitions, tensions } from "@/lib/mock-data";
import type { Action, AttentionItem, GovernanceProposal, GovernanceStage, Project, RoleDefinition, Tension } from "@/lib/domain";
import { NEXT_WEEK, PROTOTYPE_TODAY, humanGovernanceStage, personInitial, personName } from "@/lib/prototype-utils";
import { AttentionView, Header, ProjectUpdateEditor, WorkView, labels, navMeta, type View } from "@/components/attention-work";
import { TensionsView } from "@/components/tensions-view";
import { OrganisationView } from "@/components/organisation-view";
import { GovernanceView } from "@/components/governance-view";
import { PulseView, RecordsView } from "@/components/records-pulse";

type Snapshot = {
  currentUserId: string;
  attention: AttentionItem[];
  projects: Project[];
  actions: Action[];
  tensions: Tension[];
  roles: RoleDefinition[];
  governanceProposals: GovernanceProposal[];
};

const STORAGE = "sdbp-governance-prototype-v5";

export function Prototype() {
  const [view, setView] = useState<View>("attention");
  const [currentUserId, setCurrentUserId] = useState("edo");
  const [attention, setAttention] = useState<AttentionItem[]>(myAttention);
  const [workProjects, setWorkProjects] = useState<Project[]>(projects);
  const [workActions, setWorkActions] = useState<Action[]>(actions);
  const [workTensions, setWorkTensions] = useState<Tension[]>(tensions);
  const [roles, setRoles] = useState<RoleDefinition[]>(roleDefinitions);
  const [governanceProposals, setGovernanceProposals] = useState<GovernanceProposal[]>([]);
  const [projectUpdateId, setProjectUpdateId] = useState<string | null>(null);
  const [selectedTensionId, setSelectedTensionId] = useState<string | null>(null);
  const [tensionDraftSeed, setTensionDraftSeed] = useState("");
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  const activeAttention = attention.filter((item) => item.ownerId === currentUserId && item.status === "needs_action");
  const deferred = attention.filter((item) => item.ownerId === currentUserId && item.status === "deferred");
  const projectUpdate = workProjects.find((project) => project.id === projectUpdateId) ?? null;
  const facilitatorId = roles.find((role) => role.title.toLowerCase() === "process steward")?.holderIds[0];

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE);
      if (raw) {
        const snapshot = JSON.parse(raw) as Partial<Snapshot>;
        if (snapshot.currentUserId && people.some((person) => person.id === snapshot.currentUserId)) setCurrentUserId(snapshot.currentUserId);
        if (Array.isArray(snapshot.attention)) setAttention(snapshot.attention);
        if (Array.isArray(snapshot.projects)) setWorkProjects(snapshot.projects);
        if (Array.isArray(snapshot.actions)) setWorkActions(snapshot.actions);
        if (Array.isArray(snapshot.tensions)) setWorkTensions(snapshot.tensions);
        if (Array.isArray(snapshot.roles)) setRoles(snapshot.roles);
        if (Array.isArray(snapshot.governanceProposals)) setGovernanceProposals(snapshot.governanceProposals);
      }
    } catch {
      sessionStorage.removeItem(STORAGE);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const snapshot: Snapshot = { currentUserId, attention, projects: workProjects, actions: workActions, tensions: workTensions, roles, governanceProposals };
    sessionStorage.setItem(STORAGE, JSON.stringify(snapshot));
  }, [ready, currentUserId, attention, workProjects, workActions, workTensions, roles, governanceProposals]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3600);
    return () => clearTimeout(timer);
  }, [notice]);

  const announce = (message: string) => setNotice(message);
  const completeItem = (id: string) => setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "done" } : item));
  const completeTarget = (kind: AttentionItem["kind"], targetId: string) => setAttention((items) => items.map((item) => item.kind === kind && item.targetId === targetId ? { ...item, status: "done" } : item));

  function upsertAttention(next: Omit<AttentionItem, "id">) {
    setAttention((items) => {
      const existing = items.find((item) => item.ownerId === next.ownerId && item.kind === next.kind && item.targetId === next.targetId && item.status !== "done");
      return existing
        ? items.map((item) => item.id === existing.id ? { ...item, ...next } : item)
        : [{ ...next, id: `attention-${Date.now()}-${next.ownerId}` }, ...items];
    });
  }

  const deferItem = (id: string) => { setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "deferred" } : item)); announce("Reminder parked for later in this prototype session."); };
  const restoreItem = (id: string) => { setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "needs_action" } : item)); announce("Item returned to My Attention."); };

  function openTensions(seed = "", id: string | null = null) {
    setTensionDraftSeed(seed);
    setSelectedTensionId(id);
    setView("tensions");
  }

  function switchUser(id: string) {
    setCurrentUserId(id);
    setProjectUpdateId(null);
    setSelectedTensionId(null);
    setTensionDraftSeed("");
    setView("attention");
    announce(`Prototype view switched to ${personName(id)}.`);
  }

  function handleAttentionPrimary(item: AttentionItem) {
    if (item.kind === "project_update" && item.targetId) { setProjectUpdateId(item.targetId); return; }
    if (item.kind === "action" && item.targetId) { acceptAction(item); return; }
    if (item.kind === "tension" && item.targetId) { openTensions("", item.targetId); return; }
    if (item.kind === "governance") setView("governance");
  }

  function acceptAction(item: AttentionItem) {
    const action = workActions.find((candidate) => candidate.id === item.targetId);
    if (!action || action.ownerId !== currentUserId) return;
    setWorkActions((items) => items.map((candidate) => candidate.id === action.id ? { ...candidate, status: "open" } : candidate));
    completeItem(item.id);
    announce(`Action accepted: “${action.title}”.`);
  }

  function noChange(item: AttentionItem) {
    if (item.targetId) setWorkProjects((items) => items.map((project) => project.id === item.targetId ? { ...project, lastUpdate: PROTOTYPE_TODAY, nextPrompt: NEXT_WEEK } : project));
    completeItem(item.id);
    announce("Project checked: no change. Next prompt is Aug 18.");
  }

  function saveProject(id: string, summary: string) {
    const project = workProjects.find((candidate) => candidate.id === id);
    setWorkProjects((items) => items.map((candidate) => candidate.id === id ? { ...candidate, summary: summary.trim(), lastUpdate: PROTOTYPE_TODAY, nextPrompt: NEXT_WEEK } : candidate));
    completeTarget("project_update", id);
    setProjectUpdateId(null);
    announce(`${project?.title ?? "Project"} updated and saved.`);
  }

  function raiseFromProject(id: string) {
    const project = workProjects.find((candidate) => candidate.id === id);
    setProjectUpdateId(null);
    openTensions(project ? `${project.title}: ` : "");
  }

  function addTension(tension: Tension) {
    setWorkTensions((items) => [tension, ...items]);
    upsertAttention({ ownerId: tension.raiserId, kind: "tension", targetId: tension.id, title: tension.title, reason: "You raised this tension. Process what you need next.", primaryAction: "Process tension", status: "needs_action" });
    announce(`Tension raised: “${tension.title}”.`);
  }

  function markTensionResolved(id: string) {
    const tension = workTensions.find((candidate) => candidate.id === id);
    if (!tension || tension.status !== "open") return;

    if (tension.raiserId === currentUserId) {
      resolveTension(id, `${personName(currentUserId)} resolved their tension.`);
      return;
    }

    completeTarget("tension", id);
    setWorkTensions((items) => items.map((candidate) => candidate.id === id ? {
      ...candidate,
      status: "awaiting_confirmation",
      resolutionProposedBy: currentUserId,
      latestNote: `${personName(currentUserId)} marked this resolved. Waiting for ${personName(tension.raiserId)} to confirm.`,
    } : candidate));
    upsertAttention({ ownerId: tension.raiserId, kind: "tension", targetId: tension.id, title: tension.title, reason: `${personName(currentUserId)} marked this resolved. Check the real situation and confirm or keep it open.`, primaryAction: "Review resolution", status: "needs_action" });
    announce(`Marked resolved. Waiting for ${personName(tension.raiserId)} to confirm.`);
  }

  function resolveTension(id: string, note: string) {
    setWorkTensions((items) => items.map((tension) => tension.id === id ? { ...tension, status: "resolved", resolutionProposedBy: undefined, latestNote: note } : tension));
    completeTarget("tension", id);
    announce("Tension resolved.");
  }

  function keepOpen(id: string) {
    const tension = workTensions.find((candidate) => candidate.id === id);
    if (!tension) return;
    completeTarget("tension", id);
    setWorkTensions((items) => items.map((candidate) => candidate.id === id ? { ...candidate, status: "open", resolutionProposedBy: undefined, latestNote: `${personName(currentUserId)} confirmed the tension still exists.` } : candidate));
    upsertAttention({ ownerId: tension.raiserId, kind: "tension", targetId: tension.id, title: tension.title, reason: "This tension is still open. Continue processing it when you need something from the organisation.", primaryAction: "Continue processing", status: "needs_action" });
    announce("Tension kept open.");
  }

  function moveTension(id: string, status: "governance" | "needs_sync", note: string) {
    const tension = workTensions.find((candidate) => candidate.id === id);
    if (!tension) return;
    setWorkTensions((items) => items.map((candidate) => candidate.id === id ? { ...candidate, status, resolutionProposedBy: undefined, latestNote: note } : candidate));
    completeTarget("tension", id);
    if (status === "governance") {
      upsertAttention({ ownerId: tension.raiserId, kind: "governance", targetId: tension.id, title: tension.title, reason: "Prepare a governance proposal for a real governance meeting.", primaryAction: "Prepare proposal", status: "needs_action" });
      setView("governance");
      announce("Tension moved to Governance.");
    } else {
      announce("Tension marked as needing a synchronous conversation.");
    }
  }

  function createAction(id: string, title: string, ownerId: string) {
    const tension = workTensions.find((candidate) => candidate.id === id);
    if (!tension) return;
    const action: Action = { id: `action-${Date.now()}`, title: title.trim(), ownerId, status: ownerId === currentUserId ? "open" : "proposed", source: tension.title, sourceTensionId: tension.id };
    setWorkActions((items) => [action, ...items]);
    completeTarget("tension", id);
    setWorkTensions((items) => items.map((candidate) => candidate.id === id ? { ...candidate, latestNote: `Related action created: “${action.title}”. The tension remains independent and can be resolved whenever the real situation is resolved.` } : candidate));
    if (ownerId !== currentUserId) upsertAttention({ ownerId, kind: "action", targetId: action.id, title: action.title, reason: `${personName(currentUserId)} proposed this action from “${tension.title}”.`, primaryAction: "Accept action", status: "needs_action" });
    announce(ownerId === currentUserId ? `Action created: “${action.title}”.` : `Action proposed to ${personName(ownerId)}.`);
  }

  function completeAction(id: string) {
    const action = workActions.find((candidate) => candidate.id === id);
    if (!action || action.ownerId !== currentUserId) return;
    setWorkActions((items) => items.map((candidate) => candidate.id === id ? { ...candidate, status: "done" } : candidate));
    completeTarget("action", id);
    announce(`Action completed: “${action.title}”.`);
  }

  function createProject(id: string, title: string) {
    const tension = workTensions.find((candidate) => candidate.id === id);
    if (!tension) return;
    const project: Project = { id: `project-${Date.now()}`, title: title.trim(), ownerId: currentUserId, status: "active", lastUpdate: PROTOTYPE_TODAY, nextPrompt: NEXT_WEEK, summary: `Created from tension: ${tension.title}`, sourceTensionId: tension.id };
    setWorkProjects((items) => [project, ...items]);
    completeTarget("tension", id);
    setWorkTensions((items) => items.map((candidate) => candidate.id === id ? { ...candidate, latestNote: `Related project created: “${project.title}”. The project and tension now remain independently visible.` } : candidate));
    announce(`Project created: “${project.title}”.`);
  }

  function completeProject(id: string) {
    const project = workProjects.find((candidate) => candidate.id === id);
    if (!project || project.ownerId !== currentUserId || project.status !== "active") return;
    setWorkProjects((items) => items.map((candidate) => candidate.id === id ? { ...candidate, status: "complete", lastUpdate: PROTOTYPE_TODAY } : candidate));
    announce(`Project outcome achieved: “${project.title}”.`);
  }

  function createProposal(tensionId: string, title: string, text: string) {
    const tension = workTensions.find((candidate) => candidate.id === tensionId);
    if (!tension) return;
    const proposal: GovernanceProposal = { id: `governance-${Date.now()}`, tensionId, title: title.trim(), proposal: text.trim(), proposerId: currentUserId, stage: "prepared", meetingNotes: {}, createdAt: PROTOTYPE_TODAY };
    setGovernanceProposals((items) => [proposal, ...items]);
    completeTarget("governance", tensionId);
    setWorkTensions((items) => items.map((candidate) => candidate.id === tensionId ? { ...candidate, latestNote: `Governance proposal prepared by ${personName(currentUserId)}: “${proposal.title}”. Ready for a governance meeting.` } : candidate));
    announce("Governance proposal prepared for a meeting.");
  }

  function updateProposal(id: string, updater: (proposal: GovernanceProposal) => GovernanceProposal) {
    setGovernanceProposals((items) => items.map((proposal) => proposal.id === id ? updater(proposal) : proposal));
  }

  function startGovernanceMeeting(id: string) {
    updateProposal(id, (proposal) => ({ ...proposal, stage: "present_proposal" }));
    announce("Governance meeting started. Present Proposal is on screen.");
  }

  function setGovernanceStage(id: string, stage: GovernanceStage) {
    updateProposal(id, (proposal) => ({ ...proposal, stage }));
    announce(`Governance moved to ${humanGovernanceStage(stage)}.`);
  }

  function saveGovernanceNotes(id: string, stage: GovernanceStage, note: string) {
    updateProposal(id, (proposal) => ({ ...proposal, meetingNotes: { ...proposal.meetingNotes, [stage]: note.trim() } }));
  }

  function updateProposalText(id: string, text: string) {
    updateProposal(id, (proposal) => ({ ...proposal, proposal: text.trim() }));
  }

  function acceptProposal(id: string) {
    const proposal = governanceProposals.find((candidate) => candidate.id === id);
    if (!proposal) return;
    updateProposal(id, (candidate) => ({ ...candidate, stage: "accepted", acceptedAt: PROTOTYPE_TODAY }));
    setWorkTensions((items) => items.map((tension) => tension.id === proposal.tensionId ? { ...tension, status: "resolved", resolutionProposedBy: undefined, latestNote: `Governance proposal accepted: “${proposal.title}”.` } : tension));
    completeTarget("governance", proposal.tensionId);
    completeTarget("tension", proposal.tensionId);
    announce("Proposal accepted and the governance result recorded in this prototype session.");
  }

  return <div className="shell"><aside className="sidebar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /><span /></div><div className="brand">SDBP Governance<small>Structure · rhythm · memory</small></div></div><nav className="nav">{(Object.keys(labels) as View[]).map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><strong>{labels[key]}</strong><small>{navMeta[key]}</small></button>)}</nav><div className="sidebar-foot"><div className="avatar">{personInitial(currentUserId)}</div><label className="prototype-user"><span>Test as</span><select value={currentUserId} onChange={(event) => switchUser(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><small>Prototype aid for normal handoffs</small></label></div></aside>
    <main className="main"><Header view={view} attentionCount={activeAttention.length} currentUserId={currentUserId} />
      {view === "attention" && <AttentionView items={activeAttention} deferred={deferred} onPrimary={handleAttentionPrimary} onNoChange={noChange} deferItem={deferItem} restoreItem={restoreItem} onRaiseTension={() => openTensions()} />}
      {view === "work" && <WorkView projects={workProjects} actions={workActions} tensions={workTensions} currentUserId={currentUserId} onCompleteAction={completeAction} onCompleteProject={completeProject} />}
      {view === "tensions" && <TensionsView tensions={workTensions} projects={workProjects} currentUserId={currentUserId} selectedTensionId={selectedTensionId} draftSeed={tensionDraftSeed} onAddTension={addTension} onMarkResolved={markTensionResolved} onResolve={resolveTension} onKeepOpen={keepOpen} onMove={moveTension} onCreateAction={createAction} onCreateProject={createProject} />}
      {view === "organisation" && <OrganisationView roles={roles} setRoles={setRoles} onSaved={(title) => announce(`Role saved: “${title}”.`)} onDeleted={(title) => announce(`Role removed: “${title}”.`)} />}
      {view === "governance" && <GovernanceView tensions={workTensions} proposals={governanceProposals} currentUserId={currentUserId} facilitatorId={facilitatorId} onGoToTensions={() => setView("tensions")} onCreateProposal={createProposal} onStartMeeting={startGovernanceMeeting} onSetStage={setGovernanceStage} onSaveNotes={saveGovernanceNotes} onUpdateProposal={updateProposalText} onAccept={acceptProposal} />}
      {view === "records" && <RecordsView />}
      {view === "pulse" && <PulseView attention={attention} actions={workActions} tensions={workTensions} />}
    </main>
    {notice && <div className="save-toast" role="status"><span>✓</span>{notice}</div>}
    {projectUpdate && <ProjectUpdateEditor project={projectUpdate} onSave={saveProject} onNoChange={() => { const item = attention.find((candidate) => candidate.kind === "project_update" && candidate.targetId === projectUpdate.id && candidate.ownerId === currentUserId); if (item) noChange(item); setProjectUpdateId(null); }} onRaiseTension={() => raiseFromProject(projectUpdate.id)} onClose={() => setProjectUpdateId(null)} />}
  </div>;
}
