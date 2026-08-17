"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Action } from "@/lib/domain";
import type { WorkspacePerson } from "@/lib/supabase/workspace";
import { removeAction, updateActionDetails } from "@/lib/supabase/action-management";

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
  const [editingAction, setEditingAction] = useState<Action | null>(null);
  const relevant = actions.filter((action) => {
    if (action.status !== "open" && action.status !== "proposed") return false;
    return parentType === "project" ? action.projectId === parentId : action.sourceTensionId === parentId;
  });

  return <div className="context-next-steps">
    <div className="context-next-steps-head">
      <div><span className="kind">Concrete next steps</span>{relevant.length > 0 && <span className="context-step-count">{relevant.length}</span>}</div>
      <button className="quiet small" type="button" onClick={() => setOpen(true)}>+ Add next step</button>
    </div>
    {relevant.length > 0 && <div className="context-step-list">{relevant.map((action) => <div className="context-step-row" id={`action-row-${action.id}`} data-action-id={action.id} key={action.id}>
      <div className="context-step-copy"><strong>{action.title}</strong><small>{action.status === "proposed" ? "Proposed to" : "Owned by"} {personName(action.ownerId)}{action.due ? ` · due ${formatDate(action.due)}` : ""}</small></div>
      <div className="actions compact-actions">
        <button className="quiet small" type="button" onClick={() => setEditingAction(action)}>Edit</button>
        {action.ownerId === currentUserId && action.status === "proposed" && <button className="secondary small" type="button" onClick={() => void onStatus(action.id, "open")}>Accept</button>}
        {action.ownerId === currentUserId && action.status === "open" && <button className="quiet small" type="button" onClick={() => void onStatus(action.id, "done")}>Done</button>}
      </div>
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
    {editingAction && typeof document !== "undefined" && createPortal(<NextStepEditModal
      action={editingAction}
      people={people}
      currentUserId={currentUserId}
      onClose={() => setEditingAction(null)}
      onChanged={() => {
        setEditingAction(null);
        window.dispatchEvent(new Event("focus"));
      }}
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

function NextStepEditModal({ action, people, currentUserId, onClose, onChanged }: {
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

  const ownerChanged = ownerId !== action.ownerId;

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="workflow-editor compact-modal context-step-modal" role="dialog" aria-modal="true">
      <div className="editor-head"><div><span className="section-kicker">Edit next step</span><h2>Correct the commitment</h2></div><button className="quiet editor-close" type="button" onClick={onClose}>×</button></div>
      <p className="editor-note">The owner remains the only person who can mark this done. The text, owner and due date can be corrected, and an incorrect next step can be removed.</p>
      <label className="field"><span>What needs to happen?</span><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select></label>
      <label className="field"><span>Due date <em>optional</em></span><input type="date" value={due} onChange={(event) => setDue(event.target.value)} /></label>
      {ownerChanged && ownerId !== currentUserId && <p className="context-step-note">Changing the owner will propose this next step to {personNameFrom(people, ownerId)}. They must accept it before it becomes their commitment.</p>}
      {error && <div className="auth-message error">{error}</div>}
      <div className="editor-actions"><button className="quiet" type="button" disabled={saving} onClick={() => void remove()}>Remove next step</button><div className="editor-actions-right"><button className="secondary" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={!title.trim() || !ownerId || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save changes"}</button></div></div>
    </section>
  </div>;
}

function personNameFrom(people: WorkspacePerson[], id: string) {
  return people.find((person) => person.id === id)?.name ?? "this person";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The next step could not be changed.";
}
