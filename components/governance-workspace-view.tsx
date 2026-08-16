"use client";

import { useEffect, useState } from "react";
import type { GovernanceEffect, GovernanceProposal, Tension } from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";
import type { WorkspaceData, WorkspacePerson } from "@/lib/supabase/workspace";
import { HelpTip } from "@/components/guidance";
import { MeetingPlanning } from "@/components/meeting-planning";
import { GovernanceEffectEditor, governanceEffectIsComplete, governanceEffectSummary, AGREEMENT_CATEGORIES } from "@/components/governance-effect-editor";
import { useLocalDraft } from "@/lib/local-draft";

type ConsentRound = {
  proposal_id: string;
  status: "open" | "meeting_required" | "accepted";
  started_by: string;
  started_at: string;
  ended_at?: string | null;
};

type ConsentResponse = {
  proposal_id: string;
  person_id: string;
  response: "no_objection" | "objection";
  objection_text?: string | null;
  responded_at: string;
};

export function GovernanceWorkspaceView({ workspace, currentUserId, personName, onCreateProposal, onStartMeeting, onGoTensions, onGoRecords }: {
  workspace: WorkspaceData;
  currentUserId: string;
  personName: (id: string) => string;
  onCreateProposal: (input: { tensionId: string; title: string; proposal: string; governanceEffect: GovernanceEffect }) => Promise<boolean>;
  onStartMeeting: (proposal: GovernanceProposal) => Promise<void>;
  onGoTensions: () => void;
  onGoRecords: () => void;
}) {
  const used = new Set(workspace.governanceProposals.map((proposal) => proposal.tensionId));
  const ready = workspace.tensions.filter((tension) => tension.status === "governance" && !used.has(tension.id));
  const open = workspace.governanceProposals.filter((proposal) => proposal.stage !== "accepted");
  const accepted = workspace.governanceProposals.filter((proposal) => proposal.stage === "accepted");
  const boardRoles = workspace.roles.filter((role) => role.category === "board");
  const operatingRoles = workspace.roles.filter((role) => role.category === "operating");
  const currentAgreements = workspace.standingAgreements.filter((agreement) => agreement.status === "current");

  return <>
    <div className="governance-lean-intro"><strong>Current Governance shows what is true now.</strong><HelpTip label="What belongs in Governance?">Use Governance for changes that remain true after today: roles, responsibilities, authority or standing ways of working. Decision History explains how Current Governance got here; the activity ledger only shows who changed what and when.</HelpTip></div>
    <MeetingPlanning people={workspace.people} currentUserId={currentUserId} personName={personName} />
    <section className="section current-governance-section"><div className="section-head"><div><span className="section-kicker">Present structure</span><h2>Current Governance</h2></div></div><div className="current-governance-grid"><article className="current-governance-card foundation-card"><span className="kind">Foundation</span><h3>SDBP Statutes</h3><p>The statutes remain the legal foundation. The Workspace does not rewrite them through ordinary governance.</p><button className="secondary small" onClick={onGoRecords}>Open in Records</button></article><RoleGroup title="Board roles" roles={boardRoles} personName={personName} /><RoleGroup title="Operating roles" roles={operatingRoles} personName={personName} /></div><div className="standing-agreements-block"><div className="section-head compact-section-head"><div><span className="section-kicker">Standing agreements</span><h3>Ongoing ways of working</h3></div></div>{currentAgreements.length ? <div className="agreement-groups">{AGREEMENT_CATEGORIES.map((category) => { const items = currentAgreements.filter((agreement) => agreement.category === category.value); if (!items.length) return null; return <section className="agreement-group" key={category.value}><h4>{category.label}</h4><div className="agreement-list">{items.map((agreement) => <details className="governance-detail" key={agreement.id}><summary><strong>{agreement.title}</strong></summary><p>{agreement.body}</p></details>)}</div></section>; })}</div> : <div className="calm-empty compact-empty governance-empty"><span>○</span><h3>No standing agreements recorded yet</h3><p>They appear here when a governance proposal explicitly creates one.</p></div>}</div></section>
    {ready.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Needs a proposal</span><h2>Structural tensions</h2></div></div><div className="governance-ready-list">{ready.map((tension) => <ProposalStarter key={tension.id} tension={tension} mine={tension.raiserId === currentUserId} personName={personName} workspace={workspace} currentUserId={currentUserId} onCreate={onCreateProposal} />)}</div></section>}
    {open.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Prepared</span><h2>Ready to process</h2></div></div><div className="governance-proposal-stack">{open.map((proposal) => <article className="governance-proposal-card" key={proposal.id}><div className="governance-proposal-head"><div><span className="kind">Proposed by {personName(proposal.proposerId)}</span><h3>{proposal.title}</h3></div><span className="governance-stage-badge">{stageName(proposal.stage)}</span></div><div className="governance-proposal-text"><strong>Proposal</strong><p>{proposal.proposal}</p></div><div className="effect-summary-line">{governanceEffectSummary(proposal.governanceEffect, workspace.roles, workspace.standingAgreements)}</div><QuickConsentPanel proposal={proposal} people={workspace.people} currentUserId={currentUserId} personName={personName} onStartMeeting={onStartMeeting} /></article>)}</div></section>}
    {!ready.length && !open.length && <div className="governance-no-waiting"><span>✓</span><div><strong>No governance item is waiting.</strong><p>If something structural needs to change, raise the tension first.</p></div><button className="secondary small" onClick={onGoTensions}>Go to Tensions</button></div>}
    <details className="governance-history section"><summary><div><span className="section-kicker">Institutional memory</span><h2>Decision History</h2><p>{accepted.length} accepted {accepted.length === 1 ? "decision" : "decisions"}</p></div><span className="history-chevron">⌄</span></summary>{accepted.length ? <div className="decision-history-list">{accepted.map((proposal) => <article className="decision-history-row" key={proposal.id}><div><span className="kind">{proposal.acceptedAt ? formatDate(proposal.acceptedAt) : "Accepted"} · {personName(proposal.proposerId)}</span><h3>{proposal.title}</h3><p>{governanceEffectSummary(proposal.governanceEffect, workspace.roles, workspace.standingAgreements)}</p></div><details><summary>Read decision</summary><p className="decision-text">{proposal.proposal}</p></details></article>)}</div> : <div className="calm-empty compact-empty"><span>○</span><h3>No accepted governance yet</h3></div>}</details>
  </>;
}

function QuickConsentPanel({ proposal, people, currentUserId, personName, onStartMeeting }: {
  proposal: GovernanceProposal;
  people: WorkspacePerson[];
  currentUserId: string;
  personName: (id: string) => string;
  onStartMeeting: (proposal: GovernanceProposal) => Promise<void>;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [round, setRound] = useState<ConsentRound | null>(null);
  const [responses, setResponses] = useState<ConsentResponse[]>([]);
  const [objectionOpen, setObjectionOpen] = useState(false);
  const [objectionText, setObjectionText, clearObjection] = useLocalDraft(`governance:objection:${proposal.id}:${currentUserId}`, "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const consentEligible = proposal.stage === "prepared" || proposal.stage === "present_proposal";

  async function load() {
    const roundResult = await supabase
      .from("governance_consent_rounds")
      .select("proposal_id,status,started_by,started_at,ended_at")
      .eq("proposal_id", proposal.id)
      .maybeSingle();

    if (roundResult.error) {
      if (isOptionalConsentSchemaError(roundResult.error)) {
        setSupported(false);
        setRound(null);
        setResponses([]);
        return;
      }
      throw roundResult.error;
    }

    setSupported(true);
    const nextRound = roundResult.data as ConsentRound | null;
    setRound(nextRound);

    if (!nextRound) {
      setResponses([]);
      return;
    }

    const responseResult = await supabase
      .from("governance_consent_responses")
      .select("proposal_id,person_id,response,objection_text,responded_at")
      .eq("proposal_id", proposal.id)
      .order("responded_at", { ascending: true });
    if (responseResult.error) throw responseResult.error;
    setResponses((responseResult.data ?? []) as ConsentResponse[]);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const roundResult = await supabase
          .from("governance_consent_rounds")
          .select("proposal_id,status,started_by,started_at,ended_at")
          .eq("proposal_id", proposal.id)
          .maybeSingle();
        if (!alive) return;
        if (roundResult.error) {
          if (isOptionalConsentSchemaError(roundResult.error)) {
            setSupported(false);
            return;
          }
          throw roundResult.error;
        }
        setSupported(true);
        const nextRound = roundResult.data as ConsentRound | null;
        setRound(nextRound);
        if (!nextRound) return;
        const responseResult = await supabase
          .from("governance_consent_responses")
          .select("proposal_id,person_id,response,objection_text,responded_at")
          .eq("proposal_id", proposal.id)
          .order("responded_at", { ascending: true });
        if (!alive) return;
        if (responseResult.error) throw responseResult.error;
        setResponses((responseResult.data ?? []) as ConsentResponse[]);
      } catch (err) {
        if (alive) setError(readError(err));
      }
    })();
    return () => { alive = false; };
  }, [proposal.id]);

  if (!consentEligible && !round) {
    return <div className="process-actions"><button className="primary" onClick={() => void onStartMeeting(proposal)}>Continue meeting</button></div>;
  }

  if (supported === false) {
    return <div className="process-actions"><button className="primary" onClick={() => void onStartMeeting(proposal)}>{proposal.stage === "prepared" ? "Start governance meeting" : "Continue meeting"}</button></div>;
  }

  async function startConsent() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("start_governance_quick_consent", { target_proposal_id: proposal.id });
      if (result.error) throw result.error;
      await load();
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  async function respond(response: "no_objection" | "objection") {
    if (busy) return;
    if (response === "objection" && !objectionText.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("respond_governance_quick_consent", {
        target_proposal_id: proposal.id,
        consent_response: response,
        objection_reason: response === "objection" ? objectionText.trim() : null,
      });
      if (result.error) throw result.error;
      setObjectionOpen(false);
      clearObjection();
      await load();
      if (result.data === "accepted") window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(readError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!round) {
    const switching = proposal.stage === "present_proposal";
    return <div className="governance-round">
      <span className="kind">Processing choice</span>
      <h4>{switching ? "Switch this item to quick consent?" : "How should this proposal be processed?"}</h4>
      <p>{switching ? "The meeting has only been opened to the proposal-presentation stage. The proposer can still reroute it to explicit asynchronous consent. Once governance processing moves beyond presenting the proposal, continue in the meeting." : "Choose quick consent when the proposal is clear enough to process asynchronously. Everyone must explicitly record no objection. A single objection sends it to a governance meeting."}</p>
      <div className="process-actions">
        {proposal.proposerId === currentUserId && <button className="secondary" type="button" disabled={busy || supported === null} onClick={() => void startConsent()}>{busy ? "Starting…" : switching ? "Switch to quick consent" : "Quick consent"}</button>}
        <button className="primary" type="button" onClick={() => void onStartMeeting(proposal)}>{switching ? "Continue governance meeting" : "Governance meeting"}</button>
      </div>
      {error && <div className="auth-message error">{error}</div>}
    </div>;
  }

  if (round.status === "meeting_required") {
    const objections = responses.filter((response) => response.response === "objection");
    return <div className="governance-round">
      <span className="kind">Quick consent stopped</span>
      <h4>Governance meeting required</h4>
      <p>An objection is not a preference, disagreement, or a better idea. It identifies a concrete way this proposal could harm SDBP or move us backward.</p>
      {objections.length > 0 && <div className="governance-entry-list">{objections.map((response) => <div className="governance-entry objection-valid" key={response.person_id}><strong>Objection · {personName(response.person_id)}</strong><p>{response.objection_text}</p></div>)}</div>}
      <div className="process-actions"><button className="primary" type="button" onClick={() => void onStartMeeting(proposal)}>Start governance meeting</button></div>
    </div>;
  }

  if (round.status === "accepted") {
    return <div className="governance-round"><span className="kind">Quick consent</span><h4>Accepted by explicit consent</h4><p>Everyone recorded no objection. The proposal is being moved into Current Governance.</p></div>;
  }

  const responseByPerson = new Map(responses.map((response) => [response.person_id, response]));
  const ownResponse = responseByPerson.get(currentUserId);

  return <div className="governance-round">
    <span className="kind">Quick consent</span>
    <h4>{responses.length} of {people.length} responded</h4>
    <p>Silence does not count as consent. Every board member must respond. Any objection stops this round and sends the proposal to a governance meeting.</p>
    <div className="round-participation"><strong>Board response</strong><div>{people.map((person) => {
      const response = responseByPerson.get(person.id);
      return <span className={response?.response === "no_objection" ? "complete" : "waiting"} key={person.id}>{person.name} · {response?.response === "no_objection" ? "no objection" : "waiting"}</span>;
    })}</div></div>
    <div className="process-actions">
      <button className={ownResponse?.response === "no_objection" ? "secondary" : "primary"} type="button" disabled={busy} onClick={() => void respond("no_objection")}>{ownResponse?.response === "no_objection" ? "No objection ✓" : "No objection"}</button>
      <button className="secondary" type="button" disabled={busy} onClick={() => setObjectionOpen((value) => !value)}>Objection</button>
    </div>
    {objectionOpen && <div className="governance-inline-form">
      <div className="objection-essential"><strong>State the concrete harm or risk.</strong><p>An objection is not a preference, disagreement, or a better idea. It identifies a concrete way this proposal could harm SDBP or move us backward.</p></div>
      <label className="field"><span>Objection</span><textarea rows={3} value={objectionText} onChange={(event) => setObjectionText(event.target.value)} placeholder="If we adopt this proposal, what concrete harm or risk could result?" /></label>
      {objectionText.trim() && <small className="draft-saved-note">Draft saved on this device.</small>}
      <div className="process-actions"><button className="quiet" type="button" onClick={() => { setObjectionOpen(false); clearObjection(); }}>Cancel</button><button className="primary" type="button" disabled={!objectionText.trim() || busy} onClick={() => void respond("objection")}>Raise objection</button></div>
    </div>}
    {error && <div className="auth-message error">{error}</div>}
  </div>;
}

function RoleGroup({ title, roles, personName }: { title: string; roles: WorkspaceData["roles"]; personName: (id: string) => string }) {
  return <article className="current-governance-card role-group-card"><span className="kind">{title}</span><div className="current-role-list">{roles.length ? roles.map((role) => <details className="governance-detail" key={role.id}><summary><strong>{role.title}</strong><small>{role.holderIds.length ? role.holderIds.map(personName).join(", ") : "unfilled"}</small></summary>{role.purpose && <p><strong>Purpose</strong><br />{role.purpose}</p>}{role.scope && <p><strong>Scope</strong><br />{role.scope}</p>}{role.responsibilities.length > 0 && <div><strong>Responsibilities</strong><ul>{role.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul></div>}{role.accountabilities.length > 0 && <div><strong>Accountabilities</strong><ul>{role.accountabilities.map((item) => <li key={item}>{item}</li>)}</ul></div>}</details>) : <p className="muted-copy">No roles in this group.</p>}</div></article>;
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

  return <article className="governance-starter">
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

function stageName(stage: GovernanceProposal["stage"]) { return ({ prepared: "Prepared", present_proposal: "Present proposal", clarifying_questions: "Clarifying questions", reaction_round: "Reaction round", clarify: "Option to clarify", objection_round: "Objection round", integration: "Integration", accepted: "Accepted" } as Record<GovernanceProposal["stage"], string>)[stage]; }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`)); }
function readError(error: unknown) { return error instanceof Error ? error.message : "Quick consent could not be updated."; }
function isOptionalConsentSchemaError(error: { code?: string; message?: string }) { return error.code === "42P01" || error.code === "PGRST205" || /governance_consent|does not exist|schema cache/i.test(error.message ?? ""); }