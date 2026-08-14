"use client";

import { useState } from "react";
import type { Project } from "@/lib/domain";
import type { WorkspacePerson } from "@/lib/supabase/workspace";

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

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal project-context-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Project settings</span><h2>{project.title}</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">Maintain the project definition here. Editing these fields does not reset the normal project-update rhythm.</p>
      <label className="field"><span>Project name</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => { const id = event.target.value; setOwnerId(id); setParticipants((items) => items.includes(id) ? items : [...items, id]); }}>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      <div className="field"><span>People involved</span><div className="people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={participants.includes(person.id)} onChange={(event) => setParticipants((items) => event.target.checked ? [...new Set([...items, person.id])] : person.id === ownerId ? items : items.filter((id) => id !== person.id))} />{person.name}</label>)}</div></div>
      <label className="field"><span>Current state <em>optional</em></span><textarea rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
      <div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!title.trim() || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save settings"}</button></div></div>
      <div className="project-completion-zone"><div><strong>Complete project</strong><p>Use this when the intended outcome is achieved or the project is deliberately ended. Completion can be reversed later.</p>{openNextStepCount > 0 && <small>{openNextStepCount} open {openNextStepCount === 1 ? "next step remains" : "next steps remain"}; they will not be closed automatically.</small>}</div><button className="secondary danger-quiet" type="button" disabled={completing} onClick={() => void complete()}>{completing ? "Completing…" : "Complete project"}</button></div>
    </section>
  </div>;
}
