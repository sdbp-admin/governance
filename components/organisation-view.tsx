"use client";

import { useState } from "react";
import { people } from "@/lib/mock-data";
import type { RoleDefinition } from "@/lib/domain";
import { splitLines } from "@/lib/prototype-utils";

export function OrganisationView({ roles, setRoles, onSaved, onDeleted }: { roles: RoleDefinition[]; setRoles: React.Dispatch<React.SetStateAction<RoleDefinition[]>>; onSaved: (title: string) => void; onDeleted: (title: string) => void }) {
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const unfilledRoles = roles.filter((role) => role.holderIds.length === 0);
  function addRole(holderId = "", category: RoleDefinition["category"] = "operating") {
    setEditingRole({ id: `role-${Date.now()}`, title: "", category, holderIds: holderId ? [holderId] : [], purpose: "", scope: "", responsibilities: [], accountabilities: [], source: category === "board" ? "SDBP Statutes / applicable law" : "SDBP operating governance", status: "draft" });
  }
  function saveRole(nextRole: RoleDefinition) {
    setRoles((current) => current.some((role) => role.id === nextRole.id) ? current.map((role) => role.id === nextRole.id ? nextRole : role) : [...current, nextRole]);
    setEditingRole(null); onSaved(nextRole.title);
  }
  function deleteRole(roleId: string) {
    const role = roles.find((candidate) => candidate.id === roleId);
    if (!role) return;
    setRoles((current) => current.filter((candidate) => candidate.id !== roleId)); setEditingRole(null); onDeleted(role.title);
  }
  return <>
    <div className="org-intro"><div><span className="section-kicker">Roles and authority</span><h2>Roles make responsibilities explicit</h2><p>Board roles and operating roles are both roles. Board-role authority comes from the statutes and applicable law; operating-role authority comes from SDBP governance. Hover to inspect, or click a role to edit.</p><div className="org-actions"><button className="primary small" onClick={() => addRole()}>+ Add role</button></div></div><div className="org-ring" aria-hidden="true"><span>SDBP</span></div></div>
    <div className="people-grid">{people.map((person) => {
      const boardRoles = roles.filter((role) => role.category === "board" && role.holderIds.includes(person.id));
      const operatingRoles = roles.filter((role) => role.category === "operating" && role.holderIds.includes(person.id));
      return <article className="person-card" key={person.id}><div className="person-top"><div className="person-avatar">{person.name.charAt(0)}</div></div><h3>{person.name}</h3><div className="person-role-group"><span className="role-group-label">Board role</span><div className="role-list">{boardRoles.length ? boardRoles.map((role) => <RoleChip key={role.id} role={role} onEdit={setEditingRole} />) : <button className="missing-role" onClick={() => addRole(person.id, "board")}>+ Add board role</button>}</div></div><div className="person-role-group"><span className="role-group-label">Operating roles</span><div className="role-list">{operatingRoles.length ? operatingRoles.map((role) => <RoleChip key={role.id} role={role} onEdit={setEditingRole} />) : <button className="missing-role" onClick={() => addRole(person.id, "operating")}>+ Add operating role</button>}</div></div></article>;
    })}</div>
    {unfilledRoles.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Unfilled</span><h2>Roles without a holder</h2></div></div><div className="unfilled-role-list">{unfilledRoles.map((role) => <RoleChip key={role.id} role={role} onEdit={setEditingRole} />)}</div></section>}
    {editingRole && <RoleEditor key={editingRole.id} role={editingRole} canDelete={roles.some((role) => role.id === editingRole.id)} onSave={saveRole} onDelete={() => deleteRole(editingRole.id)} onClose={() => setEditingRole(null)} />}
  </>;
}

function RoleChip({ role, onEdit }: { role: RoleDefinition; onEdit: (role: RoleDefinition) => void }) {
  return <div className="role-chip-wrap"><button className={`role-chip role-chip-${role.category}`} onClick={() => onEdit(role)} aria-describedby={`role-tip-${role.id}`}>{role.title || "Untitled role"}</button><div className="role-popover" id={`role-tip-${role.id}`} role="tooltip"><div className="role-popover-head"><div><span className="kind">{role.category === "board" ? "Board role" : "Operating role"}</span><h3>{role.title || "Untitled role"}</h3></div><span className={`definition-status ${role.status}`}>{role.status}</span></div><RoleDetail label="Purpose" text={role.purpose || "Not defined yet."} /><RoleDetail label="Scope" text={role.scope || "Not defined yet."} /><RoleList label="Responsibilities" items={role.responsibilities} /><RoleList label="Accountabilities" items={role.accountabilities} /><div className="role-source"><strong>Source</strong><span>{role.source || "Not recorded"}</span></div><button className="secondary small" onClick={() => onEdit(role)}>Edit role</button></div></div>;
}

function RoleDetail({ label, text }: { label: string; text: string }) { return <div className="role-detail"><strong>{label}</strong><p>{text}</p></div>; }
function RoleList({ label, items }: { label: string; items: string[] }) { return <div className="role-detail"><strong>{label}</strong>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Not defined yet.</p>}</div>; }

function RoleEditor({ role, canDelete, onSave, onDelete, onClose }: { role: RoleDefinition; canDelete: boolean; onSave: (role: RoleDefinition) => void; onDelete: () => void; onClose: () => void }) {
  const [title, setTitle] = useState(role.title);
  const [category, setCategory] = useState<RoleDefinition["category"]>(role.category);
  const [holderId, setHolderId] = useState(role.holderIds[0] ?? "");
  const [purpose, setPurpose] = useState(role.purpose);
  const [scope, setScope] = useState(role.scope);
  const [responsibilities, setResponsibilities] = useState(role.responsibilities.join("\n"));
  const [accountabilities, setAccountabilities] = useState(role.accountabilities.join("\n"));
  const [source, setSource] = useState(role.source);
  const [status, setStatus] = useState<RoleDefinition["status"]>(role.status);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="role-editor" role="dialog" aria-modal="true"><div className="editor-head"><div><span className="section-kicker">Role definition</span><h2>{role.title ? `Edit ${role.title}` : "Add role"}</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">Prototype only: role edits are saved in this browser tab and survive a refresh.</p><form onSubmit={(event) => { event.preventDefault(); onSave({ ...role, title: title.trim(), category, holderIds: holderId ? [holderId] : [], purpose: purpose.trim(), scope: scope.trim(), responsibilities: splitLines(responsibilities), accountabilities: splitLines(accountabilities), source: source.trim(), status }); }}><div className="editor-grid"><label className="field field-wide"><span>Role title</span><input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus /></label><label className="field"><span>Role type</span><select value={category} onChange={(event) => setCategory(event.target.value as RoleDefinition["category"])}><option value="board">Board role</option><option value="operating">Operating role</option></select></label><label className="field"><span>Holder</span><select value={holderId} onChange={(event) => setHolderId(event.target.value)}><option value="">Unfilled</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="field field-wide"><span>Purpose</span><textarea rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} /></label><label className="field field-wide"><span>Scope</span><textarea rows={3} value={scope} onChange={(event) => setScope(event.target.value)} /></label><label className="field"><span>Responsibilities</span><textarea rows={5} value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} placeholder="One per line" /></label><label className="field"><span>Accountabilities</span><textarea rows={5} value={accountabilities} onChange={(event) => setAccountabilities(event.target.value)} placeholder="One per line" /></label><label className="field"><span>Source</span><input value={source} onChange={(event) => setSource(event.target.value)} /></label><label className="field"><span>Definition status</span><select value={status} onChange={(event) => setStatus(event.target.value as RoleDefinition["status"])}><option value="draft">Draft</option><option value="defined">Defined</option></select></label></div><div className="editor-actions">{canDelete && <button type="button" className="danger" onClick={() => { if (window.confirm(`Remove the role “${role.title}”?`)) onDelete(); }}>Remove role</button>}<div className="editor-actions-right"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={!title.trim()}>Save role</button></div></div></form></section></div>;
}
