"use client";

import { useEffect, useState } from "react";
import type { Action, GovernanceProposal } from "@/lib/domain";
import { GovernanceMeeting } from "@/components/governance-meeting";
import { GovernanceWorkspaceView } from "@/components/governance-workspace-view";
import { OrganisationWorkspaceView } from "@/components/organisation-workspace-view";
import { RecordsView } from "@/components/records-view";
import { TacticalMeeting } from "@/components/tactical-meeting";
import { createGovernanceProposal, saveRole, deleteRole, canInvitePeople, invitePerson, setActionStatus, todayISO, type WorkspaceData } from "@/lib/supabase/workspace";
import { isCurrentPresident, resendWorkspaceInvitation, deactivateWorkspacePerson, transferPresidency } from "@/lib/supabase/people-access";
import { useWorkspacePresence } from "@/lib/supabase/presence";
import { supabase } from "@/lib/supabase/client";
import { SpatialDialog, type SpatialRun } from "./spatial-capabilities";
import type { SpatialProfile } from "./spatial-authenticated-launch";
import styles from "./spatial.module.css";

export type SpatialSurface = "governance" | "records" | "commitments" | "account" | "compass" | "completed" | null;
export function SpatialSurfaces({ surface, workspace, profile, run, governanceTargetProposalId, onClose, onSurface, onProject, onAction, onCapture, onSignOut }: {
  surface: SpatialSurface; workspace: WorkspaceData; profile: SpatialProfile; run: SpatialRun; governanceTargetProposalId?: string | null; onClose: () => void;
  onSurface: (surface: SpatialSurface) => void; onProject: (id: string) => void; onAction: (action: Action) => void; onCapture: () => void; onSignOut: () => void;
}) {
  const [inviteAllowed, setInviteAllowed] = useState(false);
  const presence = useWorkspacePresence(profile.id);
  useEffect(() => { let alive = true; void canInvitePeople().then(allowed => { if (alive) setInviteAllowed(allowed); }).catch(() => { if (alive) setInviteAllowed(false); }); return () => { alive = false; }; }, [workspace]);
  const name = (id: string) => workspace.people.find(p => p.id === id)?.name ?? "Unknown";
  async function startMeeting(proposal: GovernanceProposal) {
    const url = new URL(window.location.href);
    url.search = "?governanceMeeting=1";
    url.searchParams.set("proposal", proposal.id);
    window.open(url, "_blank", "noopener");
  }
  if (!surface) return null;
  if (surface === "compass") return <div className={styles.adapted}><SpatialCompass onClose={onClose} onPassword={() => onSurface("account")} /></div>;
  if (surface === "account") return <SpatialDialog title="Account & access" onClose={onClose}><SpatialAccount workspace={workspace} profile={profile} run={run} onSignOut={onSignOut} /></SpatialDialog>;
  if (surface === "completed") return <SpatialDialog title="Completed projects" onClose={onClose}><div className={styles.sourceList}>{workspace.projects.filter(p => p.status === "complete").map(p => <button key={p.id} onClick={() => onProject(p.id)}><strong>{p.title}</strong><small>{name(p.ownerId)} · completed · open context or reopen</small></button>)}</div></SpatialDialog>;
  if (surface === "commitments") return <SpatialDialog title="All commitments" onClose={onClose}><CommitmentsOverview workspace={workspace} userId={profile.id} run={run} onOpen={onAction} /></SpatialDialog>;
  return <section className={`${styles.mainSurface} ${styles.adapted}`} aria-label={surface === "records" ? "Records" : "Governance"}>
    <header className={styles.surfaceHeading}><div><span className={styles.eyebrow}>SDBP</span><h1>{surface === "records" ? "Records" : "Governance"}</h1></div><button onClick={onClose}>← Spatial workspace</button></header>
    {surface === "records" ? <RecordsView governanceProposals={workspace.governanceProposals} tensions={workspace.tensions} profileId={profile.id} /> : <>
      <section className={styles.secondarySection}><h2>People, roles & availability</h2><OrganisationWorkspaceView workspace={workspace} currentUserId={profile.id} canInvite={inviteAllowed} personName={name} presence={presence} onInvite={(n, email) => run(() => invitePerson(n, email), "Invitation sent.")} onSaveRole={role => run(() => saveRole(role))} onDeleteRole={id => run(() => deleteRole(id))} onOpenProject={onProject} /></section>
      <GovernanceWorkspaceView workspace={workspace} currentUserId={profile.id} personName={name} focusProposalId={governanceTargetProposalId} onCreateProposal={input => run(() => createGovernanceProposal({ ...input, proposerId: profile.id }))} onStartMeeting={startMeeting} onGoTensions={onCapture} onGoRecords={() => onSurface("records")} />
    </>}
  </section>;
}

function SpatialCompass({ onClose, onPassword }: { onClose: () => void; onPassword: () => void }) {
  return <div className="modal-backdrop compass-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="compass-modal" role="dialog" aria-modal="true" aria-labelledby="spatial-compass-title">
      <div className="editor-head"><div><span className="section-kicker">SDBP Compass</span><h2 id="spatial-compass-title">Navigating the spatial workspace</h2></div><button className="quiet editor-close" type="button" onClick={onClose} aria-label="Close Compass">×</button></div>
      <div className="compass-grid">
        <section><h3>Your project landscape</h3><p>Project circles give you a personal view of the work. Their size reflects relevance to you, and you can adjust that prominence yourself.</p></section>
        <section><h3>Follow what needs you</h3><p>When something explicitly needs your attention, the relevant circle softly pulses. Follow the pulse deeper until you reach the request, mention, commitment or other item that needs you.</p></section>
        <section><h3>Bring something up</h3><p>Use <strong>Bring something up</strong> when something needs dealing with. You do not need to decide first whether it is a task, request, conversation or governance issue.</p></section>
        <section><h3>Keep coordination states distinct</h3><p>Conversation, requests and commitments are different. Use requests when somebody owes a response and commitments when somebody explicitly owns an action.</p></section>
        <section><h3>Change structure deliberately</h3><p><strong>Governance</strong> is for ongoing roles, responsibilities, authority and standing ways of working.</p></section>
        <section><h3>Keep organisational memory</h3><p><strong>Records</strong> contains statutes, approved minutes and accepted governance decisions.</p></section>
      </div>
      <div className="compass-principle"><strong>The app makes organisational reality visible. It does not run the organisation.</strong><p>People still make commitments, have conversations, exercise judgement and do the work.</p></div>
      <div className="compass-account"><div><h3>Your account</h3><p>Use the email address you were invited with. If you forget your password, use the reset link on the sign-in screen.</p></div><button className="secondary" type="button" onClick={onPassword}>Change password</button></div>
    </section>
  </div>;
}

function CommitmentsOverview({ workspace, userId, run, onOpen }: { workspace: WorkspaceData; userId: string; run: SpatialRun; onOpen: (action: Action) => void }) {
  const [filter, setFilter] = useState<"active" | "done">("active");
  const [busy, setBusy] = useState<string | null>(null);
  const actions = workspace.actions.filter(a => filter === "done" ? a.status === "done" : a.status === "open" || a.status === "proposed");
  return <><div className={styles.toolLinks}><button aria-pressed={filter === "active"} onClick={() => setFilter("active")}>Open & proposed</button><button aria-pressed={filter === "done"} onClick={() => setFilter("done")}>Completed</button></div>
    <div className={styles.aggregateList}>{actions.map(a => {
      const source = a.sourceTensionId ? workspace.tensions.find(t => t.id === a.sourceTensionId)?.title : workspace.projects.find(p => p.id === a.projectId)?.title;
      return <article key={a.id} data-personal={a.ownerId === userId && a.status !== "done" || undefined}><button className={styles.sourceTitle} onClick={() => onOpen(a)}><strong>{a.title}</strong><small>{workspace.people.find(p => p.id === a.ownerId)?.name ?? "Unknown"} · {a.status === "open" ? "accepted / open" : a.status}{a.due ? ` · ${a.status !== "done" && a.due < todayISO() ? "overdue · " : "due "}${a.due}` : ""}</small><small>{source ? `${a.sourceTensionId ? "From tension" : "Project"} · ${source}` : "No source project or tension recorded"}</small></button>
        {a.ownerId === userId && a.status !== "done" && <button disabled={busy === a.id} onClick={async () => { setBusy(a.id); await run(() => setActionStatus(a.id, a.status === "proposed" ? "open" : "done")); setBusy(null); }}>{a.status === "proposed" ? "Accept" : "Done"}</button>}
      </article>;
    })}{!actions.length && <p>No commitments in this view.</p>}</div></>;
}

function SpatialAccount({ workspace, profile, run, onSignOut }: { workspace: WorkspaceData; profile: SpatialProfile; run: SpatialRun; onSignOut: () => void }) {
  const [admin, setAdmin] = useState(false);
  const [president, setPresident] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { let alive = true; void Promise.all([canInvitePeople(), isCurrentPresident()]).then(([a, p]) => { if (alive) { setAdmin(a); setPresident(p); } }).catch(e => { if (alive) setMessage(String(e.message ?? e)); }); return () => { alive = false; }; }, [workspace]);
  const presidentId = workspace.roles.find(r => r.category === "board" && r.title.trim().toLowerCase() === "president")?.holderIds[0];
  return <div className={styles.account}><p>{profile.name}<br /><small>{profile.email}</small></p><details><summary>Password</summary><form className={styles.simpleForm} onSubmit={async e => {
    e.preventDefault(); if (password !== confirm) { setMessage("The two passwords do not match."); return; } setBusy(true);
    const ok = await run(async () => { const { data, error } = await supabase.auth.getUser(); if (error) throw error; const saved = await supabase.auth.updateUser({ password, data: { ...data.user?.user_metadata, sdbp_password_set: true } }); if (saved.error) throw saved.error; }, "Password saved."); setBusy(false); if (ok) { setPassword(""); setConfirm(""); setMessage("Password saved."); }
  }}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} /></label><label>Confirm password<input type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={e => setConfirm(e.target.value)} /></label><button disabled={busy}>Save password</button></form></details>
    {admin && <details><summary>People access</summary><p>Removing access preserves organisational history.</p>{workspace.people.map(p => <article key={p.id} className={styles.accessPerson}><div><strong>{p.name}</strong><small>{p.email} · {p.linked ? "Active member" : "Invitation pending"}{p.id === presidentId ? " · President" : ""}</small></div><div className={styles.toolLinks}>
      {!p.linked && <button disabled={busy} onClick={async () => { setBusy(true); await run(() => resendWorkspaceInvitation(p), "Invitation resent."); setBusy(false); }}>Resend invitation</button>}
      {p.id !== profile.id && p.id !== presidentId && <button disabled={busy} onClick={async () => { if (!window.confirm(p.linked ? `Remove ${p.name}'s access? Their organisational history will remain.` : `Remove the pending invitation for ${p.name}? The invitation link will no longer grant access.`)) return; setBusy(true); await run(() => deactivateWorkspacePerson(p.id), "Access removed; history preserved."); setBusy(false); }}>{p.linked ? "Remove member" : "Remove invitation"}</button>}
    </div></article>)}</details>}
    {president && <details><summary>Presidency transfer</summary><form className={styles.simpleForm} onSubmit={async e => { e.preventDefault(); if (!target || !window.confirm(`Transfer the presidency and its organisational admin rights to ${workspace.people.find(p => p.id === target)?.name}?`)) return; setBusy(true); if (await run(() => transferPresidency(target), "Presidency transferred.")) { setTarget(""); setPresident(false); setAdmin(false); } setBusy(false); }}><label>New President<select value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose a member</option>{workspace.people.filter(p => p.linked && p.id !== profile.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={busy || !target}>Transfer presidency</button></form></details>}
    {message && <p role="status">{message}</p>}<button onClick={onSignOut}>Sign out</button>
  </div>;
}

export function SpatialTactical({ profile }: { profile: SpatialProfile }) { return <div className={styles.adapted}><TacticalMeeting liveProfile={profile} /></div>; }
export function SpatialGovernanceMeeting({ profile, initialProposalId }: { profile: SpatialProfile; initialProposalId?: string }) { return <div className={styles.adapted}><GovernanceMeeting liveProfile={profile} initialProposalId={initialProposalId} /></div>; }
