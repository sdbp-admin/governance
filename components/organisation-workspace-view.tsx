"use client";

import { useEffect, useState } from "react";
import type { RoleDefinition } from "@/lib/domain";
import type { WorkspaceData } from "@/lib/supabase/workspace";
import type { WorkspacePresenceSnapshot } from "@/lib/supabase/presence";
import { supabase } from "@/lib/supabase/client";
import { AGREEMENT_CATEGORIES } from "./governance-effect-editor";
import styles from "./organisation-governance.module.css";
import { RoleEditorModal, blankRole } from "@/components/role-editor-modal";
import { ProcessGuidance } from "@/components/process-guidance";

type GovernanceAvailability = { id: string; governance_available: boolean; governance_leave_expected_return_on?: string | null };

export function OrganisationWorkspaceView({ workspace, currentUserId, canInvite, personName, presence, onInvite, onSaveRole, onDeleteRole, onGoRecords, searchRoleId, onSearchTargetHandled }: {
  searchRoleId?: string | null; onSearchTargetHandled?: () => void;
  workspace: WorkspaceData;
  currentUserId: string;
  canInvite: boolean;
  personName: (id: string) => string;
  presence: WorkspacePresenceSnapshot;
  onInvite: (name: string, email: string) => Promise<boolean>;
  onSaveRole: (role: RoleDefinition) => Promise<boolean>;
  onDeleteRole: (id: string) => Promise<boolean>;
  onOpenProject: (id: string) => void;
  onGoRecords?: () => void;
}) {
  const [view, setView] = useState<"structure" | "roles" | "circles" | "people">("structure");
  const [query, setQuery] = useState("");
  const [unfilledOnly, setUnfilledOnly] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  useEffect(() => {
    if (!searchRoleId) return;
    setSelectedRoleId(searchRoleId); setQuery(''); setUnfilledOnly(false);
    onSearchTargetHandled?.();
  }, [searchRoleId, onSearchTargetHandled]);
  const [leavePersonId, setLeavePersonId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<GovernanceAvailability[]>([]);
  const [canManageAvailability, setCanManageAvailability] = useState(false);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [now, setNow] = useState(0);

  async function loadAvailability() {
    const [peopleResult, manageResult] = await Promise.all([
      supabase.from("people").select("id,governance_available,governance_leave_expected_return_on").eq("active", true),
      supabase.rpc("can_manage_governance_availability"),
    ]);
    if (!peopleResult.error) setAvailability((peopleResult.data ?? []) as GovernanceAvailability[]);
    else if (!isAvailabilitySchemaError(peopleResult.error)) throw peopleResult.error;
    if (!manageResult.error) setCanManageAvailability(Boolean(manageResult.data));
  }

  useEffect(() => { let alive = true; const initialLoad = window.setTimeout(() => void loadAvailability().catch((error) => { if (alive && !isAvailabilitySchemaError(error)) setAvailabilityError(readError(error)); }), 0); return () => { alive = false; window.clearTimeout(initialLoad); }; }, []);
  useEffect(() => { const tick = () => setNow(Date.now()); const initialTick = window.setTimeout(tick, 0); const timer = window.setInterval(tick, 30_000); return () => { window.clearTimeout(initialTick); window.clearInterval(timer); }; }, []);

  async function setGovernanceAvailability(personId: string, available: boolean, expectedReturn?: string) {
    if (availabilityBusy) return false;
    setAvailabilityBusy(true); setAvailabilityError("");
    try {
      const result = await supabase.rpc("set_governance_availability", { target_person_id: personId, available, expected_return_on: available ? null : (expectedReturn || null) });
      if (result.error) throw result.error;
      await loadAvailability();
      window.dispatchEvent(new Event("focus"));
      return true;
    } catch (error) { setAvailabilityError(readError(error)); return false; }
    finally { setAvailabilityBusy(false); }
  }

  const availabilityById = new Map(availability.map((item) => [item.id, item] as const));
  const selectedRole = selectedRoleId ? workspace.roles.find((role) => role.id === selectedRoleId) : undefined;
  const unfilledRoles = workspace.roles.filter((role) => !role.isCircle && !role.holderIds.length);

  return <>
    <div className={styles.toolbar}>
      <nav className={styles.tabs} aria-label="Organisation views">
        {(["structure", "roles", "circles", "people"] as const).map(tab => <button key={tab} aria-pressed={view === tab} onClick={() => { setView(tab); setQuery(""); }}>{tab === "structure" ? "Structure" : tab === "roles" ? `Roles · ${workspace.roles.filter(role => !role.isCircle).length}` : tab === "circles" ? `Circles · ${workspace.roles.filter(role => role.isCircle).length}` : `People · ${workspace.people.length}`}</button>)}
      </nav>
      <div className="org-actions">{canInvite && <button className="secondary small" onClick={() => setInviteOpen(true)}>+ Invite person</button>}<button className="secondary small" onClick={() => setEditingRole({ ...blankRole(currentUserId), isCircle: view === "circles", holderIds: view === "circles" ? [] : [currentUserId] })}>+ Add role or circle</button></div>
    </div>
    {(view === "roles" || view === "circles") && <div className={styles.toolbar}><input className={styles.search} aria-label={view === "roles" ? "Search all roles" : "Search all circles"} placeholder={view === "roles" ? "Find any role or holder…" : "Find any circle…"} value={query} onChange={event => setQuery(event.target.value)} />{view === "roles" && <label><input type="checkbox" checked={unfilledOnly} onChange={event => setUnfilledOnly(event.target.checked)} /> Unfilled only · {unfilledRoles.length}</label>}</div>}
    {view !== "people" && <div className={styles.orgLayout}>
      {view === "structure" ? <OrganisationStructure roles={workspace.roles} peopleCount={workspace.people.length} selectedRoleId={selectedRoleId} personName={personName} onSelect={setSelectedRoleId} /> : <div className={styles.list} aria-label={view === "roles" ? "All organisational roles" : "All organisational circles"}>
        {workspace.roles.filter(role => Boolean(role.isCircle) === (view === "circles") && (view !== "roles" || !unfilledOnly || !role.holderIds.length) && [role.title, ...role.holderIds.map(personName)].join(" ").toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.title.localeCompare(b.title)).map(role => <button className={styles.listRow} key={role.id} aria-pressed={selectedRoleId === role.id} onClick={() => setSelectedRoleId(role.id)}><span><strong>{role.title}</strong><small>{structurePath(role, workspace.roles)}</small></span><small>{role.isCircle ? `${workspace.roles.filter(child => child.parentId === role.id).length} contained roles / circles · ${circleMembers(role.id, workspace.roles).length} members` : role.holderIds.map(personName).join(", ") || "Unfilled"}</small></button>)}
        {!workspace.roles.some(role => Boolean(role.isCircle) === (view === "circles") && (view !== "roles" || !unfilledOnly || !role.holderIds.length) && [role.title, ...role.holderIds.map(personName)].join(" ").toLowerCase().includes(query.toLowerCase())) && <p className={styles.empty}>{query || unfilledOnly && view === "roles" ? "No matching results." : view === "circles" ? "No circles yet. Roles can sit directly under SDBP." : "No roles yet."}</p>}
      </div>}
      <StructureDetail role={selectedRole} roles={workspace.roles} personName={personName} onEdit={setEditingRole} onSelect={setSelectedRoleId} onPeople={() => setView("people")} />
    </div>}
    {view === "people" && <>
    <section className="section"><div className="section-head"><div><span className="section-kicker">People</span><h2>SDBP workspace</h2></div></div>{availabilityError && <div className="auth-message error">{availabilityError}</div>}<div className="people-strip">{workspace.people.map((person) => {
      const roles = workspace.roles.filter((role) => !role.isCircle && role.holderIds.includes(person.id));
      const status = availabilityById.get(person.id);
      const available = status?.governance_available !== false;
      const mine = person.id === currentUserId;
      const expected = status?.governance_leave_expected_return_on;
      const connected = presence.onlineIds.has(person.id);
      const activeNow = presence.activeIds.has(person.id);
      const lastSeen = presence.lastSeenById.get(person.id);
      const presenceLabel = activeNow ? "● Active now" : connected ? "◐ Away" : "○ Offline";
      const presenceBackground = activeNow ? "var(--green-soft)" : connected ? "rgba(213,168,55,.14)" : "rgba(43,55,70,.06)";
      const presenceColor = activeNow ? "#6f8617" : connected ? "#8a6c1d" : "var(--muted)";
      return <article className="people-compact" key={person.id}><div className="person-avatar">{person.name.charAt(0)}</div><div><div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}><h3>{person.name}</h3><span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 7px", borderRadius: "999px", fontSize: "11px", fontWeight: 700, background: presenceBackground, color: presenceColor }}>{presenceLabel}</span></div><small>{person.linked ? "active account" : "invited"}{!available ? ` · on leave${expected ? ` · expected ${formatDate(expected)}` : ""}` : ""}</small><small style={{ display: "block", marginTop: "3px", color: "var(--muted)" }}>{activeNow ? "Last active now" : !person.linked ? "Has not joined yet" : lastSeen ? `Last active ${relativeLastSeen(lastSeen, now)}` : presence.lastSeenSupported ? "Last active not recorded yet" : "Last active available after database update"}</small><div className="role-list compact-role-list">{roles.map((role) => <button className={`role-chip role-chip-${role.category}`} key={role.id} onClick={() => { setSelectedRoleId(role.id); setView("roles"); }}>{role.title}</button>)}</div><div className="actions compact-actions">{available && (mine || canManageAvailability) && <button className="quiet small" type="button" disabled={availabilityBusy} onClick={() => setLeavePersonId(person.id)}>{mine ? "Mark myself on leave" : "Mark on leave"}</button>}{!available && mine && <button className="secondary small" type="button" disabled={availabilityBusy} onClick={() => void setGovernanceAvailability(person.id, true)}>{availabilityBusy ? "Saving…" : "Mark me available"}</button>}{!available && !mine && canManageAvailability && <button className="quiet small" type="button" disabled={availabilityBusy} onClick={() => setLeavePersonId(person.id)}>Update leave</button>}</div></div></article>;
    })}</div></section>
    </>}
    <details className={styles.secondary}><summary>Statutes & standing agreements</summary>
      <p>The statutes are SDBP’s legal foundation. Standing agreements record accepted ongoing ways of working.</p>{onGoRecords && <button className="secondary small" onClick={onGoRecords}>Statutes in Records</button>}
      {AGREEMENT_CATEGORIES.map(category => { const items = workspace.standingAgreements.filter(agreement => agreement.status === "current" && agreement.category === category.value); return items.length ? <section key={category.value}><h3>{category.label}</h3>{items.map(agreement => <details key={agreement.id}><summary>{agreement.title}</summary><p>{agreement.body}</p></details>)}</section> : null; })}
      {!workspace.standingAgreements.some(agreement => agreement.status === "current") && <p>No standing agreements recorded yet.</p>}
    </details>
    {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} onInvite={async (name, email) => { if (await onInvite(name, email)) setInviteOpen(false); }} />}
    {editingRole && <RoleEditorModal role={editingRole} roles={workspace.roles} people={workspace.people} existing={workspace.roles.some((role) => role.id === editingRole.id)} onClose={() => setEditingRole(null)} onSave={async (role) => { if (await onSaveRole(role)) { setEditingRole(null); setSelectedRoleId(role.id); if (view === "people") setView("structure"); } }} onDelete={async (id) => { if (await onDeleteRole(id)) { setEditingRole(null); setSelectedRoleId(null); } }} />}
    {leavePersonId && <LeaveModal personName={personName(leavePersonId)} initialDate={availabilityById.get(leavePersonId)?.governance_leave_expected_return_on ?? ""} busy={availabilityBusy} onClose={() => setLeavePersonId(null)} onSave={async (date) => { if (await setGovernanceAvailability(leavePersonId, false, date)) setLeavePersonId(null); }} />}
  </>;
}

function OrganisationStructure({ roles, peopleCount, selectedRoleId, personName, onSelect }: { roles: RoleDefinition[]; peopleCount: number; selectedRoleId: string | null; personName: (id: string) => string; onSelect: (id: string | null) => void }) {
  const roots = roles.filter(role => !role.parentId || !roles.some(parent => parent.id === role.parentId));
  return <div className={styles.structure} aria-label="SDBP organisational structure"><div className={styles.root}><button className={styles.rootTitle} onClick={() => onSelect(null)}><strong>SDBP</strong><small>{peopleCount} people · {roles.filter(role => !role.isCircle).length} roles</small></button><div className={styles.nodes}>{roots.map(role => <StructureNode key={role.id} role={role} roles={roles} selectedId={selectedRoleId} personName={personName} onSelect={onSelect} />)}{!roots.length && <p className={styles.empty}>Add the first role or circle to define the structure.</p>}</div></div></div>;
}

function StructureNode({ role, roles, selectedId, personName, onSelect }: { role: RoleDefinition; roles: RoleDefinition[]; selectedId: string | null; personName: (id: string) => string; onSelect: (id: string) => void }) {
  const children = roles.filter(candidate => candidate.parentId === role.id);
  if (!role.isCircle) return <button className={styles.role} data-unfilled={!role.holderIds.length || undefined} aria-pressed={selectedId === role.id} onClick={() => onSelect(role.id)}><strong>{role.title}</strong><small>{role.holderIds.map(personName).join(" · ") || "Unfilled"}</small></button>;
  return <div className={styles.circle} data-selected={selectedId === role.id || undefined}><button className={styles.circleTitle} onClick={() => onSelect(role.id)}><small>Circle</small><strong>{role.title}</strong><small>{circleMembers(role.id, roles).length} members</small></button><div className={styles.nodes}>{children.map(child => <StructureNode key={child.id} role={child} roles={roles} selectedId={selectedId} personName={personName} onSelect={onSelect} />)}{!children.length && <small className={styles.empty}>No contained roles yet</small>}</div></div>;
}

function StructureDetail({ role, roles, personName, onEdit, onSelect, onPeople }: { role?: RoleDefinition; roles: RoleDefinition[]; personName: (id: string) => string; onEdit: (role: RoleDefinition) => void; onSelect: (id: string | null) => void; onPeople: () => void }) {
  if (!role) return <aside className={styles.detail}><span className="section-kicker">Organisation</span><h3>SDBP</h3><p>Select a role or circle to see its purpose, scope, accountabilities and people.</p><p>Small blue circles are roles. Larger enclosing circles contain roles and other circles. Dashed roles are unfilled.</p><p>Use Roles or Circles to find every object without navigating the structure.</p></aside>;
  const parent = roles.find(candidate => candidate.id === role.parentId);
  const children = roles.filter(candidate => candidate.parentId === role.id);
  const holders = role.isCircle ? circleMembers(role.id, roles) : role.holderIds;
  return <aside className={styles.detail} aria-label={`${role.title} definition`}>
    <div className="structure-detail-head"><div><span className="section-kicker">{role.isCircle ? "Circle" : "Role"}</span><h3>{role.title} <ProcessGuidance topic="organisation" /></h3></div><button className="secondary small" onClick={() => onEdit(role)}>Edit</button></div>
    <div className={styles.links}><button onClick={() => onSelect(parent?.id ?? null)}>Within {parent?.title ?? "SDBP"} ↗</button></div>
    <Detail label="Purpose" value={role.purpose || "Not defined yet."} /><Detail label="Scope / domain" value={role.scope || "Not defined yet."} />
    <DetailList label="Responsibilities" values={role.responsibilities} /><DetailList label="Accountabilities" values={role.accountabilities} />
    {role.isCircle && <><strong>Contained roles & circles</strong><div className={styles.links}>{children.map(child => <button key={child.id} onClick={() => onSelect(child.id)}>{child.title} · {child.isCircle ? "circle" : "role"} ↗</button>)}{!children.length && <p>Empty circle · roles can be added later.</p>}</div><button className="secondary small" onClick={() => onEdit({ ...blankRole(""), parentId: role.id })}>+ Add within this circle</button></>}
    <DetailList label={role.isCircle ? "Members through contained roles" : "Holder(s)"} values={holders.map(personName)} />
    <div className={styles.links}><button onClick={onPeople}>People & availability ↗</button></div>
    <Detail label="Source" value={role.source || "Not recorded."} />
  </aside>;
}

function structurePath(role: RoleDefinition, roles: RoleDefinition[]) {
  const names: string[] = [];
  const visited = new Set<string>([role.id]);
  let parent = roles.find(candidate => candidate.id === role.parentId);
  while (parent && !visited.has(parent.id)) { visited.add(parent.id); names.unshift(parent.title); parent = roles.find(candidate => candidate.id === parent!.parentId); }
  return ["SDBP", ...names].join(" → ");
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="structure-detail-row"><strong>{label}</strong><p>{value}</p></div>; }
function DetailList({ label, values }: { label: string; values: string[] }) { return <div className="structure-detail-row"><strong>{label}</strong>{values.length ? <ul>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul> : <p>None recorded.</p>}</div>; }

function circleMembers(circleId: string, roles: RoleDefinition[]) {
  const roleIds = new Set<string>();
  const visit = (parentId: string) => roles.filter((role) => role.parentId === parentId).forEach((role) => { roleIds.add(role.id); if (role.isCircle) visit(role.id); });
  visit(circleId);
  return [...new Set(roles.filter((role) => roleIds.has(role.id) && !role.isCircle).flatMap((role) => role.holderIds))];
}

function InviteModal({ onClose, onInvite }: { onClose: () => void; onInvite: (name: string, email: string) => Promise<void> }) { const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [sending, setSending] = useState(false); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Invite</span><h2>Add someone to SDBP</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><label className="field"><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label><div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={sending || !name.trim() || !email.trim()} onClick={async () => { setSending(true); await onInvite(name, email); setSending(false); }}>{sending ? "Sending…" : "Send invitation"}</button></div></div></section></div>; }

function LeaveModal({ personName, initialDate, busy, onClose, onSave }: { personName: string; initialDate: string; busy: boolean; onClose: () => void; onSave: (date: string) => Promise<void> }) { const [date, setDate] = useState(initialDate); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor compact-modal"><div className="editor-head"><div><span className="section-kicker">Governance availability</span><h2>Mark {personName} on leave</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">This does not remove board membership or workspace access. While on leave, a missing response from this person will not hold open a quick-consent round. Any objection already raised remains in the governance record and still has to be resolved.</p><label className="field"><span>Expected return <em>optional</em></span><input type="date" min={todayISO()} value={date} onChange={(event) => setDate(event.target.value)} /></label><p className="editor-note">The date is informational only. It will not automatically mark the person available again.</p><div className="editor-actions"><div /><div className="editor-actions-right"><button className="secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="primary" type="button" disabled={busy} onClick={() => void onSave(date)}>{busy ? "Saving…" : "Mark on leave"}</button></div></div></section></div>; }

function todayISO() { return new Date().toISOString().slice(0, 10); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function relativeLastSeen(value: string, now: number) { const time = new Date(value).getTime(); if (!Number.isFinite(time)) return "at an unknown time"; const seconds = Math.max(0, Math.floor((now - time) / 1000)); if (seconds < 60) return "less than a minute ago"; const minutes = Math.floor(seconds / 60); if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`; const hours = Math.floor(minutes / 60); if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`; const days = Math.floor(hours / 24); if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`; return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function isAvailabilitySchemaError(error: { code?: string; message?: string }) { return error.code === "42703" || error.code === "PGRST204" || /governance_available|can_manage_governance_availability|set_governance_availability|schema cache|does not exist/i.test(error.message ?? ""); }
function readError(error: unknown) { return error instanceof Error ? error.message : "Governance availability could not be updated."; }
