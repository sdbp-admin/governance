"use client";

import { useEffect, useState } from "react";
import { actions, myAttention, people, projects, roleDefinitions, tensions } from "@/lib/mock-data";
import type { Action, AttentionItem, GovernanceProposal, GovernanceStage, Project, RoleDefinition, Tension } from "@/lib/domain";
import { NEXT_WEEK, PROTOTYPE_TODAY, humanGovernanceStage, personInitial, personName } from "@/lib/prototype-utils";
import { createOwnAction, loadOwnActions, setPersistedActionStatus } from "@/lib/supabase/actions";
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

type GovernanceMessage = {
  type?: string;
  proposal?: GovernanceProposal;
};

export type LiveProfile = {
  id: string;
  name: string;
  email: string;
};

const STORAGE = "sdbp-governance-prototype-v7";
const LIVE_PROTOTYPE_PERSON_ID = "ingmar";

export function Prototype({ liveProfile }: { liveProfile?: LiveProfile }) {
  const [view, setView] = useState<View>("attention");
  const [currentUserId, setCurrentUserId] = useState(liveProfile ? LIVE_PROTOTYPE_PERSON_ID : "edo");
  const [attention, setAttention] = useState<AttentionItem[]>(myAttention);
  const [workProjects, setWorkProjects] = useState<Project[]>(projects);
  const [workActions, setWorkActions] = useState<Action[]>(actions);
  const [workTensions, setWorkTensions] = useState<Tension[]>(tensions);
  const [roles, setRoles] = useState<RoleDefinition[]>(roleDefinitions);
  const [governanceProposals, setGovernanceProposals] = useState<GovernanceProposal[]>([]);
  const [persistedActionIds, setPersistedActionIds] = useState<string[]>([]);
  const [projectUpdateId, setProjectUpdateId] = useState<string | null>(null);
  const [selectedTensionId, setSelectedTensionId] = useState<string | null>(null);
  const [tensionDraftSeed, setTensionDraftSeed] = useState("");
  const [meetingProposalId, setMeetingProposalId] = useState<string | null>(null);
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
      } else if (liveProfile) {
        setCurrentUserId(LIVE_PROTOTYPE_PERSON_ID);
      }

      const meetingId = new URLSearchParams(window.location.search).get("meeting");
      if (meetingId) {
        setMeetingProposalId(meetingId);
        setView("governance");
      }
    } catch {
      sessionStorage.removeItem(STORAGE);
    } finally {
      setReady(true);
    }
  }, [liveProfile]);

  useEffect(() => {
    if (!ready || !liveProfile) return;
    let cancelled = false;

    async function loadPersistedActions() {
      try {
        const persisted = await loadOwnActions(liveProfile.id, LIVE_PROTOTYPE_PERSON_ID);
        if (cancelled) return;
        setPersistedActionIds(persisted.map((action) => action.id));
        setWorkActions((items) => [
          ...persisted,
          ...items.filter((action) => action.ownerId !== LIVE_PROTOTYPE_PERSON_ID),
        ]);
      } catch (error) {
        if (!cancelled) setNotice(`Could not load saved actions: ${error instanceof Error ? error.message : "unknown database error"}`);
      }
    }

    void loadPersistedActions();
    return () => { cancelled = true; };
  }, [ready, liveProfile]);

  useEffect(() => {
    if (!ready) return;
    setAttention((items) => {
      let changed = false;
      const next = [...items];

      for (const action of workActions) {
        const index = next.findIndex((item) => item.kind === "action" && item.targetId === action.id && item.ownerId === action.ownerId);
        const active = action.status === "proposed" || action.status === "open";

        if (!active) {
          if (index >= 0 && next[index].status !== "done") {
            next[index] = { ...next[index], status: "done" };
            changed = true;
          }
          continue;
        }

        const primaryAction = action.status === "proposed" ? "Accept action" : "Mark done";
        const reason = action.status === "proposed"
          ? `${action.source ? `Proposed from ${action.source}. ` : ""}Accept it to make it your open commitment.`
          : `${action.source ? `From ${action.source}. ` : ""}This is an open commitment assigned to you.`;

        if (index < 0) {
          next.push({
            id: `action-attention-${action.id}`,
            ownerId: action.ownerId,
            kind: "action",
            targetId: action.id,
            title: action.title,
            reason,
            primaryAction,
            status: "needs_action",
            due: action.due,
          });
          changed = true;
          continue;
        }

        const existing = next[index];
        const status = existing.status === "deferred" ? "deferred" : "needs_action";
        if (existing.title !== action.title || existing.reason !== reason || existing.primaryAction !== primaryAction || existing.status !== status || existing.due !== action.due) {
          next[index] = { ...existing, title: action.title, reason, primaryAction, status, due: action.due };
          changed = true;
        }
      }

      return changed ? next : items;
    });
  }, [ready, workActions]);

  useEffect(() => {
    if (!ready) return;
    const snapshot: Snapshot = { currentUserId, attention, projects: workProjects, actions: workActions, tensions: workTensions, roles, governanceProposals };
    sessionStorage.setItem(STORAGE, JSON.stringify(snapshot));
  }, [ready, currentUserId, attention, workProjects, workActions, workTensions, roles, governanceProposals]);

  useEffect(() => {
    function receiveGovernanceResult(event: MessageEvent<GovernanceMessage>) {
      if (event.origin !== window.location.origin) return;
      const proposal = event.data?.proposal;
      if (event.data?.type !== "sdbp-governance-accepted" || !proposal || proposal.stage !== "accepted") return;
      setGovernanceProposals((items) => {
        const exists = items.some((candidate) => candidate.id === proposal.id);
        return exists ? items.map((candidate) => candidate.id === proposal.id ? proposal : candidate) : [proposal, ...items];
      });
      setWorkTensions((items) => items.map((tension) => tension.id === proposal.tensionId ? { ...tension, status: "resolved", resolutionProposedBy: undefined, latestNote: `Governance proposal accepted: “${proposal.title}”.` } : tension));
      setAttention((items) => items.map((item) => item.targetId === proposal.tensionId && (item.kind === "governance" || item.kind === "tension") ? { ...item, status: "done" } : item));
      setView("governance");
      setNotice("Governance meeting completed. The accepted decision is back in the main app and recorded under Records.");
    }
    window.addEventListener("message", receiveGovernanceResult);
    return () => window.removeEventListener("message", receiveGovernanceResult);
  }, []);

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
    if (item.kind === "action" && item.targetId) {
      const action = workActions.find((candidate) => candidate.id === item.targetId);
      if (action?.status === "proposed") void acceptAction(item);
      else if (action?.status === "open") void completeAction(action.id);
      return;
    }
    if (item.kind === "tension" && item.targetId) { openTensions("", item.targetId); return; }
    if (item.kind === "governance") setView("governance");
  }

  async function acceptAction(item: AttentionItem) {
    const action = workActions.find((candidate) => candidate.id === item.targetId);
    if (!action || action.ownerId !== currentUserId || action.status !== "proposed") return;

    if (persistedActionIds.includes(action.id)) {
      try {
        await setPersistedActionStatus(action.id, "open");
      } catch (error) {
        announce(`Action was not saved: ${error instanceof Error ? error.message : "database error"}`);
        return;
      }
    }

    setWorkActions((items) => items.map((candidate) => candidate.id === action.id ? { ...candidate, status: "open" } : candidate));
    setAttention((items) => items.map((candidate) => candidate.id === item.id ? {
      ...candidate,
      status: "needs_action",
      reason: `${action.source ? `From ${action.source}. ` : ""}This is now an open commitment assigned to you.`,
      primaryAction: "Mark done",
    } : candidate));
    announce(`Action accepted: “${action.title}”. It remains in My Attention until done.`);
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
    announce(ownerId === currentUserId ? `Action created: “${action.title}”.` : `Action proposed to ${personName(ownerId)}.`);
  }

  async function createStandaloneAction(title: string) {
    if (!liveProfile || currentUserId !== LIVE_PROTOTYPE_PERSON_ID) return false;
    try {
      const action = await createOwnAction(liveProfile.id, LIVE_PROTOTYPE_PERSON_ID, title);
      setPersistedActionIds((ids) => ids.includes(action.id) ? ids : [action.id, ...ids]);
      setWorkActions((items) => [action, ...items.filter((candidate) => candidate.id !== action.id)]);
      announce(`Action saved to the board database: “${action.title}”.`);
      return true;
    } catch (error) {
      announce(`Action was not saved: ${error instanceof Error ? error.message : "database error"}`);
      return false;
    }
  }

  async function completeAction(id: string) {
    const action = workActions.find((candidate) => candidate.id === id);
    if (!action || action.ownerId !== currentUserId || action.status !== "open") return;

    if (persistedActionIds.includes(action.id)) {
      try {
        await setPersistedActionStatus(action.id, "done");
      } catch (error) {
        announce(`Action was not saved: ${error instanceof Error ? error.message : "database error"}`);
        return;
      }
    }

    setWorkActions((items) => items.map((candidate) => candidate.id === id ? { ...candidate, status: "done" } : candidate));
    completeTarget("action", id);

    if (action.sourceTensionId) {
      const tension = workTensions.find((candidate) => candidate.id === action.sourceTensionId);
      if (tension && tension.status === "open") {
        setWorkTensions((items) => items.map((candidate) => candidate.id === tension.id ? { ...candidate, latestNote: `${personName(currentUserId)} completed the linked action “${action.title}”. The tension is still open until somebody marks the real situation resolved.` } : candidate));
        if (tension.raiserId !== currentUserId) {
          upsertAttention({ ownerId: tension.raiserId, kind: "tension", targetId: tension.id, title: tension.title, reason: `${personName(currentUserId)} completed the linked action “${action.title}”. Check the real situation and resolve the tension if it is now gone.`, primaryAction: "Review tension", status: "needs_action" });
        }
      }
    }

    announce(persistedActionIds.includes(action.id) ? `Action completed and saved: “${action.title}”.` : `Action completed: “${action.title}”.`);
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

    if (project.sourceTensionId) {
      const tension = workTensions.find((candidate) => candidate.id === project.sourceTensionId);
      if (tension && tension.status === "open") {
        setWorkTensions((items) => items.map((candidate) => candidate.id === tension.id ? { ...candidate, latestNote: `${personName(currentUserId)} marked the linked project “${project.title}” complete. The tension remains independent until the real situation is resolved.` } : candidate));
        if (tension.raiserId !== currentUserId) {
          upsertAttention({ ownerId: tension.raiserId, kind: "tension", targetId: tension.id, title: tension.title, reason: `${personName(currentUserId)} completed the linked project “${project.title}”. Check whether the original tension is now resolved.`, primaryAction: "Review tension", status: "needs_action" });
        }
      }
    }

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
    const meetingProposals = governanceProposals.map((proposal) => proposal.id === id ? { ...proposal, stage: "present_proposal" as GovernanceStage } : proposal);
    const snapshot: Snapshot = { currentUserId, attention, projects: workProjects, actions: workActions, tensions: workTensions, roles, governanceProposals: meetingProposals };
    sessionStorage.setItem(STORAGE, JSON.stringify(snapshot));

    const url = new URL(window.location.href);
    url.searchParams.set("meeting", id);
    const meetingWindow = window.open(url.toString(), `sdbp-governance-${id}`, "popup=yes,width=1280,height=900,resizable=yes,scrollbars=yes");

    if (!meetingWindow) {
      setGovernanceProposals(meetingProposals);
      setView("governance");
      announce("The browser blocked the meeting window, so the governance meeting opened in this tab instead.");
      return;
    }

    announce("Governance meeting opened in a separate window for screen sharing.");
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
    const acceptedProposal: GovernanceProposal = { ...proposal, stage: "accepted", acceptedAt: PROTOTYPE_TODAY };
    setGovernanceProposals((items) => items.map((candidate) => candidate.id === id ? acceptedProposal : candidate));
    setWorkTensions((items) => items.map((tension) => tension.id === proposal.tensionId ? { ...tension, status: "resolved", resolutionProposedBy: undefined, latestNote: `Governance proposal accepted: “${proposal.title}”.` } : tension));
    completeTarget("governance", proposal.tensionId);
    completeTarget("tension", proposal.tensionId);

    if (meetingProposalId && window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: "sdbp-governance-accepted", proposal: acceptedProposal }, window.location.origin);
      window.setTimeout(() => window.close(), 120);
      return;
    }

    announce("Proposal accepted. The governance result is now visible under Records.");
  }

  const governanceView = <GovernanceView tensions={workTensions} proposals={governanceProposals} currentUserId={currentUserId} facilitatorId={facilitatorId} meetingProposalId={meetingProposalId ?? undefined} onGoToTensions={() => setView("tensions")} onCreateProposal={createProposal} onStartMeeting={startGovernanceMeeting} onSetStage={setGovernanceStage} onSaveNotes={saveGovernanceNotes} onUpdateProposal={updateProposalText} onAccept={acceptProposal} />;

  if (meetingProposalId) {
    return <main className="main governance-meeting-popout">{governanceView}{notice && <div className="save-toast" role="status"><span>✓</span>{notice}</div>}</main>;
  }

  return <div className="shell"><aside className="sidebar"><div className="brand-lockup"><div className="brand-mark" aria-hidden="true"><span /><span /></div><div className="brand">SDBP Governance<small>Structure · rhythm · memory</small></div></div><nav className="nav">{(Object.keys(labels) as View[]).map((key) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}><strong>{labels[key]}</strong><small>{navMeta[key]}</small></button>)}</nav><div className="sidebar-foot"><div className="avatar">{personInitial(currentUserId)}</div><label className="prototype-user"><span>Test as</span><select value={currentUserId} onChange={(event) => switchUser(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><small>Prototype aid for normal handoffs</small></label></div></aside>
    <main className="main"><Header view={view} attentionCount={activeAttention.length} currentUserId={currentUserId} />
      {view === "attention" && <AttentionView items={activeAttention} deferred={deferred} onPrimary={handleAttentionPrimary} onNoChange={noChange} deferItem={deferItem} restoreItem={restoreItem} onRaiseTension={() => openTensions()} />}
      {view === "work" && <WorkView projects={workProjects} actions={workActions} tensions={workTensions} currentUserId={currentUserId} onCompleteAction={completeAction} onCompleteProject={completeProject} onAddAction={liveProfile && currentUserId === LIVE_PROTOTYPE_PERSON_ID ? createStandaloneAction : undefined} persistedActionIds={persistedActionIds} />}
      {view === "tensions" && <TensionsView tensions={workTensions} projects={workProjects} currentUserId={currentUserId} selectedTensionId={selectedTensionId} draftSeed={tensionDraftSeed} onAddTension={addTension} onMarkResolved={markTensionResolved} onResolve={resolveTension} onKeepOpen={keepOpen} onMove={moveTension} onCreateAction={createAction} onCreateProject={createProject} />}
      {view === "organisation" && <OrganisationView roles={roles} setRoles={setRoles} onSaved={(title) => announce(`Role saved: “${title}”.`)} onDeleted={(title) => announce(`Role removed: “${title}”.`)} />}
      {view === "governance" && governanceView}
      {view === "records" && <RecordsView governanceProposals={governanceProposals} tensions={workTensions} />}
      {view === "pulse" && <PulseView attention={attention} actions={workActions} tensions={workTensions} />}
    </main>
    {notice && <div className="save-toast" role="status"><span>✓</span>{notice}</div>}
    {projectUpdate && <ProjectUpdateEditor project={projectUpdate} onSave={saveProject} onNoChange={() => { const item = attention.find((candidate) => candidate.kind === "project_update" && candidate.targetId === projectUpdate.id && candidate.ownerId === currentUserId); if (item) noChange(item); setProjectUpdateId(null); }} onRaiseTension={() => raiseFromProject(projectUpdate.id)} onClose={() => setProjectUpdateId(null)} />}
  </div>;
}
