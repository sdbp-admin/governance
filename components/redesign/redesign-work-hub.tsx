"use client";

import { useEffect, useMemo, useState } from "react";
import type { Tension } from "@/lib/domain";
import type { ContextualNextStepInput } from "@/components/contextual-next-steps";
import { WorkspaceWorkView } from "@/components/work-view";
import { TensionsWorkspaceView } from "@/components/tensions-workspace-view";
import type { WorkspaceData, WorkspacePerson } from "@/lib/supabase/workspace";
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
        <button className="quiet small" type="button" onClick={() => setCommitmentsOpen(true)}>All commitments <span className={styles.inlineCount}>{openActions.length}</span></button>
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
          const tensionCount = tensionCountByProject.get(project.id) ?? 0;
          const actionCount = actionCountByProject.get(project.id) ?? 0;
          return <article className={styles.projectCard} key={project.id}>
            <div className={styles.projectTopline}><span>Project</span><span>{props.personName(project.ownerId)}</span></div>
            <h3>{project.title}</h3>
            {project.summary && <p className={styles.summary}>{project.summary}</p>}
            <div className={styles.objectMeta}>
              <span>{tensionCount} {tensionCount === 1 ? "tension" : "tensions"}</span>
              <span>{actionCount} {actionCount === 1 ? "next step" : "next steps"}</span>
            </div>
            {linked.length > 0 && <div className={styles.linkedTensions}>
              {linked.slice(0, 3).map((tension) => <button type="button" key={tension.id} onClick={() => props.onTarget({ kind: "tension", id: tension.id })}>
                <span className={styles.tensionDot} aria-hidden="true" />
                <span><strong>{tension.title}</strong>{tension.latestNote && <small>{tension.latestNote}</small>}</span>
              </button>)}
              {linked.length > 3 && <small className={styles.moreLinked}>+ {linked.length - 3} more tensions</small>}
            </div>}
            <button className={styles.openObject} type="button" onClick={() => props.onTarget({ kind: "project", id: project.id })}>Open project <span>→</span></button>
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
        return <button className={styles.tensionCard} type="button" key={tension.id} onClick={() => props.onTarget({ kind: "tension", id: tension.id })}>
          <span className={styles.tensionDot} aria-hidden="true" />
          <span className={styles.tensionCardCopy}><small>{props.personName(tension.raiserId)} · {formatStatus(tension.status)}</small><strong>{tension.title}</strong>{tension.latestNote && <span>{tension.latestNote}</span>}</span>
          <span className={styles.tensionCardMeta}>{actionCount ? `${actionCount} next ${actionCount === 1 ? "step" : "steps"}` : "Open"} →</span>
        </button>;
      })}</div> : <div className={styles.emptyLine}>No unlinked tensions. Tensions connected to projects are shown with their project.</div>}
    </section>

    {createOpen === "project" && <ProjectCreateModal people={props.workspace.people} currentUserId={props.currentUserId} onClose={() => setCreateOpen(null)} onSave={async (input) => { if (await props.onAddProject(input)) setCreateOpen(null); }} />}
    {createOpen === "tension" && <TensionCreateModal projects={activeProjects} onClose={() => setCreateOpen(null)} onSave={async (title, projectId) => { if (await props.onRaise(title, projectId)) setCreateOpen(null); }} />}
    {commitmentsOpen && <CommitmentsPanel workspace={props.workspace} currentUserId={props.currentUserId} personName={props.personName} onStatus={props.onActionStatus} onOpen={(target) => { setCommitmentsOpen(false); props.onTarget(target); }} onClose={() => setCommitmentsOpen(false)} />}
  </>;
}

function DetailHeader({ kind, title, onBack }: { kind: string; title: string; onBack: () => void }) {
  return <div className={styles.detailHeader}>
    <button className={styles.backButton} type="button" onClick={onBack}>← Work</button>
    <div><span className="section-kicker">{kind}</span><h2>{title}</h2></div>
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
  const actions = workspace.actions.filter((action) => action.status === "open" || action.status === "proposed");
  const projects = new Map(workspace.projects.map((project) => [project.id, project]));
  const tensions = new Map(workspace.tensions.map((tension) => [tension.id, tension]));
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Work</span><h2>All commitments</h2><p className="editor-note">Concrete next steps across projects and tensions.</p></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <div className={styles.commitmentList}>{actions.map((action) => {
        const project = action.projectId ? projects.get(action.projectId) : undefined;
        const tension = action.sourceTensionId ? tensions.get(action.sourceTensionId) : undefined;
        return <article className={styles.commitmentRow} key={action.id}>
          <button className={styles.commitmentContext} type="button" disabled={!project && !tension} onClick={() => tension ? onOpen({ kind: "tension", id: tension.id }) : project ? onOpen({ kind: "project", id: project.id }) : undefined}>
            <small>{tension ? "Tension" : project ? "Project" : "Commitment"}</small>
            <strong>{action.title}</strong>
            <span>{tension?.title ?? project?.title ?? action.source ?? "No linked work object"}</span>
          </button>
          <div className={styles.commitmentOwner}><span>{personName(action.ownerId)}</span>{action.ownerId === currentUserId && action.status === "proposed" && <button className="secondary small" type="button" onClick={() => void onStatus(action.id, "open")}>Accept</button>}{action.ownerId === currentUserId && action.status === "open" && <button className="quiet small" type="button" onClick={() => void onStatus(action.id, "done")}>Done</button>}</div>
        </article>;
      })}</div>
      {!actions.length && <div className="calm-empty compact-empty"><span>✓</span><h3>No open commitments</h3></div>}
    </section>
  </div>;
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
