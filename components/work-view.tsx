"use client";

import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/domain";
import { ContextualNextSteps, type ContextualNextStepInput } from "@/components/contextual-next-steps";
import { ProjectCoiBadge } from "@/components/project-coi-badge";
import { ProjectCommentsModal } from "@/components/project-comments-modal";
import { ProjectSettingsModal } from "@/components/project-settings-modal";
import { ProjectSummaryPreview } from "@/components/project-summary-preview";
import { WorkAttachmentsButton } from "@/components/work-attachments";
import {
  loadProjectUpdates,
  type ProjectUpdateEntry,
  type WorkspaceData,
  type WorkspacePerson,
} from "@/lib/supabase/workspace";

export function WorkspaceWorkView({
  workspace,
  currentUserId,
  personName,
  personInitial,
  onAddNextStep,
  onAddProject,
  onActionStatus,
  onCompleteProject,
  onReopenProject,
  onSaveProjectSettings,
  onUpdateProject,
  openCommentsProjectId,
  onCommentsOpened,
}: {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  personInitial: (id: string) => string;
  onAddNextStep: (input: ContextualNextStepInput) => Promise<boolean>;
  onAddProject: (input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<boolean>;
  onActionStatus: (id: string, status: "open" | "done") => Promise<unknown>;
  onCompleteProject: (id: string) => Promise<void>;
  onReopenProject: (id: string) => Promise<void>;
  onSaveProjectSettings: (projectId: string, input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<boolean>;
  onUpdateProject: (id: string) => void;
  openCommentsProjectId?: string | null;
  onCommentsOpened?: () => void;
}) {
  const [projectOpen, setProjectOpen] = useState(false);
  const [historyProject, setHistoryProject] = useState<Project | null>(null);
  const [commentsProject, setCommentsProject] = useState<Project | null>(null);
  const [settingsProject, setSettingsProject] = useState<Project | null>(null);

  const activeProjects = workspace.projects.filter((project) => project.status === "active");
  const completedProjects = workspace.projects.filter((project) => project.status === "complete");
  const openActions = workspace.actions.filter((action) => action.status === "open" || action.status === "proposed");
  const projectById = useMemo(() => new Map(workspace.projects.map((project) => [project.id, project])), [workspace.projects]);

  useEffect(() => {
    if (!openCommentsProjectId) return;
    const project = projectById.get(openCommentsProjectId);
    if (!project) return;
    setCommentsProject(project);
    onCommentsOpened?.();
  }, [openCommentsProjectId, onCommentsOpened, projectById]);

  return <>
    <div className="work-toolbar">
      <button className="primary small" onClick={() => setProjectOpen(true)}>+ Add project</button>
      <span className="work-toolbar-note">Next steps are created inside the project or tension they belong to.</span>
    </div>

    <div className="work-layout">
      <section className="work-main">
        <div className="section-head"><div><span className="section-kicker">Current outcomes</span><h2>Active projects</h2></div></div>
        {activeProjects.length ? <div className="project-grid">{activeProjects.map((project) => <article className="project-card" key={project.id}>
          <div className="project-accent" />
          <span className="kind">{project.role ?? "SDBP project"}</span>
          <h3>{project.title}</h3>
          <ProjectCoiBadge projectId={project.id} personName={personName} />
          {project.summary && <ProjectSummaryPreview title={project.title} text={project.summary} />}
          <div className="project-team-row">{(project.participantIds ?? [project.ownerId]).map((id) => <span className="mini-avatar" title={personName(id)} key={id}>{personInitial(id)}</span>)}</div>
          <div className="project-meta">
            <span><strong>{personName(project.ownerId)}</strong><small>owner</small></span>
            <span><strong>{formatDate(project.lastUpdate)}</strong><small>last checked</small></span>
            <span><strong>{formatDate(project.nextPrompt)}</strong><small>next prompt</small></span>
          </div>
          <ContextualNextSteps parentType="project" parentId={project.id} parentTitle={project.title} actions={workspace.actions} people={workspace.people} currentUserId={currentUserId} personName={personName} onAdd={onAddNextStep} onStatus={onActionStatus} />
          <div className="actions compact-actions project-context-actions">
            {project.ownerId === currentUserId && <button className="secondary small" onClick={() => onUpdateProject(project.id)}>Update</button>}
            <button className="quiet small" onClick={() => setHistoryProject(project)}>History</button>
            <button className="quiet small" onClick={() => setCommentsProject(project)}>Comments</button>
            <WorkAttachmentsButton parentType="project" parentId={project.id} parentTitle={project.title} personName={personName} />
            <button className="quiet small" onClick={() => setSettingsProject(project)}>COI</button>
            <button className="quiet small" onClick={() => setSettingsProject(project)}>Settings</button>
          </div>
        </article>)}</div> : <div className="calm-empty compact-empty"><span>○</span><h3>No active projects yet</h3><p>Add them when they become real work.</p></div>}

        {completedProjects.length > 0 && <details className="completed-projects">
          <summary>Completed projects <span>{completedProjects.length}</span></summary>
          <div className="completed-project-list">{completedProjects.map((project) => <div className="completed-project-row" key={project.id}><div><strong>{project.title}</strong><small>{personName(project.ownerId)} · completed</small></div><button className="quiet small" type="button" onClick={() => void onReopenProject(project.id)}>Reopen</button></div>)}</div>
        </details>}
      </section>

      <aside className="action-rail">
        <div className="section-head"><div><span className="section-kicker">Aggregate view</span><h2>All commitments</h2></div></div>
        <p className="action-rail-note">These are the same next steps attached to projects and tensions, collected in one place.</p>
        <div className="action-stack">{openActions.length ? openActions.map((action) => {
          const project = action.projectId ? projectById.get(action.projectId) : undefined;
          return <article className="action-slip" key={action.id}>
            <span className="action-status">{action.status}</span>
            <h3>{action.title}</h3>
            {project && <span className="action-project-link">Project · {project.title}</span>}
            {action.source && <p>{action.source}</p>}
            <div className="action-owner"><span className="mini-avatar">{personInitial(action.ownerId)}</span>{personName(action.ownerId)}</div>
            {action.due && <small className={action.due < todayISO() ? "action-overdue" : ""}>Due {formatDate(action.due)}</small>}
            {action.status === "proposed" && action.ownerId === currentUserId && <button className="secondary small action-done" onClick={() => void onActionStatus(action.id, "open")}>Accept</button>}
            {action.status === "open" && action.ownerId === currentUserId && <button className="secondary small action-done" onClick={() => void onActionStatus(action.id, "done")}>Mark done</button>}
          </article>;
        }) : <div className="calm-empty compact-empty"><span>✓</span><h3>No open commitments</h3></div>}</div>
      </aside>
    </div>

    {projectOpen && <ProjectCreateModal people={workspace.people} currentUserId={currentUserId} onClose={() => setProjectOpen(false)} onSave={async (input) => { if (await onAddProject(input)) setProjectOpen(false); }} />}
    {historyProject && <ProjectHistoryModal project={historyProject} personName={personName} onClose={() => setHistoryProject(null)} />}
    {commentsProject && <ProjectCommentsModal project={commentsProject} currentUserId={currentUserId} personName={personName} people={workspace.people} onClose={() => setCommentsProject(null)} />}
    {settingsProject && <ProjectSettingsModal project={settingsProject} people={workspace.people} openNextStepCount={workspace.actions.filter((action) => (action.status === "open" || action.status === "proposed") && action.projectId === settingsProject.id).length} onSave={onSaveProjectSettings} onComplete={onCompleteProject} onClose={() => setSettingsProject(null)} />}
  </>;
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

  return <ModalShell kicker="New project" title="What outcome are we working toward?" onClose={onClose}>
    <label className="field"><span>Project</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => { const id = event.target.value; setOwnerId(id); setParticipants((items) => items.includes(id) ? items : [...items, id]); }}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
    <div className="field"><span>People involved</span><div className="people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={(event) => setParticipants((items) => event.target.checked ? [...new Set([...items, person.id])] : person.id === ownerId ? items : items.filter((id) => id !== person.id))} />{person.name}</label>)}</div></div>
    <label className="field"><span>Current state <em>optional</em></span><textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
    <div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!title.trim()} onClick={() => void onSave({ title, ownerId, participantIds: [...new Set([ownerId, ...participants])], summary })}>Save project</button></div></div>
  </ModalShell>;
}

function ProjectHistoryModal({ project, personName, onClose }: { project: Project; personName: (id: string) => string; onClose: () => void }) {
  const [entries, setEntries] = useState<ProjectUpdateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void loadProjectUpdates(project.id).then((result) => { if (alive) setEntries(result); }).catch((err) => { if (alive) setError(readError(err)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [project.id]);

  return <ModalShell kicker="Project history" title={project.title} onClose={onClose}>
    <p className="editor-note">The project card shows the current state. This is the trail of earlier checks and updates.</p>
    {loading ? <div className="project-context-empty">Loading history…</div> : error ? <div className="auth-message error">{error}</div> : entries.length ? <div className="project-history-list">{entries.map((entry) => <article key={entry.id} className="project-history-entry"><div><strong>{historyLabel(entry.updateKind)}</strong><time>{formatTimestamp(entry.createdAt)}</time></div><p>{entry.updateKind === "no_change" ? "No change recorded." : entry.summary || "No current-state text was recorded."}</p><small>{entry.authorId ? personName(entry.authorId) : "Existing state when history was enabled"}</small></article>)}</div> : <div className="project-context-empty">No earlier updates recorded yet.</div>}
  </ModalShell>;
}

function ModalShell({ kicker, title, onClose, children }: { kicker: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor compact-modal project-context-modal" role="dialog" aria-modal="true"><div className="editor-head"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div>{children}</section></div>;
}

function historyLabel(kind: ProjectUpdateEntry["updateKind"]) {
  if (kind === "baseline") return "Earlier current state";
  if (kind === "no_change") return "Checked · no change";
  if (kind === "edit") return "Current state edited";
  return "Project update";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Something could not be loaded.";
}
