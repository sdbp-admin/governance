"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Action, Tension } from "@/lib/domain";
import type { ContextualNextStepInput } from "@/components/contextual-next-steps";
import { WorkspaceWorkView } from "@/components/work-view";
import { TensionsWorkspaceView } from "@/components/tensions-workspace-view";
import type { WorkspaceData, WorkspacePerson } from "@/lib/supabase/workspace";
import { loadCommentThreadSummary } from "@/lib/supabase/comment-thread-state";
import { projectToneClass } from "@/lib/project-tone";
import { removeAction, updateActionDetails } from "@/lib/supabase/action-management";
import styles from "@/components/redesign/redesign.module.css";

export type RedesignWorkTarget = { kind: "project" | "tension"; id: string } | null;
export type RedesignCreateIntent = "project" | "tension" | null;

type Need = "input" | "sync";

type Props = {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  personInitial: (id: string) => string;
  urgentTensionIds: ReadonlySet<string>;
  target: RedesignWorkTarget;
  onTarget: (target: RedesignWorkTarget) => void;
  createIntent: RedesignCreateIntent;
  onCreateIntentHandled: () => void;
  openCommentsProjectId?: string | null;
  onProjectCommentsOpened?: () => void;
  openCommentsTensionId?: string | null;
  onTensionCommentsOpened?: () => void;
  onAddNextStep: (input: ContextualNextStepInput) => Promise<boolean>;
  onAddProject: (input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<boolean>;
  onActionStatus: (id: string, status: "open" | "done") => Promise<unknown>;
  onCompleteProject: (id: string) => Promise<void>;
  onReopenProject: (id: string) => Promise<void>;
  onSaveProjectSettings: (projectId: string, input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<boolean>;
  onUpdateProject: (id: string) => void;
  onRaise: (title: string, projectId?: string) => Promise<boolean>;
  onMarkResolved: (tension: Tension) => Promise<void>;
  onKeepOpen: (tension: Tension) => Promise<void>;
  onNeed: (tension: Tension, kind: Need, ids: string[], detail: string) => Promise<boolean>;
  onMoveGovernance: (tension: Tension) => Promise<void>;
  onResolve: (tension: Tension, note: string) => Promise<void>;
  onCreatePoll: (id: string, times: string[]) => Promise<boolean>;
  onVotePoll: (id: string, options: string[]) => Promise<boolean>;
  onChoosePoll: (id: string, option: string) => Promise<boolean>;
  onUrgency: (tension: Tension, urgent: boolean) => Promise<boolean>;
};

export function RedesignWorkHub(props: Props) {
  const [createOpen, setCreateOpen] = useState<RedesignCreateIntent>(null);
  const [commitmentsOpen, setCommitmentsOpen] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(false);

  useEffect(() => {
    if (!props.createIntent) return;
    setCreateOpen(props.createIntent);
    props.onCreateIntentHandled();
  }, [props.createIntent, props.onCreateIntentHandled]);

  const activeProjects = props.workspace.projects.filter((project) => project.status === "active");
  const completedProjects = props.workspace.projects.filter((project) => project.status === "complete");
  const activeTensions = props.workspace.tensions.filter((tension) => tension.status !== "resolved");
  const unlinkedTensions = activeTensions.filter((tension) => !tension.linkedProjectId);
  const openActions = props.workspace.actions.filter((action) => action.status === "open" || action.status === "proposed");

  const selectedProject = props.target?.kind === "project" ? props.workspace.projects.find((project) => project.id === props.target?.id) : undefined;
  const selectedTension = props.target?.kind === "tension" ? props.workspace.tensions.find((tension) => tension.id === props.target?.id) : undefined;

  useEffect(() => {
    if (!props.target) return;
    if (props.target.kind === "project" && !selectedProject) props.onTarget(null);
    if (props.target.kind === "tension" && !selectedTension) props.onTarget(null);
  }, [props.target, selectedProject, selectedTension, props.onTarget]);

  const tensionCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const tension of activeTensions) {
      if (!tension.linkedProjectId) continue;
      map.set(tension.linkedProjectId, (map.get(tension.linkedProjectId) ?? 0) + 1);
    }
    return map;
  }, [activeTensions]);

  const actionCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const action of openActions) {
      if (!action.projectId) continue;
      map.set(action.projectId, (map.get(action.projectId) ?? 0) + 1);
    }
    return map;
  }, [openActions]);

  if (selectedProject) {
    const focusedWorkspace = { ...props.workspace, projects: [selectedProject] };
    return <div className={styles.detailShell}>
      <DetailHeader kind="Project" title={selectedProject.title} onBack={() => props.onTarget(null)} />
      <div className={styles.projectDetail}>
        <WorkspaceWorkView
          workspace={focusedWorkspace}
          currentUserId={props.currentUserId}
          personName={props.personName}
          personInitial={props.personInitial}
          onAddNextStep={props.onAddNextStep}
          onAddProject={props.onAddProject}
          onActionStatus={props.onActionStatus}
          onCompleteProject={props.onCompleteProject}
          onReopenProject={props.onReopenProject}
          onSaveProjectSettings={props.onSaveProjectSettings}
          onUpdateProject={props.onUpdateProject}
          openCommentsProjectId={props.openCommentsProjectId}
          onCommentsOpened={props.onProjectCommentsOpened}
        />
      </div>
    </div>;
  }

  if (selectedTension) {
    const focusedWorkspace = { ...props.workspace, tensions: [selectedTension] };
    return <div className={styles.detailShell}>
      <DetailHeader kind="Tension" title={selectedTension.title} onBack={() => props.onTarget(null)} />
      <div className={styles.tensionDetail}>
        <TensionsWorkspaceView
          workspace={focusedWorkspace}
          currentUserId={props.currentUserId}
          personName={props.personName}
          urgentTensionIds={props.urgentTensionIds}
          openCommentsTensionId={props.openCommentsTensionId}
          onCommentsOpened={props.onTensionCommentsOpened}
          onRaise={async (title) => props.onRaise(title)}
          onAddNextStep={props.onAddNextStep}
          onActionStatus={props.onActionStatus}
          onMarkResolved={props.onMarkResolved}
          onKeepOpen={props.onKeepOpen}
          onNeed={props.onNeed}
          onMoveGovernance={props.onMoveGovernance}
          onResolve={props.onResolve}
          onCreatePoll={props.onCreatePoll}
          onVotePoll={props.onVotePoll}
          onChoosePoll={props.onChoosePoll}
          onUrgency={props.onUrgency}
        />
      </div>
    </div>;
  }

  if (completedOpen) {
    return <div className={styles.detailShell}>
      <DetailHeader kind="Work" title="Completed projects" onBack={() => setCompletedOpen(false)} />
      <div className={styles.projectDetail}>
        <WorkspaceWorkView
          workspace={props.workspace}
          currentUserId={props.currentUserId}
          personName={props.personName}
          personInitial={props.personInitial}
          onAddNextStep={props.onAddNextStep}
          onAddProject={props.onAddProject}
          onActionStatus={props.onActionStatus}
          onCompleteProject={props.onCompleteProject}
          onReopenProject={props.onReopenProject}
          onSaveProjectSettings={props.onSaveProjectSettings}
          onUpdateProject={props.onUpdateProject}
          openCommentsProjectId={props.openCommentsProjectId}
          onCommentsOpened={props.onProjectCommentsOpened}
        />
      </div>
    </div>;
  }

  return <>
    <div className={styles.workToolbar}>
      <div className={styles.workToolbarActions}>
        <button className="primary small" type="button" onClick={() => setCreateOpen("project")}>+ Project</button>
        <button className="secondary small" type="button" onClick={() => setCreateOpen("tension")}>+ Tension</button>
        <button className="quiet small" type="button" onClick={() => setCommitmentsOpen(true)}><span className={styles.toolbarIcon} aria-hidden="true">→</span> Commitments <span className={styles.inlineCount}>{openActions.length}</span></button>
      </div>
      <span className={styles.workToolbarNote}>Open an item when you need its conversation, next steps, files or controls.</span>
    </div>

    <section className={styles.workSection}>
      <div className={styles.sectionHeader}>
        <div><span className="section-kicker">Current work</span><h2>Projects</h2></div>
        <span className={styles.sectionCount}>{activeProjects.length}</span>
      </div>
      {activeProjects.length ? <div className={styles.projectGrid}>
        {activeProjects.map((project) => {
          const linked = activeTensions.filter((tension) => tension.linkedProjectId === project.id);
          const projectActions = openActions.filter((action) => action.projectId === project.id);
          const tensionCount = tensionCountByProject.get(project.id) ?? 0;
          const actionCount = actionCountByProject.get(project.id) ?? 0;
          const latestLinked = [...linked].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          const tone = projectToneClass(project.id).replace("project-tone-", "");
          return <article className={styles.projectCard} data-tone={tone} key={project.id}>
            <div className={styles.projectTopline}>
              <span className={styles.objectTypeBadge}><span className={styles.objectGlyph} aria-hidden="true">▣</span>Project</span>
              <span className={styles.ownerVisual}><span className={styles.personAvatar}>{props.personInitial(project.ownerId)}</span><strong>{props.personName(project.ownerId)}</strong></span>
            </div>
            <div className={styles.projectTitleRow}>
              <h3>{project.title}</h3>
              <button className={styles.openProjectInline} type="button" onClick={() => props.onTarget({ kind: "project", id: project.id })}>Open <span>→</span></button>
            </div>
            {project.summary && <p className={styles.summary}>{project.summary}</p>}
            <div className={styles.objectMeta}>
              <span className={styles.tensionCountChip}><b aria-hidden="true">!</b>{tensionCount}</span>
              <span className={styles.stepCountChip}><b aria-hidden="true">→</b>{actionCount}</span>
              <ProjectActivityIndicator projectId={project.id} linkedTensionIds={linked.map((tension) => tension.id)} />
            </div>
            {linked.length > 0 && <div className={styles.cardWorkGroup}>
              <div className={`${styles.cardWorkGroupHead} ${styles.tensionGroupHead}`}><span className={styles.groupGlyph} aria-hidden="true">!</span><span>Tensions</span><strong>{linked.length}</strong>{latestLinked && <small>{formatRecentDate(latestLinked.createdAt)}</small>}</div>
              <div className={styles.linkedTensions}>
                {linked.slice(0, 2).map((tension) => {
                  const meta = tensionPreviewMeta(tension, props.personName);
                  return <button type="button" key={tension.id} onClick={() => props.onTarget({ kind: "tension", id: tension.id })}>
                    <span className={styles.tensionVisualMark} aria-hidden="true">!</span>
                    <span>
                      <strong>{tension.title}</strong>
                      <span className={styles.tensionMetaRow}>
                        <span className={styles.personAvatarSmall}>{props.personInitial(tension.raiserId)}</span>
                        <span className={styles.statusChip}>{meta.status}</span>
                        {meta.involvedNames.length > 0 && <span className={styles.peopleCluster} aria-label={meta.involvedNames.join(", ")}>
                          {meta.involvedNames.slice(0,3).map((name) => <span key={name}>{name.charAt(0).toUpperCase()}</span>)}
                          {meta.involvedNames.length > 3 && <i>+{meta.involvedNames.length - 3}</i>}
                        </span>}
                        {meta.stateLabel && <span className={styles.needChip}>{meta.stateLabel}</span>}
                      </span>
                      {meta.secondary && <small className={styles.tensionState}>{meta.secondary}</small>}
                    </span>
                  </button>;
                })}
                {linked.length > 2 && <small className={styles.moreLinked}>+ {linked.length - 2} more tensions</small>}
              </div>
            </div>}
            {projectActions.length > 0 && <div className={styles.cardWorkGroup}>
              <div className={`${styles.cardWorkGroupHead} ${styles.stepGroupHead}`}><span className={styles.groupGlyph} aria-hidden="true">→</span><span>Commitments</span><strong>{projectActions.length}</strong></div>
              <div className={styles.projectStepList}>
                {projectActions.slice(0, 2).map((action) => <button type="button" key={action.id} onClick={() => props.onTarget({ kind: "project", id: project.id })}>
                  <span className={styles.stepMarker} aria-hidden="true">→</span>
                  <span className={styles.projectStepCopy}>
                    <strong>{action.title}</strong>
                    <span className={styles.stepMetaRow}>
                      <span className={styles.personAvatarSmall}>{props.personInitial(action.ownerId)}</span>
                      <span className={action.status === "proposed" ? styles.proposedChip : styles.ownedChip}>{action.status === "proposed" ? "Proposed" : "Owned"}</span>
                      {action.due && <span className={styles.dueChip}>{formatActionDate(action.due)}</span>}
                    </span>
                  </span>
                </button>)}
                {projectActions.length > 2 && <small className={styles.moreLinked}>+ {projectActions.length - 2} more next steps</small>}
              </div>
            </div>}
          </article>;
        })}
      </div> : <div className="calm-empty compact-empty"><span>○</span><h3>No active projects</h3><p>Create one when an outcome becomes real work.</p></div>}
      {completedProjects.length > 0 && <button className={styles.completedLink} type="button" onClick={() => setCompletedOpen(true)}>Completed projects <span>{completedProjects.length}</span></button>}
    </section>

    <section className={styles.workSection}>
      <div className={styles.sectionHeader}>
        <div><span className="section-kicker">Not inside a project</span><h2>Open tensions</h2></div>
        <span className={styles.sectionCount}>{unlinkedTensions.length}</span>
      </div>
      {unlinkedTensions.length ? <div className={styles.tensionGrid}>{unlinkedTensions.map((tension) => {
        const actionCount = openActions.filter((action) => action.sourceTensionId === tension.id).length;
        const meta = tensionPreviewMeta(tension, props.personName);
        return <button className={styles.tensionCard} type="button" key={tension.id} onClick={() => props.onTarget({ kind: "tension", id: tension.id })}>
          <span className={styles.tensionVisualMark} aria-hidden="true">!</span>
          <span className={styles.tensionCardCopy}>
            <span className={styles.tensionMetaRow}><span className={styles.personAvatarSmall}>{props.personInitial(tension.raiserId)}</span><span className={styles.statusChip}>{meta.status}</span>{meta.stateLabel && <span className={styles.needChip}>{meta.stateLabel}</span>}</span>
            <strong>{tension.title}</strong>
            {meta.secondary && <span className={styles.tensionState}>{meta.secondary}</span>}
          </span>
          <span className={styles.tensionCardMeta}>{actionCount ? <><b aria-hidden="true">→</b>{actionCount}</> : "Open →"}</span>
        </button>;
      })}</div> : <div className={styles.emptyLine}>No unlinked tensions. Tensions connected to projects are shown with their project.</div>}
    </section>

    {createOpen === "project" && <ProjectCreateModal people={props.workspace.people} currentUserId={props.currentUserId} onClose={() => setCreateOpen(null)} onSave={async (input) => { if (await props.onAddProject(input)) setCreateOpen(null); }} />}
    {createOpen === "tension" && <TensionCreateModal projects={activeProjects} onClose={() => setCreateOpen(null)} onSave={async (title, projectId) => { if (await props.onRaise(title, projectId)) setCreateOpen(null); }} />}
    {commitmentsOpen && <CommitmentsPanel workspace={props.workspace} currentUserId={props.currentUserId} personName={props.personName} onStatus={props.onActionStatus} onOpen={(target) => { setCommitmentsOpen(false); props.onTarget(target); }} onClose={() => setCommitmentsOpen(false)} />}
  </>;
}

function ProjectActivityIndicator({ projectId, linkedTensionIds }: { projectId: string; linkedTensionIds: string[] }) {
  const [unread, setUnread] = useState(0);
  const linkedKey = linkedTensionIds.join("|");

  const refresh = useCallback(async () => {
    try {
      const tensionIds = linkedKey ? linkedKey.split("|") : [];
      const summaries = await Promise.all([
        loadCommentThreadSummary("project", projectId),
        ...tensionIds.map((id) => loadCommentThreadSummary("tension", id)),
      ]);
      setUnread(summaries.reduce((sum, summary) => sum + summary.unreadCount, 0));
    } catch {
      setUnread(0);
    }
  }, [projectId, linkedKey]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onThreadEvent = () => void refresh();
    window.addEventListener("focus", onFocus);
    window.addEventListener("comment-thread-seen", onThreadEvent);
    window.addEventListener("comment-thread-changed", onThreadEvent);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("comment-thread-seen", onThreadEvent);
      window.removeEventListener("comment-thread-changed", onThreadEvent);
    };
  }, [refresh]);

  if (!unread) return null;
  return <span className={styles.activityBadge}>{unread} new {unread === 1 ? "comment" : "comments"}</span>;
}

function formatRecentDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "yesterday";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function tensionPreviewMeta(tension: Tension, personName: (id: string) => string) {
  const status = formatStatus(tension.status);
  const note = tension.latestNote?.trim() ?? "";

  const inputMatch = note.match(/^Needs input or help from (.+?)(?:\s+—|$)/i);
  if (inputMatch?.[1]) {
    const involvedNames = splitPeopleNames(inputMatch[1]);
    return { status, involvedNames, stateLabel: "Needs input", secondary: "" };
  }

  const syncMatch = note.match(/^Needs a real conversation with (.+?)(?:\s+—|$)/i);
  if (syncMatch?.[1]) {
    const involvedNames = splitPeopleNames(syncMatch[1]);
    return { status, involvedNames, stateLabel: "Conversation", secondary: "" };
  }

  if (tension.status === "awaiting_confirmation") {
    return { status, involvedNames: [] as string[], stateLabel: "Confirm", secondary: compactPreview(note) };
  }
  if (tension.status === "governance") {
    return { status, involvedNames: [] as string[], stateLabel: "Governance", secondary: "" };
  }

  return { status, involvedNames: [] as string[], stateLabel: "", secondary: compactPreview(note) };
}

function splitPeopleNames(value: string) {
  return value.split(/,|\band\b/i).map((name) => name.trim()).filter(Boolean);
}

function compactPreview(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > 105 ? `${clean.slice(0, 104).trimEnd()}…` : clean;
}


function formatActionDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function DetailHeader({ kind, title: _title, onBack }: { kind: string; title: string; onBack: () => void }) {
  return <div className={styles.detailHeader}>
    <button className={styles.backButton} type="button" onClick={onBack}>← Work</button>
    <span className="section-kicker">{kind}</span>
  </div>;
}

function CommitmentsPanel({ workspace, currentUserId, personName, onStatus, onOpen, onClose }: {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  onStatus: (id: string, status: "open" | "done") => Promise<unknown>;
  onOpen: (target: Exclude<RedesignWorkTarget, null>) => void;
  onClose: () => void;
}) {
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const [busyActionId, setBusyActionId] = useState<string | null>(null);
  const actions = workspace.actions.filter((action) => action.status === "open" || action.status === "proposed");
  const projects = new Map(workspace.projects.map((project) => [project.id, project]));
  const tensions = new Map(workspace.tensions.map((tension) => [tension.id, tension]));
  const mine = actions.filter((action) => action.ownerId === currentUserId);
  const proposedMine = mine.filter((action) => action.status === "proposed");
  const openMine = mine.filter((action) => action.status === "open");
  const others = actions.filter((action) => action.ownerId !== currentUserId);
  const waitingByOwner = workspace.people
    .map((person) => ({ person, actions: others.filter((action) => action.ownerId === person.id) }))
    .filter((group) => group.actions.length > 0)
    .sort((a, b) => b.actions.length - a.actions.length || a.person.name.localeCompare(b.person.name));
  const overdueMine = openMine.filter((action) => isOverdue(action.due)).length;

  function targetFor(action: Action): Exclude<RedesignWorkTarget, null> | null {
    if (action.sourceTensionId && tensions.has(action.sourceTensionId)) return { kind: "tension", id: action.sourceTensionId };
    if (action.projectId && projects.has(action.projectId)) return { kind: "project", id: action.projectId };
    return null;
  }

  function contextFor(action: Action) {
    const tension = action.sourceTensionId ? tensions.get(action.sourceTensionId) : undefined;
    const project = action.projectId ? projects.get(action.projectId) : undefined;
    if (tension) return { kind: "Tension", title: tension.title };
    if (project) return { kind: "Project", title: project.title };
    return { kind: "Commitment", title: action.source ?? "No linked work object" };
  }

  async function changeStatus(action: Action, status: "open" | "done") {
    if (busyActionId) return;
    setBusyActionId(action.id);
    try {
      await onStatus(action.id, status);
    } finally {
      setBusyActionId(null);
    }
  }

  const renderCard = (action: Action, mode: "mine" | "waiting") => {
    const context = contextFor(action);
    const target = targetFor(action);
    const due = commitmentDue(action.due);
    const proposed = action.status === "proposed";
    return <article
      className={`${styles.commitmentCard} ${mode === "mine" ? styles.commitmentCardMine : styles.commitmentCardWaiting} ${proposed ? styles.commitmentCardProposed : ""} ${due.tone === "overdue" ? styles.commitmentCardOverdue : ""}`}
      key={action.id}
    >
      <div className={styles.commitmentCardHead}>
        <div className={styles.commitmentIdentity}>
          <span className={`${styles.commitmentStatus} ${proposed ? styles.commitmentStatusProposed : styles.commitmentStatusOpen}`}>{proposed ? (mode === "mine" ? "Proposed to you" : "Awaiting acceptance") : mode === "mine" ? "Owned by you" : "Open commitment"}</span>
          {due.label && <span className={`${styles.commitmentDue} ${due.tone === "overdue" ? styles.commitmentDueOverdue : due.tone === "soon" ? styles.commitmentDueSoon : ""}`}>{due.label}</span>}
        </div>
        {mode === "waiting" && <span className={styles.commitmentPerson}><span>{personName(action.ownerId).charAt(0).toUpperCase()}</span>{personName(action.ownerId)}</span>}
      </div>

      <h3>{action.title}</h3>

      <button
        className={styles.commitmentSource}
        type="button"
        disabled={!target}
        onClick={() => target && onOpen(target)}
      >
        <span>{context.kind}</span>
        <strong>{context.title}</strong>
        {target && <i aria-hidden="true">→</i>}
      </button>

      <div className={styles.commitmentActions}>
        {mode === "mine" && proposed && <button className="primary small" type="button" disabled={busyActionId === action.id} onClick={() => void changeStatus(action, "open")}>{busyActionId === action.id ? "Accepting…" : "Accept"}</button>}
        {mode === "mine" && !proposed && <button className="primary small" type="button" disabled={busyActionId === action.id} onClick={() => void changeStatus(action, "done")}>{busyActionId === action.id ? "Saving…" : "Done"}</button>}
        <button className="secondary small" type="button" onClick={() => setEditingAction(action)}>Edit</button>
        {target && <button className="quiet small" type="button" onClick={() => onOpen(target)}>Open context</button>}
      </div>
    </article>;
  };

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.commitmentCockpit} role="dialog" aria-modal="true">
      <div className={styles.commitmentCockpitHead}>
        <div>
          <span className="section-kicker">Work</span>
          <h2>Commitments</h2>
          <p>Who has agreed to do what — and what needs movement now.</p>
        </div>
        <button className="quiet editor-close" type="button" onClick={onClose}>×</button>
      </div>

      <div className={styles.commitmentSummary}>
        <div className={styles.commitmentSummaryPrimary}>
          <span>Yours</span>
          <strong>{mine.length}</strong>
          <small>{proposedMine.length ? `${proposedMine.length} waiting for your acceptance` : "Accepted or ready to complete"}</small>
        </div>
        <div><span>Overdue</span><strong>{overdueMine}</strong><small>Your accepted commitments</small></div>
        <div><span>Waiting on others</span><strong>{others.length}</strong><small>Across {waitingByOwner.length} {waitingByOwner.length === 1 ? "person" : "people"}</small></div>
      </div>

      <div className={styles.commitmentCockpitScroll}>
        <section className={styles.commitmentSection}>
          <div className={styles.commitmentSectionHead}>
            <div><span className="section-kicker">Your work</span><h3>My commitments</h3></div>
            <span className={styles.commitmentSectionCount}>{mine.length}</span>
          </div>

          {proposedMine.length > 0 && <div className={styles.commitmentSubsection}>
            <div className={styles.commitmentSubhead}><strong>Proposed to you</strong><span>{proposedMine.length}</span></div>
            <div className={styles.commitmentCardGrid}>{proposedMine.map((action) => renderCard(action, "mine"))}</div>
          </div>}

          {openMine.length > 0 && <div className={styles.commitmentSubsection}>
            <div className={styles.commitmentSubhead}><strong>Accepted</strong><span>{openMine.length}</span></div>
            <div className={styles.commitmentCardGrid}>{openMine.map((action) => renderCard(action, "mine"))}</div>
          </div>}

          {!mine.length && <div className={styles.commitmentEmpty}><span>✓</span><div><strong>No active commitments assigned to you.</strong><small>Anything explicitly needing you will still appear in My Attention.</small></div></div>}
        </section>

        <section className={styles.commitmentSection}>
          <div className={styles.commitmentSectionHead}>
            <div><span className="section-kicker">Dependencies</span><h3>Waiting on others</h3></div>
            <span className={styles.commitmentSectionCount}>{others.length}</span>
          </div>

          {waitingByOwner.length > 0 ? <div className={styles.waitingGroups}>
            {waitingByOwner.map((group, index) => {
              const overdue = group.actions.filter((action) => isOverdue(action.due)).length;
              const proposed = group.actions.filter((action) => action.status === "proposed").length;
              return <details className={styles.waitingGroup} key={group.person.id} open={index === 0}>
                <summary>
                  <span className={styles.waitingAvatar}>{group.person.name.charAt(0)}</span>
                  <span className={styles.waitingName}><strong>{group.person.name}</strong><small>{proposed ? `${proposed} awaiting acceptance` : "Accepted commitments"}{overdue ? ` · ${overdue} overdue` : ""}</small></span>
                  <span className={styles.waitingCount}>{group.actions.length}</span>
                  <span className={styles.waitingChevron}>⌄</span>
                </summary>
                <div className={styles.commitmentCardGrid}>{group.actions.map((action) => renderCard(action, "waiting"))}</div>
              </details>;
            })}
          </div> : <div className={styles.commitmentEmpty}><span>○</span><div><strong>Nothing is currently waiting on somebody else.</strong><small>Shared commitments will appear here by owner.</small></div></div>}
        </section>
      </div>

      {editingAction && <CommitmentEditModal
        action={editingAction}
        people={workspace.people}
        currentUserId={currentUserId}
        onClose={() => setEditingAction(null)}
        onChanged={() => {
          setEditingAction(null);
          window.dispatchEvent(new Event("focus"));
        }}
      />}
    </section>
  </div>;
}

function CommitmentEditModal({ action, people, currentUserId, onClose, onChanged }: {
  action: Action;
  people: WorkspacePerson[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(action.title);
  const [ownerId, setOwnerId] = useState(action.ownerId);
  const [due, setDue] = useState(action.due ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim() || !ownerId || saving) return;
    setSaving(true);
    setError("");
    try {
      await updateActionDetails(action.id, {
        title,
        ownerId,
        due: due || undefined,
        currentUserId,
        currentOwnerId: action.ownerId,
        currentStatus: action.status,
      });
      onChanged();
    } catch (err) {
      setError(readError(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (saving || !window.confirm("Remove this next step from active work?")) return;
    setSaving(true);
    setError("");
    try {
      await removeAction(action.id);
      onChanged();
    } catch (err) {
      setError(readError(err));
      setSaving(false);
    }
  }

  return <div className={styles.commitmentEditBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal context-step-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Edit commitment</span><h2>Correct the next step</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <label className="field"><span>What needs to happen?</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      <label className="field"><span>Due date <em>optional</em></span><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
      {ownerId !== action.ownerId && ownerId !== currentUserId && <p className="context-step-note">Changing the owner will propose this commitment to {people.find((person) => person.id === ownerId)?.name ?? "this person"}. They must accept it first.</p>}
      {error && <div className="auth-message error">{error}</div>}
      <div className="editor-actions"><button className="quiet" type="button" disabled={saving} onClick={() => void remove()}>Remove</button><div className="editor-actions-right"><button className="secondary" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!title.trim() || !ownerId || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</button></div></div>
    </section>
  </div>;
}

function isOverdue(due?: string) {
  return Boolean(due && due < todayLocalISO());
}

function commitmentDue(due?: string): { label: string; tone: "normal" | "soon" | "overdue" } {
  if (!due) return { label: "", tone: "normal" };
  const today = todayLocalISO();
  if (due < today) return { label: `Overdue · ${formatActionDate(due)}`, tone: "overdue" };
  if (due === today) return { label: "Due today", tone: "soon" };
  const dueDate = new Date(`${due}T12:00:00`).getTime();
  const todayDate = new Date(`${today}T12:00:00`).getTime();
  const days = Math.round((dueDate - todayDate) / 86_400_000);
  if (days <= 7) return { label: `Due ${formatActionDate(due)}`, tone: "soon" };
  return { label: `Due ${formatActionDate(due)}`, tone: "normal" };
}

function todayLocalISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function ProjectCreateModal({ people, currentUserId, onClose, onSave }: {
  people: WorkspacePerson[];
  currentUserId: string;
  onClose: () => void;
  onSave: (input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [participants, setParticipants] = useState<string[]>([currentUserId]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">New project</span><h2>What outcome are we working toward?</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <label className="field"><span>Project</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => { const id = event.target.value; setOwnerId(id); setParticipants((items) => items.includes(id) ? items : [...items, id]); }}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
      <div className="field"><span>People involved</span><div className="people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={(event) => setParticipants((items) => event.target.checked ? [...new Set([...items, person.id])] : person.id === ownerId ? items : items.filter((id) => id !== person.id))} />{person.name}</label>)}</div></div>
      <label className="field"><span>Current state <em>optional</em></span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
      <div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!title.trim()} onClick={() => void onSave({ title, ownerId, participantIds: [...new Set([ownerId, ...participants])], summary })}>Save project</button></div></div>
    </section>
  </div>;
}

function TensionCreateModal({ projects, onClose, onSave }: {
  projects: WorkspaceData["projects"];
  onClose: () => void;
  onSave: (title: string, projectId?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">New tension</span><h2>What could be better?</h2><p className="editor-note">You do not need to know the solution yet.</p></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <label className="field"><span>Tension</span><textarea autoFocus rows={4} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Project <em>optional</em></span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
      <div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!title.trim()} onClick={() => void onSave(title.trim(), projectId || undefined)}>Raise tension</button></div></div>
    </section>
  </div>;
}

function formatStatus(status: Tension["status"]) {
  if (status === "needs_sync") return "needs conversation";
  if (status === "awaiting_confirmation") return "awaiting confirmation";
  return status;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The commitment could not be updated.";
}
