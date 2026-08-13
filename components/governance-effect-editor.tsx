"use client";

import type { GovernanceEffect, GovernanceRoleSnapshot, RoleDefinition, StandingAgreement, StandingAgreementCategory } from "@/lib/domain";

export const AGREEMENT_CATEGORIES: { value: StandingAgreementCategory; label: string }[] = [
  { value: "organisation_authority", label: "Organisation & authority" },
  { value: "finance", label: "Finance" },
  { value: "membership", label: "Membership" },
  { value: "external_relations", label: "External relations" },
  { value: "events_programmes", label: "Events & programmes" },
  { value: "ways_of_working", label: "Ways of working" },
  { value: "other", label: "Other" },
];

export function GovernanceEffectEditor({ effect, roles, standingAgreements, onChange }: { effect?: GovernanceEffect; roles: RoleDefinition[]; standingAgreements: StandingAgreement[]; onChange: (effect: GovernanceEffect | undefined) => void }) {
  const agreements = standingAgreements.filter((item) => item.status === "current");
  return <div className="governance-effect-editor">
    <div className="effect-heading"><span className="section-kicker">Resulting governance</span><h4>If accepted, where does this become true?</h4><p>The proposal explains the change. This tells the Workspace which current governance object to update.</p></div>
    <label className="field"><span>Governance object</span><select value={effect?.kind ?? ""} onChange={(event) => { const kind = event.target.value; if (kind === "role") onChange({ kind: "role", operation: "amend" }); else if (kind === "standing_agreement") onChange({ kind: "standing_agreement", operation: "create", agreement: blankAgreement() }); else onChange(undefined); }}><option value="">Choose…</option><option value="role">Role</option><option value="standing_agreement">Standing agreement</option></select></label>
    {effect?.kind === "role" && <RoleEffect effect={effect} roles={roles} onChange={onChange} />}
    {effect?.kind === "standing_agreement" && <AgreementEffect effect={effect} agreements={agreements} onChange={onChange} />}
  </div>;
}

function RoleEffect({ effect, roles, onChange }: { effect: Extract<GovernanceEffect, { kind: "role" }>; roles: RoleDefinition[]; onChange: (effect: GovernanceEffect) => void }) {
  const selected = effect.targetId ? roles.find((role) => role.id === effect.targetId) : undefined;
  const setOperation = (operation: "create" | "amend" | "remove") => onChange(operation === "create" ? { kind: "role", operation, role: blankRole() } : { kind: "role", operation });
  const setTarget = (id: string) => { const role = roles.find((item) => item.id === id); onChange(role ? { kind: "role", operation: effect.operation, targetId: role.id, role: effect.operation === "remove" ? undefined : snapshot(role) } : { kind: "role", operation: effect.operation }); };
  return <>
    <div className="effect-grid"><label className="field"><span>Change</span><select value={effect.operation} onChange={(event) => setOperation(event.target.value as "create" | "amend" | "remove")}><option value="create">Create role</option><option value="amend">Amend role</option><option value="remove">Remove role</option></select></label>{effect.operation !== "create" && <label className="field"><span>Role</span><select value={effect.targetId ?? ""} onChange={(event) => setTarget(event.target.value)}><option value="">Choose role…</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.title}</option>)}</select></label>}</div>
    {effect.operation === "remove" && selected && <div className="effect-preview"><strong>{selected.title}</strong><span>This role will no longer appear in Current Governance.</span></div>}
    {effect.operation !== "remove" && effect.role && <RoleFields role={effect.role} onChange={(role) => onChange({ ...effect, role })} />}
  </>;
}

function RoleFields({ role, onChange }: { role: GovernanceRoleSnapshot; onChange: (role: GovernanceRoleSnapshot) => void }) {
  return <div className="effect-fields"><div className="effect-grid"><label className="field"><span>Role title</span><input value={role.title} onChange={(event) => onChange({ ...role, title: event.target.value })} /></label><label className="field"><span>Type</span><select value={role.category} onChange={(event) => onChange({ ...role, category: event.target.value as GovernanceRoleSnapshot["category"] })}><option value="board">Board role</option><option value="operating">Operating role</option></select></label></div><label className="field"><span>Purpose <em>optional</em></span><textarea rows={2} value={role.purpose} onChange={(event) => onChange({ ...role, purpose: event.target.value })} /></label><label className="field"><span>Scope <em>optional</em></span><textarea rows={2} value={role.scope} onChange={(event) => onChange({ ...role, scope: event.target.value })} /></label><div className="effect-grid"><label className="field"><span>Responsibilities <em>one per line</em></span><textarea rows={4} value={role.responsibilities.join("\n")} onChange={(event) => onChange({ ...role, responsibilities: lines(event.target.value) })} /></label><label className="field"><span>Accountabilities <em>one per line</em></span><textarea rows={4} value={role.accountabilities.join("\n")} onChange={(event) => onChange({ ...role, accountabilities: lines(event.target.value) })} /></label></div></div>;
}

function AgreementEffect({ effect, agreements, onChange }: { effect: Extract<GovernanceEffect, { kind: "standing_agreement" }>; agreements: StandingAgreement[]; onChange: (effect: GovernanceEffect) => void }) {
  const selected = effect.targetId ? agreements.find((item) => item.id === effect.targetId) : undefined;
  const setOperation = (operation: "create" | "amend" | "repeal") => onChange(operation === "create" ? { kind: "standing_agreement", operation, agreement: blankAgreement() } : { kind: "standing_agreement", operation });
  const setTarget = (id: string) => { const item = agreements.find((agreement) => agreement.id === id); onChange(item ? { kind: "standing_agreement", operation: effect.operation, targetId: item.id, agreement: effect.operation === "repeal" ? undefined : { category: item.category, title: item.title, body: item.body } } : { kind: "standing_agreement", operation: effect.operation }); };
  return <><div className="effect-grid"><label className="field"><span>Change</span><select value={effect.operation} onChange={(event) => setOperation(event.target.value as "create" | "amend" | "repeal")}><option value="create">Create agreement</option><option value="amend">Amend agreement</option><option value="repeal">Repeal agreement</option></select></label>{effect.operation !== "create" && <label className="field"><span>Standing agreement</span><select value={effect.targetId ?? ""} onChange={(event) => setTarget(event.target.value)}><option value="">Choose agreement…</option>{agreements.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}</div>{effect.operation === "repeal" && selected && <div className="effect-preview"><strong>{selected.title}</strong><span>This agreement will leave Current Governance and remain in Decision History.</span></div>}{effect.operation !== "repeal" && effect.agreement && <div className="effect-fields"><label className="field"><span>Area</span><select value={effect.agreement.category} onChange={(event) => onChange({ ...effect, agreement: { ...effect.agreement!, category: event.target.value as StandingAgreementCategory } })}>{AGREEMENT_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label><label className="field"><span>Title</span><input value={effect.agreement.title} onChange={(event) => onChange({ ...effect, agreement: { ...effect.agreement!, title: event.target.value } })} /></label><label className="field"><span>Current text if accepted</span><textarea rows={4} value={effect.agreement.body} onChange={(event) => onChange({ ...effect, agreement: { ...effect.agreement!, body: event.target.value } })} /></label></div>}</>;
}

export function governanceEffectIsComplete(effect?: GovernanceEffect) { if (!effect) return false; if (effect.kind === "role") { if (effect.operation === "remove") return Boolean(effect.targetId); if (effect.operation === "amend" && !effect.targetId) return false; return Boolean(effect.role?.title.trim()); } if (effect.operation === "repeal") return Boolean(effect.targetId); if (effect.operation === "amend" && !effect.targetId) return false; return Boolean(effect.agreement?.title.trim() && effect.agreement?.body.trim()); }
export function governanceEffectSummary(effect: GovernanceEffect | undefined, roles: RoleDefinition[], agreements: StandingAgreement[]) { if (!effect) return "Historical decision · no structured current effect"; if (effect.kind === "role") { const title = effect.role?.title || roles.find((item) => item.id === effect.targetId)?.title || "role"; return `${effect.operation === "create" ? "Created" : effect.operation === "remove" ? "Removed" : "Amended"} role · ${title}`; } const title = effect.agreement?.title || agreements.find((item) => item.id === effect.targetId)?.title || "standing agreement"; return `${effect.operation === "create" ? "Created" : effect.operation === "repeal" ? "Repealed" : "Amended"} standing agreement · ${title}`; }
export function agreementCategoryLabel(category: StandingAgreementCategory) { return AGREEMENT_CATEGORIES.find((item) => item.value === category)?.label ?? category; }
function snapshot(role: RoleDefinition): GovernanceRoleSnapshot { return { title: role.title, category: role.category, purpose: role.purpose, scope: role.scope, responsibilities: [...role.responsibilities], accountabilities: [...role.accountabilities] }; }
function blankRole(): GovernanceRoleSnapshot { return { title: "", category: "operating", purpose: "", scope: "", responsibilities: [], accountabilities: [] }; }
function blankAgreement() { return { category: "ways_of_working" as StandingAgreementCategory, title: "", body: "" }; }
function lines(value: string) { return value.split("\n").map((line) => line.trim()).filter(Boolean); }
