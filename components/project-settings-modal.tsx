"use client";

import { useEffect, useMemo, useState } from "react";
import type { Project } from "@/lib/domain";
import type { WorkspacePerson } from "@/lib/supabase/workspace";
import {
  announceProjectConflictChange,
  declareProjectConflict,
  endProjectConflict,
  loadProjectConflicts,
  type ProjectConflict,
} from "@/lib/supabase/project-coi";

export function ProjectSettingsModal({ project, people, openNextStepCount, onSave, onComplete, onClose }: {
  project: Project;
  people: WorkspacePerson[];
  openNextStepCount: number;
  onSave: (projectId: string, input: { title: string; ownerId: string; participantIds: string[]; summary: string }) => Promise<boolean>;
  onComplete: (projectId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(project.title);
  const [summary, setSummary] = useState(project.summary);
  const [ownerId, setOwnerId] = useState(project.ownerId);
  const [participants, setParticipants] = useState<string[]>(project.participantIds ?? [project.ownerId]);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [coiFormOpen, setCoiFormOpen] = useState(false);
  const [coiPersonId, setCoiPersonId] = useState("");
  const [coiReason, setCoiReason] = useState("");
  const [coiSaving, setCoiSaving] = useState(false);
  const [coiError, setCoiError] = useState("");

  const conflictedIds = useMemo(() => new Set(conflicts.map((conflict) => conflict.personId)), [conflicts]);
  const availablePeople = useMemo(() => people.filter((person) => !conflictedIds.has(person.id)), [people, conflictedIds]);
  const personName = (id: string) => people.find((person) => person.id === id)?.name ?? "Unknown";

  async function refreshConflicts() {
    setConflicts(await loadProjectConflicts(project.id));
  }

  useEffect(() => {
    let alive = true;
    void loadProjectConflicts(project.id)
      .then((items) => { if (alive) setConflicts(items); })
      .catch((error) => { if (alive) setCoiError(readError(error)); });
    return () => { alive = false; };
  }, [project.id]);

  async function save() {
    if (!title.trim() || !ownerId || saving) return;
    setSaving(true);
    const ok = await onSave(project.id, {
      title: title.trim(),
      ownerId,
      participantIds: [...new Set([ownerId, ...participants])],
      summary,
    });
    setSaving(false);
    if (ok) onClose();
  }

  async function complete() {
    if (completing) return;
    const extra = openNextStepCount > 0
      ? ` ${openNextStepCount} open ${openNextStepCount === 1 ? "next step" : "next steps"} will stay open and can still be completed separately.`
      : "";
    if (!window.confirm(`Complete “${project.title}”? It will move out of Active Projects.${extra}`)) return;
    setCompleting(true);
    await onComplete(project.id);
    setCompleting(false);
    onClose();
  }

  async function addConflict() {
    if (!coiPersonId || !coiReason.trim() || coiSaving) return;
    setCoiSaving(true);
    setCoiError("");
    try {
      await declareProjectConflict(project.id, coiPersonId, coiReason);
      setCoiPersonId("");
      setCoiReason("");
      setCoiFormOpen(false);
      await refreshConflicts();
      announceProjectConflictChange(project.id);
    } catch (error) {
      setCoiError(readError(error));
    } finally {
      setCoiSaving(false);
    }
  }

  async function endConflict(conflict: ProjectConflict) {
    if (coiSaving) return;
    if (!window.confirm(`End the conflict of interest for ${personName(conflict.personId)} on this project?`)) return;
    setCoiSaving(true);
    setCoiError("");
    try {
      await endProjectConflict(conflict.id);
      await refreshConflicts();
      announceProjectConflictChange(project.id);
    } catch (error) {
      setCoiError(readError(error));
    } finally {
      setCoiSaving(false);
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal project-context-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Project settings</span><h2>{project.title}</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">Maintain the project definition here. Editing these fields does not reset the normal project-update rhythm.</p>
      <label className="field"><span>Project name</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => { const id = event.target.value; setOwnerId(id); setParticipants((items) => items.includes(id) ? items : [...items, id]); }}>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      <div className="field"><span>People involved</span><div className="people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={(event) => setParticipants((items) => event.target.checked ? [...new Set([...items, person.id])] : person.id === ownerId ? items : items.filter((id) => id !== person.id))} />{person.name}</label>)}</div></div>
      <label className="field"><span>Current state <em>optional</em></span><textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>

      <div className="project-coi-settings">
        <div className="project-coi-settings-head"><div><strong>Conflict of interest</strong><p>Attach a COI to a person when an outside interest can affect this project. The project stays visible; file and link contents are protected from that person. Visible comments and titles remain the board&apos;s responsibility.</p></div>{!coiFormOpen && availablePeople.length > 0 && <button className="secondary small" type="button" onClick={() => setCoiFormOpen(true)}>+ Add COI</button>}</div>
        {conflicts.length > 0 && <div className="project-coi-settings-list">{conflicts.map((conflict) => <div className="project-coi-settings-row" key={conflict.id}><div><strong>{personName(conflict.personId)}</strong><span>{conflict.reason}</span><small>Declared by {personName(conflict.declaredBy)} · {formatDate(conflict.declaredAt)}</small></div><button className="quiet small danger-quiet" type="button" disabled={coiSaving} onClick={() => void endConflict(conflict)}>End COI</button></div>)}</div>}
        {coiFormOpen && <div className="project-coi-form">
          <label className="field"><span>Person</span><select autoFocus value={coiPersonId} onChange={(event) => setCoiPersonId(event.target.value)}><option value="">Select person…</option>{availablePeople.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
          <label className="field"><span>Reason</span><input value={coiReason} onChange={(event) => setCoiReason(event.target.value)} placeholder="HCH is a potential supplier" /></label>
          <div className="process-actions"><button className="quiet small" type="button" onClick={() => { setCoiFormOpen(false); setCoiPersonId(""); setCoiReason(""); setCoiError(""); }}>Cancel</button><button className="primary small" type="button" disabled={!coiPersonId || !coiReason.trim() || coiSaving} onClick={() => void addConflict()}>{coiSaving ? "Adding…" : "Add COI"}</button></div>
        </div>}
        {coiError && <div className="auth-message error">{coiError}</div>}
      </div>

      <div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!title.trim() || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save settings"}</button></div></div>
      <div className="project-completion-zone"><div><strong>Complete project</strong><p>Use this when the intended outcome is achieved or the project is deliberately ended. Completion can be reversed later.</p>{openNextStepCount > 0 && <small>{openNextStepCount} open {openNextStepCount === 1 ? "next step remains" : "next steps remain"}; they will not be closed automatically.</small>}</div><button className="secondary danger-quiet" type="button" disabled={completing} onClick={() => void complete()}>{completing ? "Completing…" : "Complete project"}</button></div>
    </section>
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The conflict of interest could not be updated.";
}
