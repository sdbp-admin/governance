"use client";

import { useState } from "react";
import type { Tension } from "@/lib/domain";
import { ContextualNextSteps, type ContextualNextStepInput } from "@/components/contextual-next-steps";
import { createTension, type WorkspaceData, type WorkspacePerson } from "@/lib/supabase/workspace";
import { setTensionProject } from "@/lib/supabase/tension-project";
import { TensionAvailabilityPoll } from "@/components/tension-availability-poll";
import { WorkAttachmentsButton } from "@/components/work-attachments";
import { TensionCommentsButton } from "@/components/tension-comments";
import { useLocalDraft } from "@/lib/local-draft";

type Need = "input" | "sync";

type Props = {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  urgentTensionIds: ReadonlySet<string>;
  openCommentsTensionId?: string | null;
  onCommentsOpened?: () => void;
  onRaise: (title: string) => Promise<boolean>;
  onAddNextStep: (input: ContextualNextStepInput) => Promise<boolean>;
  onActionStatus: (id: string, status: "open" | "done") => Promise<unknown>;
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

export function TensionsWorkspaceView(props: Props) {
  const [draftState, setDraftState, clearDraft] = useLocalDraft(`tension:new:${props.currentUserId}`, { text: "", projectId: "" });
  const draft = draftState.text;
  const draftProjectId = draftState.projectId;
  const setDraft = (text: string) => setDraftState((current) => ({ ...current, text }));
  const setDraftProjectId = (projectId: string) => setDraftState((current) => ({ ...current, projectId }));
  const [raising, setRaising] = useState(false);
  const [raiseError, setRaiseError] = useState("");
  const [processing, setProcessing] = useState<string | null>(null);
  const active = props.workspace.tensions.filter((tension) => tension.status !== "resolved");
  const activeProjects = props.workspace.projects.filter((project) => project.status === "active");

  async function raise() {
    if (!draft.trim() || raising) return;
    if (!draftProjectId) {
      if (await props.onRaise(draft)) {
        clearDraft();
        setRaiseError("");
      }
      return;
    }

    setRaising(true);
    setRaiseError("");
    try {
      await createTension({ title: draft, raiserId: props.currentUserId, projectId: draftProjectId });
      clearDraft();
      window.dispatchEvent(new Event("focus"));
    } catch (error) {
      setRaiseError(readError(error));
    } finally {
      setRaising(false);
    }
  }

  return <>
    <div className="tension-composer">
      <div className="composer-copy"><span className="section-kicker">Raise a tension</span><h2>What could be better?</h2><p>You do not need to know the solution yet.</p></div>
      <div className="composer-input">
        <textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Something is unclear, blocked or could work better…"/>
        <div className="tension-raise-meta">
          <label className="tension-project-select"><span>Project <em>optional</em></span><select value={draftProjectId} onChange={(event) => setDraftProjectId(event.target.value)}><option value="">No project</option>{activeProjects.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
          <button className="primary" disabled={!draft.trim() || raising} onClick={() => void raise()}>{raising ? "Raising…" : "Raise tension"}</button>
        </div>
        {raiseError && <small className="tension-project-error">{raiseError}</small>}
      </div>
    </div>
    <section className="section">
      <div className="section-head"><div><span className="section-kicker">Open</span><h2>Tensions that still exist</h2></div><span className="counter">{active.length}</span></div>
      <div className="tension-stream">{active.map((tension) => <TensionCard key={tension.id} tension={tension} processing={processing} setProcessing={setProcessing} {...props} />)}</div>
    </section>
  </>;
}

function TensionCard(props: Props & { tension: Tension; processing: string | null; setProcessing: (id: string | null) => void }) {
  const tension = props.tension;
  const mine = tension.raiserId === props.currentUserId;
  const processable = tension.status === "open" || tension.status === "needs_sync";
  const hasNeed = Boolean(tension.latestNote);
  const urgent = props.urgentTensionIds.has(tension.id);
  const linkedProject = tension.linkedProjectId ? props.workspace.projects.find((project) => project.id === tension.linkedProjectId) : undefined;

  return <article className={`tension-card${urgent ? " urgent-tension-card" : ""}`}>
    <div className="tension-line" />
    <div className="tension-content">
      <div className="tension-meta">
        <span>Raised by {props.personName(tension.raiserId)}</span>
        <span className="tension-meta-status">{urgent && <span className="urgency-badge">Urgent</span>}<span>{label(tension.status)}</span></span>
      </div>
      <h3>{tension.title}</h3>
      <TensionProjectLink tension={tension} linkedProject={linkedProject} projects={props.workspace.projects} />
      {tension.latestNote && <p>{tension.latestNote}</p>}
      <ContextualNextSteps parentType="tension" parentId={tension.id} parentTitle={tension.title} projectId={tension.linkedProjectId} actions={props.workspace.actions} people={props.workspace.people} currentUserId={props.currentUserId} personName={props.personName} onAdd={props.onAddNextStep} onStatus={props.onActionStatus} />

      {tension.status === "needs_sync" && <TensionAvailabilityPoll tension={tension} currentUserId={props.currentUserId} personName={props.personName} onCreate={props.onCreatePoll} onVote={props.onVotePoll} onChoose={props.onChoosePoll} />}

      {tension.status === "awaiting_confirmation" && mine && <div className="tension-process-panel">
        <span className="kind">Resolution check</span>
        <h4>{props.personName(tension.resolutionProposedBy ?? "")} believes this is resolved. Is it resolved for you?</h4>
        <div className="process-actions"><button className="secondary" onClick={() => void props.onKeepOpen(tension)}>No, keep open</button><button className="primary" onClick={() => void props.onResolve(tension, `${props.personName(props.currentUserId)} confirmed the tension is resolved.`)}>Yes, resolved</button></div>
      </div>}

      {props.processing === tension.id && mine && processable && <Process tension={tension} people={props.workspace.people} currentUserId={props.currentUserId} onClose={() => props.setProcessing(null)} onNeed={props.onNeed} onMoveGovernance={props.onMoveGovernance} />}

      {mine && processable && hasNeed && props.processing !== tension.id && <div className="tension-resolution-check">
        <span className="kind">Check the real situation</span><h4>Did you get what you need?</h4><p>If yes, close the tension. If not, adjust what would help.</p>
        <div className="process-actions"><button className="secondary" onClick={() => props.setProcessing(tension.id)}>Not yet · adjust</button><button className="primary" onClick={() => void props.onResolve(tension, `${props.personName(props.currentUserId)} got what was needed and resolved the tension.`)}>Yes, resolved</button></div>
      </div>}
    </div>

    <div className="actions compact-actions tension-object-actions">
      {props.processing !== tension.id && processable && !hasNeed && mine && <button className="secondary" onClick={() => props.setProcessing(tension.id)}>What do you need? →</button>}
      {props.processing !== tension.id && processable && !hasNeed && <button className="quiet" onClick={() => void props.onMarkResolved(tension)}>Resolve</button>}
      {props.processing !== tension.id && processable && hasNeed && !mine && <button className="quiet" onClick={() => void props.onMarkResolved(tension)}>Looks resolved</button>}
      <TensionCommentsButton tension={tension} currentUserId={props.currentUserId} personName={props.personName} people={props.workspace.people} forceOpen={props.openCommentsTensionId === tension.id} onOpened={props.openCommentsTensionId === tension.id ? props.onCommentsOpened : undefined} />
      <WorkAttachmentsButton parentType="tension" parentId={tension.id} parentTitle={tension.title} personName={props.personName} />
      {mine && <button className={urgent ? "secondary small" : "quiet small"} type="button" onClick={() => void props.onUrgency(tension, !urgent)}>{urgent ? "Remove urgent flag" : "Mark urgent"}</button>}
    </div>
  </article>;
}

function TensionProjectLink({ tension, linkedProject, projects }: {
  tension: Tension;
  linkedProject?: WorkspaceData["projects"][number];
  projects: WorkspaceData["projects"];
}) {
  const [editing, setEditing] = useState(false);
  const [projectId, setProjectId] = useState(tension.linkedProjectId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const choices = projects.filter((project) => project.status === "active" || project.id === tension.linkedProjectId);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await setTensionProject(tension.id, projectId || null);
      setEditing(false);
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) return <button className={linkedProject ? "tension-project-chip tension-project-button" : "tension-project-empty"} type="button" title="Organise this tension under a project" onClick={() => { setProjectId(tension.linkedProjectId ?? ""); setEditing(true); }}>{linkedProject ? `Project · ${linkedProject.title}` : "+ Link project"}</button>;

  return <div className="tension-project-editor">
    <select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">No project</option>{choices.map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select>
    <button className="primary small" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : "Save"}</button>
    <button className="quiet small" type="button" onClick={() => setEditing(false)}>Cancel</button>
    {error && <small className="tension-project-error">{error}</small>}
  </div>;
}

function Process({ tension, people, currentUserId, onClose, onNeed, onMoveGovernance }: {
  tension: Tension;
  people: WorkspacePerson[];
  currentUserId: string;
  onClose: () => void;
  onNeed: (tension: Tension, kind: Need, ids: string[], detail: string) => Promise<boolean>;
  onMoveGovernance: (tension: Tension) => Promise<void>;
}) {
  const [choice, setChoice] = useState<Need | "governance" | null>(tension.status === "needs_sync" ? "sync" : null);
  const [ids, setIds] = useState<string[]>([]);
  const [detail, setDetail] = useState("");
  const available = people.filter((person) => person.id !== currentUserId);

  async function save(kind: Need) {
    if (ids.length && await onNeed(tension, kind, ids, detail)) onClose();
  }

  return <div className="tension-process-panel">
    <span className="kind">Process tension</span><h4>What do you need now?</h4>
    <div className="outcome-grid compact-outcomes">{[["input", "Input or help"], ["governance", "Change how we work"], ["sync", "Real conversation"]].map(([id, text]) => <button key={id} className={choice === id ? "outcome-option selected" : "outcome-option"} onClick={() => setChoice(id as Need | "governance")}><strong>{text}</strong></button>)}</div>
    {(choice === "input" || choice === "sync") && <div className="outcome-form">
      <p>{choice === "sync" ? "Choose who should be involved. After saving, you can optionally add a simple availability poll." : "Choose the people who may help, then reach out in whatever way is quickest."}</p>
      <Picker people={available} selected={ids} setSelected={setIds} />
      <label className="field"><span>{choice === "sync" ? "What needs to be worked through?" : "What do you need?"} <em>optional</em></span><textarea rows={3} value={detail} onChange={(event) => setDetail(event.target.value)} /></label>
      <button className="primary small" disabled={!ids.length} onClick={() => void save(choice)}>Keep {choice === "sync" ? "conversation" : "this"} visible</button>
    </div>}
    {choice === "governance" && <div className="outcome-form"><p>Use this when an ongoing role, responsibility, authority or standing way of working should change.</p><button className="primary small" onClick={() => void onMoveGovernance(tension)}>Move to Governance</button></div>}
    <div className="process-actions"><button className="quiet" onClick={onClose}>Close</button></div>
  </div>;
}

function Picker({ people, selected, setSelected }: { people: WorkspacePerson[]; selected: string[]; setSelected: (ids: string[]) => void }) {
  return <div className="field"><span>Who do you need?</span><div className="people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={selected.includes(person.id)} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, person.id])] : selected.filter((id) => id !== person.id))}/>{person.name}</label>)}</div></div>;
}

function label(status: Tension["status"]) {
  return status === "awaiting_confirmation" ? "awaiting confirmation" : status === "needs_sync" ? "needs conversation" : status;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The project link could not be saved.";
}
