"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Action } from "@/lib/domain";
import type { WorkspacePerson } from "@/lib/supabase/workspace";

export type ContextualNextStepInput = {
  title: string;
  ownerId: string;
  due?: string;
  projectId?: string;
  sourceTensionId?: string;
  source?: string;
};

export function ContextualNextSteps({
  parentType,
  parentId,
  parentTitle,
  projectId,
  actions,
  people,
  currentUserId,
  personName,
  onAdd,
  onStatus,
}: {
  parentType: "project" | "tension";
  parentId: string;
  parentTitle: string;
  projectId?: string;
  actions: Action[];
  people: WorkspacePerson[];
  currentUserId: string;
  personName: (id: string) => string;
  onAdd: (input: ContextualNextStepInput) => Promise<boolean>;
  onStatus: (id: string, status: "open" | "done") => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const relevant = actions.filter((action) => {
    if (action.status !== "open" && action.status !== "proposed") return false;
    return parentType === "project" ? action.projectId === parentId : action.sourceTensionId === parentId;
  });

  return <div className="context-next-steps">
    <div className="context-next-steps-head">
      <div><span className="kind">Concrete next steps</span>{relevant.length > 0 && <span className="context-step-count">{relevant.length}</span>}</div>
      <button className="quiet small" type="button" onClick={() => setOpen(true)}>+ Add next step</button>
    </div>
    {relevant.length > 0 && <div className="context-step-list">{relevant.map((action) => <div className="context-step-row" key={action.id}>
      <div className="context-step-copy"><strong>{action.title}</strong><small>{action.status === "proposed" ? "Proposed to" : "Owned by"} {personName(action.ownerId)}{action.due ? ` · due ${formatDate(action.due)}` : ""}</small></div>
      {action.ownerId === currentUserId && action.status === "proposed" && <button className="secondary small" type="button" onClick={() => void onStatus(action.id, "open")}>Accept</button>}
      {action.ownerId === currentUserId && action.status === "open" && <button className="quiet small" type="button" onClick={() => void onStatus(action.id, "done")}>Done</button>}
    </div>)}</div>}
    {open && typeof document !== "undefined" && createPortal(<NextStepModal
      parentType={parentType}
      parentId={parentId}
      parentTitle={parentTitle}
      projectId={projectId}
      people={people}
      currentUserId={currentUserId}
      onClose={() => setOpen(false)}
      onSave={async (input) => { if (await onAdd(input)) setOpen(false); }}
    />, document.body)}
  </div>;
}

function NextStepModal({ parentType, parentId, parentTitle, projectId, people, currentUserId, onClose, onSave }: {
  parentType: "project" | "tension";
  parentId: string;
  parentTitle: string;
  projectId?: string;
  people: WorkspacePerson[];
  currentUserId: string;
  onClose: () => void;
  onSave: (input: ContextualNextStepInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const [due, setDue] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!title.trim() || !ownerId || saving) return;
    setSaving(true);
    await onSave({
      title: title.trim(),
      ownerId,
      due: due || undefined,
      projectId: parentType === "project" ? parentId : projectId,
      sourceTensionId: parentType === "tension" ? parentId : undefined,
      source: parentType === "tension" ? `Tension · ${parentTitle}` : undefined,
    });
    setSaving(false);
  }

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal context-step-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Concrete next step</span><h2>{parentTitle}</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">Record a specific commitment that moves this {parentType} forward. The {parentType} itself stays open until the real situation changes.</p>
      <label className="field"><span>What needs to happen?</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      <label className="field"><span>Due date <em>optional</em></span><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
      {ownerId !== currentUserId && <p className="context-step-note">This will be proposed to {personNameFrom(people, ownerId)}. It becomes their commitment when they accept it.</p>}
      <div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!title.trim() || !ownerId || saving} onClick={() => void save()}>{saving ? "Saving…" : ownerId === currentUserId ? "Add next step" : "Propose next step"}</button></div></div>
    </section>
  </div>;
}

function personNameFrom(people: WorkspacePerson[], id: string) {
  return people.find((person) => person.id === id)?.name ?? "this person";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}
