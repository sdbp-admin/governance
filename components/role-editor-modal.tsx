"use client";

import { useMemo, useState } from "react";
import type { RoleDefinition } from "@/lib/domain";
import type { WorkspacePerson } from "@/lib/supabase/workspace";

export function RoleEditorModal({ role, roles, people, existing, onClose, onSave, onDelete }: {
  role: RoleDefinition;
  roles: RoleDefinition[];
  people: WorkspacePerson[];
  existing: boolean;
  onClose: () => void;
  onSave: (role: RoleDefinition) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState(role);
  const [details, setDetails] = useState(Boolean(role.purpose || role.scope || role.responsibilities.length || role.accountabilities.length));
  const hasChildren = roles.some((candidate) => candidate.parentId === role.id);
  const protectedPresident = role.category === "board" && role.title.trim().toLowerCase() === "president";
  const unavailableParents = useMemo(() => descendantsOf(role.id, roles), [role.id, roles]);
  const parentCircles = roles.filter((candidate) => candidate.isCircle && candidate.id !== role.id && !unavailableParents.has(candidate.id));
  const isCircle = Boolean(draft.isCircle);
  const setCircle = (next: boolean) => setDraft({ ...draft, isCircle: next, holderIds: next ? [] : draft.holderIds });
  const toggleHolder = (personId: string) => setDraft({ ...draft, holderIds: draft.holderIds.includes(personId) ? draft.holderIds.filter((id) => id !== personId) : [...draft.holderIds, personId] });

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="role-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Organisational structure</span><h2>{existing ? `Edit ${role.title}` : "Add role or circle"}</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><div className="editor-grid">
    <label className="field"><span>Structural object</span><select value={isCircle ? "circle" : "role"} onChange={(event) => setCircle(event.target.value === "circle")}><option value="role" disabled={hasChildren}>Role</option><option value="circle" disabled={protectedPresident}>Circle</option></select>{hasChildren && <small>This object contains other roles or circles, so it must remain a circle.</small>}{protectedPresident && <small>The protected President object remains a role.</small>}</label>
    <label className="field"><span>Parent circle</span><select value={draft.parentId ?? ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || undefined })}><option value="">SDBP</option>{parentCircles.map((circle) => <option key={circle.id} value={circle.id}>{circle.title}</option>)}</select></label>
    <label className="field field-wide"><span>{isCircle ? "Circle" : "Role"} title</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
    <label className="field"><span>Category</span><select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as RoleDefinition["category"], source: event.target.value === "board" ? "SDBP Statutes / applicable law" : "SDBP governance" })}><option value="board">Board</option><option value="operating">Operating</option></select></label>
    {!isCircle && <fieldset className="field field-wide structure-holders"><legend>Holder(s)</legend><div className="people-picker">{people.map((person) => <label key={person.id}><input type="checkbox" checked={draft.holderIds.includes(person.id)} onChange={() => toggleHolder(person.id)} />{person.name}</label>)}</div>{!people.length && <small>No people are available.</small>}</fieldset>}
  </div><button className="quiet role-details-toggle" onClick={() => setDetails((value) => !value)}>{details ? "Hide definition" : "Add definition (optional)"}</button>{details && <div className="editor-grid role-extra"><label className="field field-wide"><span>Purpose</span><textarea rows={2} value={draft.purpose} onChange={(event) => setDraft({ ...draft, purpose: event.target.value })} /></label><label className="field field-wide"><span>Scope / domain</span><textarea rows={2} value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })} /></label><label className="field"><span>Responsibilities</span><textarea rows={4} value={draft.responsibilities.join("\n")} onChange={(event) => setDraft({ ...draft, responsibilities: lines(event.target.value) })} /></label><label className="field"><span>Accountabilities</span><textarea rows={4} value={draft.accountabilities.join("\n")} onChange={(event) => setDraft({ ...draft, accountabilities: lines(event.target.value) })} /></label></div>}<div className="editor-actions">{existing ? <button className="danger" onClick={() => void onDelete(role.id)}>Remove {isCircle ? "circle" : "role"}</button> : <div />}<div className="editor-actions-right"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!draft.title.trim()} onClick={() => void onSave({ ...draft, title: draft.title.trim(), isCircle, holderIds: isCircle ? [] : draft.holderIds, status: draft.purpose || draft.scope || draft.responsibilities.length || draft.accountabilities.length ? "defined" : "draft" })}>Save {isCircle ? "circle" : "role"}</button></div></div></section></div>;
}

export function blankRole(holderId: string): RoleDefinition { return { id: crypto.randomUUID(), title: "", category: "operating", isCircle: false, holderIds: holderId ? [holderId] : [], purpose: "", scope: "", responsibilities: [], accountabilities: [], source: "SDBP governance", status: "draft" }; }

function descendantsOf(roleId: string, roles: RoleDefinition[]) {
  const descendants = new Set<string>();
  const visit = (parentId: string) => roles.filter((role) => role.parentId === parentId).forEach((role) => { if (!descendants.has(role.id)) { descendants.add(role.id); visit(role.id); } });
  visit(roleId);
  return descendants;
}

function lines(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
