"use client";

import { useState } from "react";
import type { GovernanceProposal, GovernanceStage, Tension } from "@/lib/domain";
import { GOVERNANCE_STEPS, OBJECTION_TESTS } from "@/lib/governance-method";
import { humanGovernanceStage, personName } from "@/lib/prototype-utils";

type Props = {
  tensions: Tension[];
  proposals: GovernanceProposal[];
  currentUserId: string;
  facilitatorId?: string;
  meetingProposalId?: string;
  onGoToTensions: () => void;
  onCreateProposal: (tensionId: string, title: string, text: string) => void;
  onStartMeeting: (proposalId: string) => void;
  onSetStage: (proposalId: string, stage: GovernanceStage) => void;
  onSaveNotes: (proposalId: string, stage: GovernanceStage, note: string) => void;
  onUpdateProposal: (proposalId: string, text: string) => void;
  onAccept: (proposalId: string) => void;
};

export function GovernanceView(props: Props) {
  const used = new Set(props.proposals.map((proposal) => proposal.tensionId));
  const ready = props.tensions.filter((tension) => tension.status === "governance" && !used.has(tension.id));
  const prepared = props.proposals.filter((proposal) => proposal.stage === "prepared");
  const live = props.proposals.filter((proposal) => proposal.stage !== "prepared" && proposal.stage !== "accepted");
  const accepted = props.proposals.filter((proposal) => proposal.stage === "accepted");
  const meetingProposal = props.meetingProposalId ? props.proposals.find((proposal) => proposal.id === props.meetingProposalId) : undefined;

  if (props.meetingProposalId) {
    if (!meetingProposal) {
      return <div className="calm-empty"><span>○</span><h2>Meeting proposal not found</h2><p>Close this window and reopen the governance meeting from the main app.</p></div>;
    }
    if (meetingProposal.stage === "accepted") {
      return <div className="governance-meeting-surface"><div className="meeting-window-head"><div><span className="section-kicker">SDBP Governance Meeting</span><h1>Proposal accepted</h1><p>The result is being returned to the main governance app.</p></div></div><div className="calm-empty compact-empty"><span>✓</span><h3>{meetingProposal.title}</h3><p>{meetingProposal.proposal}</p></div></div>;
    }
    return <div className="governance-meeting-surface"><div className="meeting-window-head"><div><span className="section-kicker">SDBP Governance Meeting · facilitator view</span><h1>{meetingProposal.title}</h1><p>Share this window in the meeting. The facilitator controls the process; participants do not need to operate the software.</p></div><span className="governance-stage-badge">{humanGovernanceStage(meetingProposal.stage)}</span></div><LiveMeeting proposal={meetingProposal} tension={props.tensions.find((tension) => tension.id === meetingProposal.tensionId)} facilitatorId={props.facilitatorId} onSetStage={props.onSetStage} onSaveNotes={props.onSaveNotes} onUpdateProposal={props.onUpdateProposal} onAccept={props.onAccept} /></div>;
  }

  return <div className="governance-layout"><section className="governance-stage">
    <span className="section-kicker">Prepare here · meet live</span>
    <h2>Governance is facilitator-led</h2>
    <p>Prepare a structural tension and proposal in the app. When a real governance meeting starts, open the dedicated meeting window and share that screen. The facilitator advances the meeting; the software does not simulate each participant.</p>

    {ready.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Before the meeting</span><h2>Structural tensions needing a proposal</h2></div></div><div className="governance-ready-list">{ready.map((tension) => <Starter key={tension.id} tension={tension} user={props.currentUserId} create={props.onCreateProposal} />)}</div></section>}

    {prepared.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Prepared</span><h2>Ready for a governance meeting</h2></div></div><div className="governance-proposal-stack">{prepared.map((proposal) => <PreparedProposal key={proposal.id} proposal={proposal} tension={props.tensions.find((tension) => tension.id === proposal.tensionId)} onStart={() => props.onStartMeeting(proposal.id)} />)}</div></section>}

    {live.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Meeting in progress</span><h2>Governance meeting</h2></div><span className="muted">The same flow can run here if a popup was blocked</span></div><div className="governance-proposal-stack">{live.map((proposal) => <LiveMeeting key={`${proposal.id}-${proposal.stage}`} proposal={proposal} tension={props.tensions.find((tension) => tension.id === proposal.tensionId)} facilitatorId={props.facilitatorId} onSetStage={props.onSetStage} onSaveNotes={props.onSaveNotes} onUpdateProposal={props.onUpdateProposal} onAccept={props.onAccept} />)}</div></section>}

    {!ready.length && !prepared.length && !live.length && !accepted.length && <div className="calm-empty compact-empty"><span>○</span><h3>No governance item is waiting</h3><p>Raise a structural tension in Tensions and move it to Governance when a standing role, accountability, domain or policy needs to change.</p><button className="secondary small" onClick={props.onGoToTensions}>Go to Tensions</button></div>}

    {accepted.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Decided</span><h2>Accepted governance</h2></div></div><div className="soft-list">{accepted.map((proposal) => <div className="soft-row" key={proposal.id}><div><strong>{proposal.title}</strong><small>{proposal.proposal}</small></div><span className="definition-status defined">accepted</span></div>)}</div></section>}

    <MethodGuide facilitatorId={props.facilitatorId} />
  </section><aside className="governance-note"><span className="kind">Product boundary</span><h3>The app is the meeting aid</h3><p>The board still holds the meeting. The facilitator still listens, interprets and manages the process.</p><div className="note-divider" /><h3>What the app does</h3><p>Keeps the tension and proposal visible, shows the current step and objection criteria, captures useful notes, and records the resulting governance.</p></aside></div>;
}

function Starter({ tension, user, create }: { tension: Tension; user: string; create: (id: string, title: string, text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const mine = tension.raiserId === user;

  return <article className="governance-starter"><span className="kind">Structural tension · {personName(tension.raiserId)}</span><h3>{tension.title}</h3><p>{tension.latestNote}</p>{!mine ? <small>{personName(tension.raiserId)} can prepare the proposal before the meeting.</small> : !open ? <button className="primary small" onClick={() => setOpen(true)}>Prepare proposal</button> : <div className="governance-inline-form"><label className="field"><span>Proposal title</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label className="field"><span>Proposed governance change</span><textarea rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label><div className="process-actions"><button className="quiet" onClick={() => setOpen(false)}>Cancel</button><button className="primary small" disabled={!title.trim() || !text.trim()} onClick={() => create(tension.id, title, text)}>Save proposal for meeting</button></div></div>}</article>;
}

function PreparedProposal({ proposal, tension, onStart }: { proposal: GovernanceProposal; tension?: Tension; onStart: () => void }) {
  return <article className="governance-proposal-card"><div className="governance-proposal-head"><div><span className="kind">Proposed by {personName(proposal.proposerId)}</span><h3>{proposal.title}</h3></div><span className="governance-stage-badge">Prepared</span></div>{tension && <div className="governance-proposal-text"><strong>Source tension</strong><p>{tension.title}</p></div>}<div className="governance-proposal-text"><strong>Proposal</strong><p>{proposal.proposal}</p></div><div className="process-actions"><button className="primary" onClick={onStart}>Open governance meeting window ↗</button></div></article>;
}

function LiveMeeting({ proposal, tension, facilitatorId, onSetStage, onSaveNotes, onUpdateProposal, onAccept }: {
  proposal: GovernanceProposal;
  tension?: Tension;
  facilitatorId?: string;
  onSetStage: (id: string, stage: GovernanceStage) => void;
  onSaveNotes: (id: string, stage: GovernanceStage, note: string) => void;
  onUpdateProposal: (id: string, text: string) => void;
  onAccept: (id: string) => void;
}) {
  const [note, setNote] = useState(proposal.meetingNotes[proposal.stage] ?? "");
  const [proposalText, setProposalText] = useState(proposal.proposal);
  const meetingSteps = GOVERNANCE_STEPS.filter((step) => step.id !== "accepted");
  const stepIndex = meetingSteps.findIndex((step) => step.id === proposal.stage);
  const step = GOVERNANCE_STEPS.find((candidate) => candidate.id === proposal.stage);
  const previous = stepIndex > 0 ? meetingSteps[stepIndex - 1]?.id : undefined;

  function saveNote() {
    onSaveNotes(proposal.id, proposal.stage, note);
  }

  function advance(stage: GovernanceStage) {
    saveNote();
    onSetStage(proposal.id, stage);
  }

  function saveProposalAndAdvance(stage: GovernanceStage) {
    onUpdateProposal(proposal.id, proposalText);
    saveNote();
    onSetStage(proposal.id, stage);
  }

  return <article className="governance-proposal-card"><div className="governance-proposal-head"><div><span className="kind">Live governance meeting{facilitatorId ? ` · Facilitator: ${personName(facilitatorId)}` : ""}</span><h3>{proposal.title}</h3></div><span className="governance-stage-badge">{humanGovernanceStage(proposal.stage)}</span></div>
    {tension && <div className="governance-proposal-text"><strong>Source tension</strong><p>{tension.title}</p></div>}
    <div className="governance-proposal-text"><strong>Current proposal</strong><p>{proposal.proposal}</p></div>
    <div className="governance-progress">{GOVERNANCE_STEPS.map((candidate, index) => {
      const currentIndex = GOVERNANCE_STEPS.findIndex((item) => item.id === proposal.stage);
      return <span key={candidate.id} className={index < currentIndex ? "done" : candidate.id === proposal.stage ? "active" : ""}>{index + 1}<small>{candidate.name}</small></span>;
    })}</div>

    <div className="governance-round"><span className="section-kicker">Current step</span><h4>{step?.name}</h4><p>{step?.description}</p>
      {proposal.stage === "present_proposal" && <><div className="governance-proposal-text"><strong>Facilitator prompt</strong><p>Invite the proposer to state the tension and present the proposal. When the proposal is understood well enough to begin questions, move on.</p></div><MeetingButtons previous={previous} onPrevious={() => previous && onSetStage(proposal.id, previous)} onNext={() => advance("clarifying_questions")} nextLabel="Start Clarifying Questions" /></>}

      {proposal.stage === "clarifying_questions" && <><MeetingNote label="Important clarifications (optional)" value={note} onChange={setNote} placeholder="Capture only what will matter later; the app does not need a transcript." /><MeetingButtons previous={previous} onPrevious={() => previous && onSetStage(proposal.id, previous)} onNext={() => advance("reaction_round")} nextLabel="Start Reaction Round" /></>}

      {proposal.stage === "reaction_round" && <><MeetingNote label="Useful meeting notes (optional)" value={note} onChange={setNote} placeholder="Capture an important reaction only if it should remain part of the organisational record." /><MeetingButtons previous={previous} onPrevious={() => previous && onSetStage(proposal.id, previous)} onNext={() => advance("clarify")} nextLabel="Option to Clarify" /></>}

      {proposal.stage === "clarify" && <><label className="field"><span>Current proposal text</span><textarea rows={5} value={proposalText} onChange={(event) => setProposalText(event.target.value)} /></label><MeetingNote label="Clarification note (optional)" value={note} onChange={setNote} placeholder="Why was the proposal changed, if useful to retain?" /><MeetingButtons previous={previous} onPrevious={() => previous && onSetStage(proposal.id, previous)} onNext={() => saveProposalAndAdvance("objection_round")} nextLabel="Open Objection Round" /></>}

      {proposal.stage === "objection_round" && <><div className="objection-guide"><span className="section-kicker">Objection test</span><h3>Use the criteria in the room</h3><p>The facilitator and participants test the reasoning together. The software does not decide whether an objection is valid.</p><ol className="objection-tests">{OBJECTION_TESTS.map((test, index) => <li key={test}><span>{index + 1}</span><p>{test}</p></li>)}</ol></div><MeetingNote label="Objections or concerns to retain (optional)" value={note} onChange={setNote} placeholder="Capture an objection that needs integration, not every comment in the round." /><div className="process-actions">{previous && <button className="quiet" onClick={() => onSetStage(proposal.id, previous)}>Previous step</button>}<button className="secondary" onClick={() => advance("integration")}>Objection needs integration</button><button className="primary" onClick={() => { saveNote(); onAccept(proposal.id); }}>No objections · accept proposal</button></div></>}

      {proposal.stage === "integration" && <><label className="field"><span>Integrated proposal</span><textarea rows={5} value={proposalText} onChange={(event) => setProposalText(event.target.value)} /></label><MeetingNote label="Integration note" value={note} onChange={setNote} placeholder="What objection was addressed and how?" /><div className="process-actions">{previous && <button className="quiet" onClick={() => onSetStage(proposal.id, previous)}>Previous step</button>}<button className="primary" disabled={!proposalText.trim()} onClick={() => saveProposalAndAdvance("objection_round")}>Return to Objection Round</button></div></>}
    </div>
  </article>;
}

function MeetingNote({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="field"><span>{label}</span><textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></label>;
}

function MeetingButtons({ previous, onPrevious, onNext, nextLabel }: { previous?: GovernanceStage; onPrevious: () => void; onNext: () => void; nextLabel: string }) {
  return <div className="process-actions">{previous && <button className="quiet" onClick={onPrevious}>Previous step</button>}<button className="primary" onClick={onNext}>{nextLabel}</button></div>;
}

function MethodGuide({ facilitatorId }: { facilitatorId?: string }) {
  return <section className="section governance-method"><div className="section-head"><div><span className="section-kicker">Meeting reference</span><h2>What each governance step does</h2></div></div><div className="soft-list">{GOVERNANCE_STEPS.map((step, index) => <div className="soft-row" key={step.id}><div><strong>{index + 1}. {step.name}</strong><small>{step.description}</small></div></div>)}</div><div className="objection-guide"><span className="section-kicker">Objection test</span><h3>When does a concern count as an objection?</h3><p>The objector needs a reasonable argument that <strong>all four</strong> tests are true.</p><ol className="objection-tests">{OBJECTION_TESTS.map((test, index) => <li key={test}><span>{index + 1}</span><p>{test}</p></li>)}</ol><div className="objection-rule"><strong>Who tests it?</strong><p>{facilitatorId ? `${personName(facilitatorId)} currently fills Process Steward in this prototype. ` : ""}The facilitator manages the test with the participants. The app only keeps the criteria visible.</p></div><p className="governance-source-note">This prototype uses the Holacracy v5 objection test as a working method reference. It does not silently make the full Holacracy Constitution binding on SDBP.</p></div></section>;
}
