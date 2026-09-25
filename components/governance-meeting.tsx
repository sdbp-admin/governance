"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { GovernanceEffect, GovernanceProposal, GovernanceStage, Tension } from "@/lib/domain";
import { GovernanceEffectEditor, governanceEffectIsComplete, governanceEffectSummary } from "@/components/governance-effect-editor";
import {
  acceptGovernanceProposal,
  createGovernanceProposal,
  createTensionAndReturnId,
  loadWorkspace,
  saveGovernanceProposal,
  updateTension,
  type WorkspaceData,
} from "@/lib/supabase/workspace";
import styles from "@/components/governance-meeting.module.css";

type LiveProfile = { id: string; name: string; email: string };
type MeetingStage = "frame_need" | "present_proposal" | "clarifying_questions" | "reaction_round" | "clarify" | "objection_round" | "integration" | "outcome";
type ItemSource = "proposal" | "tension" | "meeting";
type ItemOutcome = "accepted" | "deferred" | "withdrawn";
type AgendaItem = {
  key: string;
  source: ItemSource;
  proposalId?: string;
  tensionId?: string;
  title: string;
  need: string;
  proposalText: string;
  effect?: GovernanceEffect;
  stage: MeetingStage;
  notes: Partial<Record<MeetingStage, string>>;
  outcome?: ItemOutcome;
};

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [], standingAgreements: [], attentionSignals: [] };
const STAGES: MeetingStage[] = ["frame_need", "present_proposal", "clarifying_questions", "reaction_round", "clarify", "objection_round", "integration", "outcome"];
const LABELS: Record<MeetingStage, string> = {
  frame_need: "Frame need",
  present_proposal: "Present proposal",
  clarifying_questions: "Clarifying questions",
  reaction_round: "Reaction round",
  clarify: "Clarify / amend",
  objection_round: "Objections",
  integration: "Integration",
  outcome: "Consent / outcome",
};

export function GovernanceMeeting({ liveProfile, initialProposalId }: { liveProfile: LiveProfile; initialProposalId?: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [picker, setPicker] = useState<"workspace" | "meeting" | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newNeed, setNewNeed] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await loadWorkspace();
      setWorkspace(next);
      setError("");
      return next;
    } catch (reason) {
      setError(readError(reason));
      return null;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "SDBP Governance Meeting";
    const timer = window.setTimeout(async () => {
      const next = await refresh();
      if (!next || !initialProposalId) return;
      const proposal = next.governanceProposals.find((item) => item.id === initialProposalId);
      if (!proposal) { setError("The requested governance proposal is no longer available."); return; }
      const item = agendaFromProposal(proposal, next.tensions.find((tension) => tension.id === proposal.tensionId));
      setAgenda([item]);
      setActiveKey(item.key);
    }, 0);
    return () => { document.title = previousTitle; window.clearTimeout(timer); };
  }, [initialProposalId, refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const active = agenda.find((item) => item.key === activeKey);
  const agendaProposalIds = useMemo(() => new Set(agenda.map((item) => item.proposalId).filter(Boolean)), [agenda]);
  const agendaTensionIds = useMemo(() => new Set(agenda.map((item) => item.tensionId).filter(Boolean)), [agenda]);
  const availableProposals = workspace.governanceProposals.filter((proposal) => proposal.stage !== "accepted" && proposal.stage !== "withdrawn" && !agendaProposalIds.has(proposal.id));
  const proposedTensions = new Set(workspace.governanceProposals.map((proposal) => proposal.tensionId));
  const availableTensions = workspace.tensions.filter((tension) => tension.status === "governance" && !proposedTensions.has(tension.id) && !agendaTensionIds.has(tension.id));

  function patchItem(key: string, patch: Partial<AgendaItem>) {
    setAgenda((items) => items.map((item) => item.key === key ? { ...item, ...patch } : item));
  }

  function addProposal(proposal: GovernanceProposal) {
    const item = agendaFromProposal(proposal, workspace.tensions.find((tension) => tension.id === proposal.tensionId));
    setAgenda((items) => [...items, item]);
    setActiveKey(item.key);
    setPicker(null);
  }

  function addTension(tension: Tension) {
    const item: AgendaItem = { key: `tension:${tension.id}`, source: "tension", tensionId: tension.id, title: tension.title, need: tension.title, proposalText: "", stage: "frame_need", notes: {} };
    setAgenda((items) => [...items, item]);
    setActiveKey(item.key);
    setPicker(null);
  }

  function addMeetingItem() {
    if (!newTitle.trim()) return;
    const item: AgendaItem = { key: `meeting:${crypto.randomUUID()}`, source: "meeting", title: newTitle.trim(), need: newNeed.trim(), proposalText: "", stage: "frame_need", notes: {} };
    setAgenda((items) => [...items, item]);
    setActiveKey(item.key);
    setNewTitle("");
    setNewNeed("");
    setPicker(null);
  }

  async function run(action: () => Promise<void>, success: string) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh(true);
      setNotice(success);
      return true;
    } catch (reason) {
      setError(readError(reason));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function recordProposal(item: AgendaItem) {
    if (!item.need.trim() || !item.title.trim() || !item.proposalText.trim() || !governanceEffectIsComplete(item.effect) || !item.effect) return;
    let tensionId = item.tensionId;
    let proposalId = item.proposalId;
    setBusy(true);
    setError("");
    try {
      if (!tensionId) {
        tensionId = await createTensionAndReturnId({ title: item.need.trim(), raiserId: liveProfile.id });
        await updateTension(tensionId, { status: "governance", resolutionProposedBy: null, latestNote: `Governance need framed in live meeting: ${item.need.trim()}` });
      }
      if (proposalId) {
        const existing = workspace.governanceProposals.find((proposal) => proposal.id === proposalId);
        if (!existing) throw new Error("The proposal could not be found.");
        await saveGovernanceProposal({ ...existing, title: item.title.trim(), proposal: item.proposalText.trim(), governanceEffect: item.effect, stage: "prepared" });
      } else {
        await createGovernanceProposal({ tensionId, title: item.title.trim(), proposal: item.proposalText.trim(), proposerId: liveProfile.id, governanceEffect: item.effect });
      }
      const next = await loadWorkspace();
      setWorkspace(next);
      proposalId = proposalId ?? next.governanceProposals.find((proposal) => proposal.tensionId === tensionId)?.id;
      if (!proposalId) throw new Error("The recorded proposal could not be reloaded.");
      patchItem(item.key, { tensionId, proposalId, source: item.source === "meeting" ? "meeting" : item.source, stage: "present_proposal" });
      setNotice("Proposal recorded. Present it to the group.");
    } catch (reason) {
      setError(readError(reason));
    } finally {
      setBusy(false);
    }
  }

  function persistedProposal(item: AgendaItem) {
    if (!item.proposalId) return undefined;
    return workspace.governanceProposals.find((proposal) => proposal.id === item.proposalId);
  }

  async function recordAmendment(item: AgendaItem, nextStage: MeetingStage) {
    const proposal = persistedProposal(item);
    if (!proposal || !item.proposalText.trim() || !governanceEffectIsComplete(item.effect)) return;
    const note = item.notes[item.stage]?.trim();
    const saved = { ...proposal, proposal: item.proposalText.trim(), governanceEffect: item.effect, stage: "prepared" as GovernanceStage, meetingNotes: note ? { ...proposal.meetingNotes, [item.stage]: note } : proposal.meetingNotes };
    if (await run(() => saveGovernanceProposal(saved), item.stage === "integration" ? "Integration recorded." : "Amendment recorded.")) patchItem(item.key, { stage: nextStage });
  }

  async function recordValidObjection(item: AgendaItem) {
    const proposal = persistedProposal(item);
    const note = item.notes.objection_round?.trim();
    if (!proposal || !note) return;
    const saved = { ...proposal, stage: "prepared" as GovernanceStage, meetingNotes: { ...proposal.meetingNotes, objection_round: note } };
    if (await run(() => saveGovernanceProposal(saved), "Valid objection recorded for integration.")) patchItem(item.key, { stage: "integration" });
  }

  async function finish(item: AgendaItem, outcome: ItemOutcome) {
    const proposal = persistedProposal(item);
    if (!proposal || !item.effect || !governanceEffectIsComplete(item.effect)) return;
    const reason = item.notes.outcome?.trim();
    if ((outcome === "deferred" || outcome === "withdrawn") && !reason) return;
    const meetingNotes = reason ? { ...proposal.meetingNotes, [outcome]: reason } : proposal.meetingNotes;
    const finalProposal = { ...proposal, proposal: item.proposalText.trim(), governanceEffect: item.effect, meetingNotes };
    const ok = outcome === "accepted"
      ? await run(() => acceptGovernanceProposal(finalProposal), "Proposal accepted. Current Governance updated.")
      : await run(() => saveGovernanceProposal({ ...finalProposal, stage: outcome }), outcome === "deferred" ? "Proposal deferred." : "Proposal withdrawn.");
    if (!ok) return;
    patchItem(item.key, { outcome });
    const next = agenda.find((candidate) => candidate.key !== item.key && !candidate.outcome);
    if (next) setActiveKey(next.key);
  }

  function closeMeeting() {
    window.close();
    window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("governanceMeeting");
      url.searchParams.delete("proposal");
      window.location.assign(url.toString());
    }, 180);
  }

  if (loading) return <main className={styles.loading}><span className="auth-spinner" /><h1>Opening Governance Meeting</h1><p>Loading the current SDBP governance context.</p></main>;

  return <main className={styles.meeting}>
    <header className={styles.header}><div><span className="section-kicker">SDBP · live facilitation</span><h1>Governance Meeting</h1><p><strong>Guide the human process.</strong> Moving through these stages is temporary meeting state. The Workspace changes only when the group explicitly records an outcome.</p></div><button className="quiet" type="button" onClick={closeMeeting}>Close meeting</button></header>
    {error && <div className="records-status error launch-error">{error}</div>}{notice && <div className={styles.notice}>{notice}</div>}
    <div className={styles.layout}>
      <aside className={styles.agenda}><div className={styles.agendaHead}><div><span className="section-kicker">Live agenda</span><h2>Governance items</h2></div><span className={styles.agendaCount}>{agenda.length}</span></div><div className={styles.agendaActions}><button className="secondary small" type="button" onClick={() => setPicker(picker === "workspace" ? null : "workspace")}>Add from Workspace</button><button className="secondary small" type="button" onClick={() => setPicker(picker === "meeting" ? null : "meeting")}>Add meeting item</button></div><div className={styles.agendaList}>{agenda.map((item, index) => <button key={item.key} className={styles.agendaItem} data-selected={item.key === activeKey} data-complete={Boolean(item.outcome)} type="button" onClick={() => { setActiveKey(item.key); setPicker(null); }}><strong>{index + 1}. {item.title}</strong><small>{item.outcome ? outcomeLabel(item.outcome) : `${sourceLabel(item.source)} · ${LABELS[item.stage]}`}</small></button>)}{!agenda.length && <div className={styles.empty}>Build the agenda from prepared work or add an item raised in the room.</div>}</div></aside>
      <section className={styles.work}>
        {picker === "workspace" ? <WorkspacePicker proposals={availableProposals} tensions={availableTensions} workspace={workspace} onAddProposal={addProposal} onAddTension={addTension} onCancel={() => setPicker(null)} />
          : picker === "meeting" ? <NewItem title={newTitle} need={newNeed} onTitle={setNewTitle} onNeed={setNewNeed} onAdd={addMeetingItem} onCancel={() => setPicker(null)} />
          : active ? <MeetingItem item={active} workspace={workspace} busy={busy} onPatch={(patch) => patchItem(active.key, patch)} onStage={(stage) => patchItem(active.key, { stage })} onRecordProposal={() => void recordProposal(active)} onRecordAmendment={(next) => void recordAmendment(active, next)} onRecordObjection={() => void recordValidObjection(active)} onFinish={(outcome) => void finish(active, outcome)} />
          : <div className={styles.done}><span className="section-kicker">Standalone facilitation</span><h2>Build the meeting agenda</h2><p>Add prepared proposals or structural tensions from the Workspace, or frame a new governance need raised in this meeting.</p></div>}
      </section>
    </div>
  </main>;
}

function MeetingItem({ item, workspace, busy, onPatch, onStage, onRecordProposal, onRecordAmendment, onRecordObjection, onFinish }: {
  item: AgendaItem; workspace: WorkspaceData; busy: boolean; onPatch: (patch: Partial<AgendaItem>) => void; onStage: (stage: MeetingStage) => void; onRecordProposal: () => void; onRecordAmendment: (next: MeetingStage) => void; onRecordObjection: () => void; onFinish: (outcome: ItemOutcome) => void;
}) {
  const index = STAGES.indexOf(item.stage);
  const setNote = (stage: MeetingStage, value: string) => onPatch({ notes: { ...item.notes, [stage]: value } });
  if (item.outcome) return <div className={styles.done}><span className="section-kicker">Explicit outcome recorded</span><h2>{item.title}</h2><p>{outcomeLabel(item.outcome)}. Select another agenda item or close the meeting.</p></div>;
  return <>
    <header className={styles.workHead}><span className="section-kicker">{sourceLabel(item.source)}</span><h2>{item.title}</h2><p className={styles.sourceLine}>{item.tensionId ? "Connected to an existing Workspace tension" : "Temporary meeting item until a proposal is explicitly recorded"}</p></header>
    <nav className={styles.steps} aria-label="Governance process">{STAGES.map((stage, stepIndex) => <button key={stage} className={styles.step} data-active={stage === item.stage} data-past={stepIndex < index} type="button" disabled={!item.proposalId && stage !== "frame_need"} onClick={() => onStage(stage)}><span>{stepIndex + 1}</span>{LABELS[stage]}</button>)}</nav>
    <div className={styles.stage}>
      <StageGuide stage={item.stage} />
      {item.stage === "frame_need" && <div className={styles.form}><label>Governance need<textarea rows={3} value={item.need} onChange={(event) => onPatch({ need: event.target.value })} placeholder="What persistent structural gap needs to change?" /></label><label>Proposal title<input value={item.title} onChange={(event) => onPatch({ title: event.target.value })} /></label><label>Proposed change<textarea rows={5} value={item.proposalText} onChange={(event) => onPatch({ proposalText: event.target.value })} placeholder="What should become true?" /></label><GovernanceEffectEditor effect={item.effect} roles={workspace.roles} standingAgreements={workspace.standingAgreements} onChange={(effect) => onPatch({ effect })} /><div className={styles.recordPreview}><span>What will be recorded</span><strong>{item.title || "Proposal title"}</strong><p>{item.proposalText || "The formulated proposal will appear here before it is saved."}</p>{item.effect && <small>{governanceEffectSummary(item.effect, workspace.roles, workspace.standingAgreements)}</small>}</div><div className={styles.actions}><span /><button className="primary" type="button" disabled={busy || !item.need.trim() || !item.title.trim() || !item.proposalText.trim() || !governanceEffectIsComplete(item.effect)} onClick={onRecordProposal}>Record proposal & continue →</button></div></div>}
      {item.stage === "present_proposal" && <><ProposalSummary item={item} workspace={workspace} /><div className={styles.actions}><span /><button className="primary" type="button" onClick={() => onStage("clarifying_questions")}>Open clarifying questions →</button></div></>}
      {item.stage === "clarifying_questions" && <><ProposalSummary item={item} workspace={workspace} /><label className={styles.form}>Facilitator notes <textarea rows={5} value={item.notes.clarifying_questions ?? ""} onChange={(event) => setNote("clarifying_questions", event.target.value)} placeholder="Temporary facilitation notes — not saved unless included in an explicit outcome." /></label><StageActions previous="present_proposal" next="reaction_round" nextLabel="Begin reaction round" onStage={onStage} /></>}
      {item.stage === "reaction_round" && <><ProposalSummary item={item} workspace={workspace} /><label className={styles.form}>Facilitator notes <textarea rows={5} value={item.notes.reaction_round ?? ""} onChange={(event) => setNote("reaction_round", event.target.value)} placeholder="Capture what the proposer needs to hear during the round." /></label><StageActions previous="clarifying_questions" next="clarify" nextLabel="Return to proposer" onStage={onStage} /></>}
      {item.stage === "clarify" && <div className={styles.form}><label>Proposal after clarification<textarea rows={6} value={item.proposalText} onChange={(event) => onPatch({ proposalText: event.target.value })} /></label><GovernanceEffectEditor effect={item.effect} roles={workspace.roles} standingAgreements={workspace.standingAgreements} onChange={(effect) => onPatch({ effect })} /><label>Amendment note <em>required only when recording an amendment</em><textarea rows={3} value={item.notes.clarify ?? ""} onChange={(event) => setNote("clarify", event.target.value)} /></label><div className={styles.actions}><button className="quiet" type="button" onClick={() => onStage("reaction_round")}>Back</button><button className="secondary" type="button" onClick={() => onStage("objection_round")}>No amendment · open objections</button><button className="primary" type="button" disabled={busy || !item.notes.clarify?.trim() || !item.proposalText.trim() || !governanceEffectIsComplete(item.effect)} onClick={() => onRecordAmendment("objection_round")}>Record amendment & open objections</button></div></div>}
      {item.stage === "objection_round" && <><ProposalSummary item={item} workspace={workspace} /><div className={styles.recordPreview}><span>Human judgement</span><strong>The facilitator and group determine whether an objection is valid.</strong><p>The app records that judgement; it does not make it. Test whether adopting the proposal would cause concrete harm or move the organisation backward.</p></div><label className={styles.form}>Valid objection and the harm it identifies<textarea rows={4} value={item.notes.objection_round ?? ""} onChange={(event) => setNote("objection_round", event.target.value)} /></label><div className={styles.actions}><button className="quiet" type="button" onClick={() => onStage("clarify")}>Back</button><button className="secondary" type="button" onClick={() => onStage("outcome")}>No valid objection remains</button><button className="primary" type="button" disabled={busy || !item.notes.objection_round?.trim()} onClick={onRecordObjection}>Record valid objection & integrate</button></div></>}
      {item.stage === "integration" && <div className={styles.form}><label>Integrated proposal<textarea rows={6} value={item.proposalText} onChange={(event) => onPatch({ proposalText: event.target.value })} /></label><GovernanceEffectEditor effect={item.effect} roles={workspace.roles} standingAgreements={workspace.standingAgreements} onChange={(effect) => onPatch({ effect })} /><label>How the objection was integrated<textarea rows={3} value={item.notes.integration ?? ""} onChange={(event) => setNote("integration", event.target.value)} /></label><div className={styles.actions}><button className="quiet" type="button" onClick={() => onStage("objection_round")}>Back</button><button className="primary" type="button" disabled={busy || !item.notes.integration?.trim() || !item.proposalText.trim() || !governanceEffectIsComplete(item.effect)} onClick={() => onRecordAmendment("objection_round")}>Record integration & return to objections</button></div></div>}
      {item.stage === "outcome" && <><ProposalSummary item={item} workspace={workspace} /><label className={styles.form}>Reason / outcome note <em>required for defer or withdraw</em><textarea rows={3} value={item.notes.outcome ?? ""} onChange={(event) => setNote("outcome", event.target.value)} /></label><div className={styles.outcomeGrid}><button className={styles.outcomeCard} type="button" disabled={busy || !item.notes.outcome?.trim()} onClick={() => onFinish("deferred")}><strong>Defer</strong><span>Keep the proposal available and record why it is not decided today.</span></button><button className={styles.outcomeCard} type="button" disabled={busy || !item.notes.outcome?.trim()} onClick={() => onFinish("withdrawn")}><strong>Withdraw</strong><span>Record that this proposal is no longer awaiting governance processing.</span></button><button className={styles.outcomeCard} type="button" disabled={busy || !governanceEffectIsComplete(item.effect)} onClick={() => onFinish("accepted")}><strong>Accept</strong><span>Apply the visible governance effect as current organisational truth.</span></button></div><div className={styles.actions}><button className="quiet" type="button" onClick={() => onStage("objection_round")}>Back to objections</button></div></>}
    </div>
  </>;
}

function WorkspacePicker({ proposals, tensions, workspace, onAddProposal, onAddTension, onCancel }: { proposals: GovernanceProposal[]; tensions: Tension[]; workspace: WorkspaceData; onAddProposal: (proposal: GovernanceProposal) => void; onAddTension: (tension: Tension) => void; onCancel: () => void }) {
  const name = (id: string) => workspace.people.find((person) => person.id === id)?.name ?? "Unknown";
  return <div className={styles.stage}><StageGuide stage="frame_need" heading="Add prepared governance work" body="Choose a prepared proposal or a structural tension that genuinely needs live governance processing." /><div className={styles.picker}>{proposals.length > 0 && <section className={styles.pickerSection}><h3>Prepared proposals</h3>{proposals.map((proposal) => <article className={styles.pickRow} key={proposal.id}><div><strong>{proposal.title}</strong><small>{name(proposal.proposerId)} · {proposalStageLabel(proposal.stage)}</small></div><button className="secondary small" type="button" onClick={() => onAddProposal(proposal)}>Add</button></article>)}</section>}{tensions.length > 0 && <section className={styles.pickerSection}><h3>Structural tensions</h3>{tensions.map((tension) => <article className={styles.pickRow} key={tension.id}><div><strong>{tension.title}</strong><small>Raised by {name(tension.raiserId)} · proposal not yet formulated</small></div><button className="secondary small" type="button" onClick={() => onAddTension(tension)}>Add</button></article>)}</section>}{!proposals.length && !tensions.length && <div className={styles.empty}>No additional prepared proposals or structural tensions are waiting in the Workspace.</div>}</div><div className={styles.actions}><button className="quiet" type="button" onClick={onCancel}>Cancel</button></div></div>;
}

function NewItem({ title, need, onTitle, onNeed, onAdd, onCancel }: { title: string; need: string; onTitle: (value: string) => void; onNeed: (value: string) => void; onAdd: () => void; onCancel: () => void }) {
  return <div className={styles.stage}><StageGuide stage="frame_need" heading="Add a governance item raised in this meeting" body="This creates temporary agenda state only. Nothing enters the Workspace until the group explicitly records a proposal." /><div className={styles.form}><label>Working title<input autoFocus value={title} onChange={(event) => onTitle(event.target.value)} placeholder="What structural issue are we addressing?" /></label><label>Initial governance need <em>optional for now</em><textarea rows={4} value={need} onChange={(event) => onNeed(event.target.value)} placeholder="What persistent gap does the group see?" /></label></div><div className={styles.actions}><button className="quiet" type="button" onClick={onCancel}>Cancel</button><button className="primary" type="button" disabled={!title.trim()} onClick={onAdd}>Add to agenda</button></div></div>;
}

function ProposalSummary({ item, workspace }: { item: AgendaItem; workspace: WorkspaceData }) {
  return <div className={styles.form}>{item.need && <div className={styles.summary}><strong>Governance need</strong><p>{item.need}</p></div>}<div className={styles.summary}><strong>Proposal</strong><p>{item.proposalText}</p></div>{item.effect && <div className={styles.summary}><strong>Resulting governance if accepted</strong><p>{governanceEffectSummary(item.effect, workspace.roles, workspace.standingAgreements)}</p></div>}</div>;
}

function StageActions({ previous, next, nextLabel, onStage }: { previous: MeetingStage; next: MeetingStage; nextLabel: string; onStage: (stage: MeetingStage) => void }) {
  return <div className={styles.actions}><button className="quiet" type="button" onClick={() => onStage(previous)}>Back</button><button className="primary" type="button" onClick={() => onStage(next)}>{nextLabel} →</button></div>;
}

function StageGuide({ stage, heading, body }: { stage: MeetingStage; heading?: string; body?: string }) {
  const guide = GUIDES[stage];
  return <div className={styles.guide}><span className="section-kicker">{LABELS[stage]}</span><h3>{heading ?? guide.heading}</h3><p>{body ?? guide.body}</p><div className={styles.facilitatorCue}><strong>Facilitator · </strong>{guide.cue}</div></div>;
}

const GUIDES: Record<MeetingStage, { heading: string; body: string; cue: string }> = {
  frame_need: { heading: "Name the persistent structural gap, then formulate the change.", body: "A new meeting item begins as facilitation context. Show the group the proposal and governance effect before recording either.", cue: "Keep the need distinct from the proposed solution." },
  present_proposal: { heading: "Start with the need, then present the proposal.", body: "The proposer explains the gap and reads the proposed change. Others listen for understanding.", cue: "Do not open discussion yet." },
  clarifying_questions: { heading: "Questions only; reactions wait.", body: "Ask only for information needed to understand the need, proposal or resulting governance.", cue: "Redirect disguised reactions to the reaction round." },
  reaction_round: { heading: "Let the proposer hear the room without debate.", body: "Each person reacts in turn. These reactions inform the proposer but do not decide the outcome.", cue: "One person at a time; no replies between participants." },
  clarify: { heading: "The proposer may clarify, amend or leave it unchanged.", body: "Only use Record amendment when the displayed proposal or governance effect has actually changed.", cue: "Ask the proposer what, if anything, they want to change." },
  objection_round: { heading: "Ask whether adopting this would cause real harm.", body: "The app does not judge objection validity. The facilitator and group test each objection and record that human judgement explicitly.", cue: "Process one potential objection at a time." },
  integration: { heading: "Remove the valid harm without losing the proposal's purpose.", body: "Work with proposer and objector, then show the integrated wording before recording it.", cue: "Return to objections after recording the integration." },
  outcome: { heading: "Record the group's explicit outcome.", body: "Accept applies the displayed governance effect. Defer and withdraw preserve the reason without pretending a decision was made.", cue: "Confirm the final wording aloud before recording." },
};

function agendaFromProposal(proposal: GovernanceProposal, tension?: Tension): AgendaItem {
  return { key: `proposal:${proposal.id}`, source: "proposal", proposalId: proposal.id, tensionId: proposal.tensionId, title: proposal.title, need: tension?.title ?? "", proposalText: proposal.proposal, effect: proposal.governanceEffect, stage: "present_proposal", notes: {} };
}

function sourceLabel(source: ItemSource) { return source === "proposal" ? "Prepared proposal" : source === "tension" ? "Workspace structural tension" : "Raised in this meeting"; }
function outcomeLabel(outcome: ItemOutcome) { return outcome === "accepted" ? "Accepted" : outcome === "deferred" ? "Deferred" : "Withdrawn"; }
function proposalStageLabel(stage: GovernanceStage) { return ({ prepared: "prepared", present_proposal: "presenting", clarifying_questions: "clarifying questions", reaction_round: "reaction round", clarify: "clarifying / amending", objection_round: "objection round", integration: "integration", deferred: "deferred", withdrawn: "withdrawn", accepted: "accepted" } as Record<GovernanceStage, string>)[stage]; }
function readError(error: unknown) { return error instanceof Error ? error.message : "The governance meeting could not complete that action."; }
