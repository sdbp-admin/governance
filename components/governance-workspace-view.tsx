"use client";

import { useEffect, useState } from "react";
import type { GovernanceEffect, GovernanceProposal, Tension } from "@/lib/domain";
import type { WorkspaceData } from "@/lib/supabase/workspace";
import { supabase } from "@/lib/supabase/client";
import { GovernanceFocus } from "./governance-focus";
import styles from "./organisation-governance.module.css";
import { MeetingPlanning } from "@/components/meeting-planning";
import { GovernanceEffectEditor, governanceEffectIsComplete, governanceEffectSummary } from "@/components/governance-effect-editor";
import { ValidatedQuickConsentPanel } from "@/components/governance-quick-consent";
import { useLocalDraft } from "@/lib/local-draft";

export function GovernanceWorkspaceView({ workspace, currentUserId, personName, focusProposalId, consentProposalIds = [], onResponseRecorded, pulseUntilForProposal, onProposalPulsePause, onCreateProposal, onStartMeeting, onGoTensions, onGoRecords }: {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  focusProposalId?: string | null;
  consentProposalIds?: string[];
  onResponseRecorded?: () => void;
  pulseUntilForProposal?: (id: string) => number | undefined;
  onProposalPulsePause?: (id: string, hours: 0 | 24 | 48 | 72 | 168) => void;
  onCreateProposal: (input: { tensionId: string; title: string; proposal: string; governanceEffect: GovernanceEffect }) => Promise<boolean>;
  onStartMeeting: (proposal: GovernanceProposal) => Promise<void>;
  onGoTensions: () => void;
  onGoRecords: () => void;
}) {
  const used = new Set(workspace.governanceProposals.map((proposal) => proposal.tensionId));
  const ready = workspace.tensions.filter((tension) => tension.status === "governance" && !used.has(tension.id));
  const open = workspace.governanceProposals.filter((proposal) => proposal.stage !== "accepted" && proposal.stage !== "withdrawn");
  const accepted = workspace.governanceProposals.filter((proposal) => proposal.stage === "accepted");
  const [view, setView] = useState<"proposals" | "preparation" | "meetings" | "history">("proposals");
  const [selectedId, setSelectedId] = useState<string | null>(focusProposalId ?? null);
  const [tensionId, setTensionId] = useState<string | null>(null);
  const [rounds, setRounds] = useState<{ proposal_id: string; status: string; deadline_at: string | null }[]>([]);
  const [roundError, setRoundError] = useState("");
  const selected = workspace.governanceProposals.find(proposal => proposal.id === selectedId);
  const proposedRole = selected?.governanceEffect?.kind === "role" ? selected.governanceEffect.role : undefined;
  const selectedTension = ready.find(tension => tension.id === tensionId);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const result = await supabase.from("governance_consent_rounds").select("proposal_id,status,deadline_at");
      if (!alive) return;
      if (result.error) setRoundError("Consent status could not be loaded. Open a proposal to check its response round.");
      else { setRounds(result.data ?? []); setRoundError(""); }
    };
    void load();
    window.addEventListener("focus", load);
    const timer = window.setInterval(load, 60_000);
    return () => { alive = false; window.removeEventListener("focus", load); window.clearInterval(timer); };
  }, [workspace.governanceProposals, revision]);

  useEffect(() => {
    if (focusProposalId) { setSelectedId(focusProposalId); setView("proposals"); }
  }, [focusProposalId]);

  function responseRecorded() { setRevision(value => value + 1); onResponseRecorded?.(); }
  function selectProposal(id: string) { setSelectedId(id); }
  const roundFor = (id: string) => rounds.find(round => round.proposal_id === id);
  const labelFor = (proposal: GovernanceProposal) => {
    const round = roundFor(proposal.id);
    if (proposal.stage === "accepted" || proposal.stage === "withdrawn") return stageName(proposal.stage);
    return round?.status === "open" ? "Quick Consent open" : round?.status === "meeting_required" ? "Governance meeting needed" : stageName(proposal.stage);
  };

  return <>
    <div className={styles.toolbar}>
      <nav className={styles.tabs} aria-label="Governance views">
        <button aria-pressed={view === "proposals"} onClick={() => setView("proposals")}>Active proposals · {open.length}</button>
        <button aria-pressed={view === "preparation"} onClick={() => setView("preparation")}>Needs preparation · {ready.length}</button>
        <button aria-pressed={view === "meetings"} onClick={() => setView("meetings")}>Meetings & availability</button>
        <button aria-pressed={view === "history"} onClick={() => setView("history")}>Decision history · {accepted.length}</button>
      </nav>
    </div>
    {view === "proposals" && <>
      <div className={styles.legend}><span>Every active proposal · select a circle to read and respond</span><span>{consentProposalIds.length ? `${consentProposalIds.length} awaiting your Quick Consent response` : "No Quick Consent response waiting for you"}</span></div>
      {roundError && <p role="status">{roundError}</p>}
      <div className={styles.landscape} aria-label="All active governance proposals">
        {open.map(proposal => {
          const due = consentProposalIds.includes(proposal.id);
          const paused = (pulseUntilForProposal?.(proposal.id) ?? 0) > Date.now();
          const round = roundFor(proposal.id);
          return <button key={proposal.id} className={styles.object} data-due={due || undefined} data-pulse={due && !paused || undefined} onClick={() => selectProposal(proposal.id)}>
            <small>{labelFor(proposal)}</small><strong>{proposal.title}</strong><small>{personName(proposal.proposerId)}</small>
            {round?.status === "open" && round.deadline_at && <small>Respond by {new Date(round.deadline_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small>}
            {due && <span className={styles.due}>Your response needed{paused ? " · pulse paused" : ""}</span>}
          </button>;
        })}
        {!open.length && <div className={styles.empty}><h2>No active proposals</h2><p>{ready.length ? `${ready.length} structural tensions are ready for proposal preparation.` : "Raise a tension when something in the organisation needs to change."}</p><button className="secondary small" onClick={() => ready.length ? setView("preparation") : onGoTensions()}>{ready.length ? "Prepare a proposal" : "Bring something up"}</button></div>}
      </div>
    </>}
    {view === "preparation" && <><p className="muted-copy">Turn a structural tension into a defined change to a role, circle or standing agreement.</p><div className={styles.landscape}>{ready.map(tension => <button className={styles.object} data-stage="preparation" key={tension.id} onClick={() => setTensionId(tension.id)}><small>Needs a proposal</small><strong>{tension.title}</strong><small>Raised by {personName(tension.raiserId)}</small></button>)}{!ready.length && <p className={styles.empty}>No structural tensions waiting for a proposal.</p>}</div><button className="secondary small" onClick={onGoTensions}>Bring something up</button></>}
    {view === "meetings" && <><button className="secondary small" onClick={() => { const url = new URL(window.location.href); url.search = "?governanceMeeting=1"; window.open(url, "_blank", "noopener"); }}>Open Governance Meeting</button><MeetingPlanning people={workspace.people} currentUserId={currentUserId} personName={personName} /></>}
    {view === "history" && <><p className="muted-copy">Accepted changes form the current organisation. Withdrawn proposals remain in the record.</p><div className={styles.list}>{workspace.governanceProposals.filter(proposal => proposal.stage === "accepted" || proposal.stage === "withdrawn").map(proposal => <button className={styles.listRow} key={proposal.id} onClick={() => selectProposal(proposal.id)}><span><strong>{proposal.title}</strong><small>{governanceEffectSummary(proposal.governanceEffect, workspace.roles, workspace.standingAgreements)}</small></span><small>{proposal.stage === "withdrawn" ? "Withdrawn" : proposal.acceptedAt ? formatDate(proposal.acceptedAt) : "Accepted"}</small></button>)}</div><button className="secondary small" onClick={onGoRecords}>Open Records</button></>}
    {selected && <GovernanceFocus key={selected.id} title="Governance proposal" onClose={() => setSelectedId(null)} focusTargetId={consentProposalIds.includes(selected.id) ? `governance-consent-${selected.id}` : undefined}>
      <article id={`governance-proposal-${selected.id}`} tabIndex={-1}>
        <span className="kind">Proposed by {personName(selected.proposerId)} · {labelFor(selected)}</span><h2>{selected.title}</h2>
        <p>{selected.proposal}</p>
        <div className="effect-summary-line">{selected.stage === "accepted" ? "" : "Proposed change: "}{governanceEffectSummary(selected.governanceEffect, workspace.roles, workspace.standingAgreements)}</div>
        {proposedRole && <details className={styles.secondary}><summary>Read proposed {proposedRole.isCircle ? "circle" : "role"} definition</summary><p><strong>Within</strong><br />{workspace.roles.find(role => role.id === proposedRole.parentId)?.title ?? "SDBP"}</p><p><strong>Purpose</strong><br />{proposedRole.purpose || "Not defined."}</p><p><strong>Scope / domain</strong><br />{proposedRole.scope || "Not defined."}</p><strong>Responsibilities</strong><ul>{proposedRole.responsibilities.map((item, index) => <li key={index}>{item}</li>)}</ul><strong>Accountabilities</strong><ul>{proposedRole.accountabilities.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
        {workspace.tensions.find(tension => tension.id === selected.tensionId) && <details className={styles.secondary}><summary>Source tension</summary><p>{workspace.tensions.find(tension => tension.id === selected.tensionId)?.title}</p></details>}
        <div id={`governance-consent-${selected.id}`} tabIndex={-1}><ValidatedQuickConsentPanel proposal={selected} people={workspace.people} currentUserId={currentUserId} personName={personName} onStartMeeting={onStartMeeting} onGoTensions={onGoTensions} onResponseRecorded={responseRecorded} pulseUntil={pulseUntilForProposal?.(selected.id)} onPulsePause={consentProposalIds.includes(selected.id) && onProposalPulsePause ? hours => onProposalPulsePause(selected.id, hours) : undefined} /></div>
      </article>
    </GovernanceFocus>}
    {selectedTension && <GovernanceFocus key={selectedTension.id} title="Prepare governance" onClose={() => setTensionId(null)}><ProposalStarter tension={selectedTension} mine={selectedTension.raiserId === currentUserId} personName={personName} workspace={workspace} currentUserId={currentUserId} onCreate={async input => { const saved = await onCreateProposal(input); if (saved) { setTensionId(null); setView("proposals"); } return saved; }} /></GovernanceFocus>}
  </>;
}

function ProposalStarter({ tension, mine, personName, workspace, currentUserId, onCreate }: { tension: Tension; mine: boolean; personName: (id: string) => string; workspace: WorkspaceData; currentUserId: string; onCreate: (input: { tensionId: string; title: string; proposal: string; governanceEffect: GovernanceEffect }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft, clearDraft] = useLocalDraft<{ title: string; text: string; effect?: GovernanceEffect }>(`governance:proposal:${tension.id}:${currentUserId}`, { title: "", text: "" });
  const title = draft.title;
  const text = draft.text;
  const effect = draft.effect;
  const setTitle = (value: string) => setDraft((current) => ({ ...current, title: value }));
  const setText = (value: string) => setDraft((current) => ({ ...current, text: value }));
  const setEffect = (value: GovernanceEffect | undefined) => setDraft((current) => ({ ...current, effect: value }));
  const hasDraft = Boolean(title.trim() || text.trim() || effect);
  const valid = Boolean(title.trim() && text.trim() && governanceEffectIsComplete(effect));

  useEffect(() => {
    if (hasDraft) setOpen(true);
  }, [hasDraft]);

  async function save() {
    if (!effect || !valid) return;
    if (await onCreate({ tensionId: tension.id, title, proposal: text, governanceEffect: effect })) {
      clearDraft();
      setOpen(false);
    }
  }

  function discard() {
    clearDraft();
    setOpen(false);
  }

  return <article id={`governance-tension-${tension.id}`} className="governance-starter">
    <span className="kind">Raised by {personName(tension.raiserId)}</span>
    <h3 className="governance-tension-title">{tension.title}</h3>
    {!mine ? <small>The person who raised this tension can prepare the proposal.</small> : !open ? <>
      <p>Define the concrete governance change first. After saving it, choose Quick consent or a Governance meeting.</p>
      <button className="primary small" onClick={() => setOpen(true)}>Prepare proposal</button>
    </> : <div className="governance-inline-form">
      <div className="editor-note"><strong>Step 1 · Define the proposal.</strong><br />Once it is saved, this screen will ask whether to use Quick consent or a Governance meeting.</div>
      <label className="field"><span>Proposal title</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>What should change?</span><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label>
      <GovernanceEffectEditor effect={effect} roles={workspace.roles} standingAgreements={workspace.standingAgreements} onChange={setEffect} />
      {hasDraft && <small className="draft-saved-note">Draft saved on this device.</small>}
      <div className="process-actions"><button className="quiet" onClick={discard}>Discard draft</button><button className="primary small" disabled={!valid} onClick={() => void save()}>Save proposal & choose process</button></div>
    </div>}
  </article>;
}

function stageName(stage: GovernanceProposal["stage"]) { return ({ prepared: "Prepared", present_proposal: "Present proposal", clarifying_questions: "Clarifying questions", reaction_round: "Reaction round", clarify: "Option to clarify", objection_round: "Objection round", integration: "Integration", deferred: "Deferred", withdrawn: "Withdrawn", accepted: "Accepted" } as Record<GovernanceProposal["stage"], string>)[stage]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
