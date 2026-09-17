"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Action, Project, Tension } from "@/lib/domain";
import { createAction, createTensionAndReturnId, loadWorkspace, todayISO, updateTension, type WorkspaceData } from "@/lib/supabase/workspace";
import styles from "@/components/tactical-meeting.module.css";

type LiveProfile = { id: string; name: string; email: string };
type Stage = "checkin" | "sync" | "agenda" | "triage" | "closing";
type MeetingOutcome = "input" | "conversation" | "decision" | "commitment" | "governance" | "resolution";

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [], standingAgreements: [], attentionSignals: [] };
const STAGES: Stage[] = ["checkin", "sync", "agenda", "triage", "closing"];
const STAGE_LABELS: Record<Stage, string> = { checkin: "Check-in", sync: "Operational sync", agenda: "Build agenda", triage: "Triage", closing: "Closing" };

export function TacticalMeeting({ liveProfile }: { liveProfile: LiveProfile }) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [stage, setStage] = useState<Stage>("checkin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [newTension, setNewTension] = useState("");
  const [newTensionRaiser, setNewTensionRaiser] = useState(liveProfile.id);
  const [agendaIds, setAgendaIds] = useState<string[]>([]);
  const [selectedTensionId, setSelectedTensionId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<MeetingOutcome | null>(null);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [commitmentTitle, setCommitmentTitle] = useState("");
  const [commitmentOwnerId, setCommitmentOwnerId] = useState(liveProfile.id);
  const [commitmentDue, setCommitmentDue] = useState("");
  const [commitmentAccepted, setCommitmentAccepted] = useState(false);
  const [raiserConfirmed, setRaiserConfirmed] = useState(false);

  const refresh = useCallback(async (quiet = false) => { if (!quiet) setLoading(true); try { setWorkspace(await loadWorkspace()); setError(""); } catch (refreshError) { setError(readError(refreshError)); } finally { if (!quiet) setLoading(false); } }, []);
  useEffect(() => { const previousTitle = document.title; document.title = "SDBP Tactical Meeting"; const initialLoad = window.setTimeout(() => void refresh(), 0); const onFocus = () => void refresh(true); window.addEventListener("focus", onFocus); const timer = window.setInterval(() => void refresh(true), 30_000); return () => { document.title = previousTitle; window.clearTimeout(initialLoad); window.removeEventListener("focus", onFocus); window.clearInterval(timer); }; }, [refresh]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 3200); return () => window.clearTimeout(timer); }, [notice]);

  const peopleById = useMemo(() => new Map(workspace.people.map((person) => [person.id, person])), [workspace.people]);
  const personName = (id: string) => peopleById.get(id)?.name ?? "Unknown";
  const today = todayISO();
  const activeProjects = useMemo(() => workspace.projects.filter((project) => project.status === "active"), [workspace.projects]);
  const activeActions = useMemo(() => workspace.actions.filter((action) => action.status === "proposed" || action.status === "open"), [workspace.actions]);
  const operationalTensions = useMemo(() => workspace.tensions.filter((tension) => tension.status !== "resolved" && tension.status !== "governance"), [workspace.tensions]);
  const governanceTensions = useMemo(() => workspace.tensions.filter((tension) => tension.status === "governance"), [workspace.tensions]);
  const agendaTensions = agendaIds.map((id) => workspace.tensions.find((tension) => tension.id === id)).filter((tension): tension is Tension => Boolean(tension && tension.status !== "resolved" && tension.status !== "governance"));
  const selectedTension = selectedTensionId ? workspace.tensions.find((tension) => tension.id === selectedTensionId) : undefined;

  async function run(action: () => Promise<void>, success?: string) { try { setError(""); await action(); await refresh(true); if (success) setNotice(success); return true; } catch (actionError) { setError(readError(actionError)); return false; } }
  function resetOutcome() { setOutcome(null); setOutcomeNote(""); setCommitmentTitle(""); setCommitmentOwnerId(liveProfile.id); setCommitmentDue(""); setCommitmentAccepted(false); setRaiserConfirmed(false); }
  function go(next: Stage) { resetOutcome(); setStage(next); }
  function nextStage() { const index = STAGES.indexOf(stage); if (index < STAGES.length - 1) go(STAGES[index + 1]); }
  function previousStage() { const index = STAGES.indexOf(stage); if (index > 0) go(STAGES[index - 1]); }
  function toggleAgenda(id: string) { setAgendaIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]); }
  async function raiseMeetingTension() {
    const title = newTension.trim();
    if (!title || !newTensionRaiser) return;
    try {
      setError("");
      const id = await createTensionAndReturnId({ title, raiserId: newTensionRaiser });
      setAgendaIds((ids) => [...ids, id]);
      setNewTension("");
      setNewTensionRaiser(liveProfile.id);
      await refresh(true);
      setNotice(`Added to the meeting agenda for ${personName(newTensionRaiser)}.`);
    } catch (actionError) { setError(readError(actionError)); }
  }
  function startTriage(tension: Tension) { setSelectedTensionId(tension.id); resetOutcome(); setStage("triage"); }
  function nextAgendaItem(tensionId: string) {
    const remaining = agendaIds.filter((id) => id !== tensionId && workspace.tensions.some((tension) => tension.id === id && tension.status !== "resolved" && tension.status !== "governance"));
    setAgendaIds((ids) => ids.filter((id) => id !== tensionId));
    resetOutcome();
    if (remaining.length) setSelectedTensionId(remaining[0]);
    else { setSelectedTensionId(null); setStage("closing"); }
  }
  async function recordDiscussion(tension: Tension) {
    if (!outcome || !outcomeNote.trim()) return;
    const label = outcome === "input" ? "Live input/help outcome" : outcome === "conversation" ? "Live conversation outcome" : "Decision within existing authority";
    if (await run(() => updateTension(tension.id, { latestNote: `${label}: ${outcomeNote.trim()}`, resolutionProposedBy: null }), "Meeting outcome recorded.")) nextAgendaItem(tension.id);
  }
  async function recordCommitment(tension: Tension) {
    if (!commitmentTitle.trim() || !commitmentOwnerId) return;
    if (await run(() => createAction({ title: commitmentTitle.trim(), ownerId: commitmentOwnerId, status: commitmentAccepted ? "open" : "proposed", due: commitmentDue || undefined, projectId: tension.linkedProjectId, sourceTensionId: tension.id, source: `Tactical meeting · ${tension.title}` }), "Commitment recorded.")) nextAgendaItem(tension.id);
  }
  async function recordGovernancePreparation(tension: Tension) {
    if (await run(() => updateTension(tension.id, { status: "governance", resolutionProposedBy: null }), "Marked for Governance preparation.")) nextAgendaItem(tension.id);
  }
  async function recordResolution(tension: Tension) {
    if (!raiserConfirmed) return;
    const raiser = personName(tension.raiserId);
    if (await run(() => updateTension(tension.id, { status: "resolved", resolutionProposedBy: null, latestNote: `${raiser} confirmed during the tactical meeting that the tension is resolved.` }), "Tension resolved.")) nextAgendaItem(tension.id);
  }
  async function keepOpen(tension: Tension) { if (await run(() => updateTension(tension.id, { status: "open", resolutionProposedBy: null }), "Tension remains open.")) nextAgendaItem(tension.id); }
  function endMeeting() { window.close(); window.setTimeout(() => { const url = new URL(window.location.href); url.searchParams.delete("tactical"); window.location.assign(url.toString()); }, 180); }

  if (loading) return <main className={styles.loading}><span className="auth-spinner" /><h1>Opening tactical meeting</h1><p>Loading the current SDBP workspace.</p></main>;
  const stepIndex = STAGES.indexOf(stage);
  return <main className={styles.meeting}>
    <header className={styles.header}><div><span className="section-kicker">SDBP · live facilitation</span><h1>Tactical meeting</h1><p><strong>Guide the live process.</strong> The Workspace remains the shared asynchronous record; this meeting helps people decide together what should be recorded.</p></div><button className="quiet" type="button" onClick={endMeeting}>Close meeting</button></header>
    <nav className={styles.steps} aria-label="Tactical meeting steps">{STAGES.map((item, index) => <button key={item} type="button" className={`${styles.step}${item === stage ? ` ${styles.activeStep}` : ""}${index < stepIndex ? ` ${styles.pastStep}` : ""}`} onClick={() => go(item)}><span>{index + 1}</span><strong>{STAGE_LABELS[item]}</strong></button>)}</nav>
    {error && <div className="records-status error launch-error">{error}</div>}{notice && <div className={styles.notice}>{notice}</div>}
    {stage === "checkin" && <CheckInStage />}
    {stage === "sync" && <section className={styles.stageSurface}><StageIntro kicker="Operational synchronization" title="Orient to the work together" copy="Use this compressed Workspace landscape for a quick shared scan. Open the normal Workspace only when something genuinely needs attention; do not turn the round into project reporting." /><MeetingLandscape projects={activeProjects} actions={activeActions} tensions={operationalTensions} personName={personName} today={today} /></section>}
    {stage === "agenda" && <section className={styles.stageSurface}><StageIntro kicker="Agenda building" title="Choose what genuinely needs live discussion" copy="Select existing unresolved tensions only when synchronous discussion will help. Add a new issue if it surfaced during the meeting." /><div className={styles.raiseBar}><label><span>New issue</span><input value={newTension} onChange={(event) => setNewTension(event.target.value)} placeholder="What needs live attention?" /></label><label className={styles.raiserSelect}><span>Raised by</span><select value={newTensionRaiser} onChange={(event) => setNewTensionRaiser(event.target.value)}>{workspace.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button className="primary" type="button" disabled={!newTension.trim()} onClick={() => void raiseMeetingTension()}>Add to agenda</button></div><div className={styles.agendaList}>{operationalTensions.length ? operationalTensions.map((tension) => { const selected = agendaIds.includes(tension.id); return <article className={`${styles.agendaRow}${selected ? ` ${styles.agendaSelected}` : ""}`} key={tension.id}><span className={styles.agendaNumber}>{selected ? "✓" : "○"}</span><div><strong>{tension.title}</strong><small>{personName(tension.raiserId)} · {tensionStatus(tension)}</small>{tension.latestNote && <p>{tension.latestNote}</p>}</div><button className={selected ? "quiet small" : "secondary small"} type="button" onClick={() => toggleAgenda(tension.id)}>{selected ? "Remove" : "Add"}</button></article>; }) : <CalmEmpty text="No operational tensions are waiting." />}</div>{agendaTensions.length > 0 && <div className={styles.agendaStart}><strong>{agendaTensions.length} selected for live triage</strong><button className="primary" type="button" onClick={() => startTriage(agendaTensions[0])}>Start triage →</button></div>}{governanceTensions.length > 0 && <div className={styles.governanceAside}><strong>In Governance preparation</strong><p>These structural tensions are being prepared as proposals and stay out of tactical triage.</p><div>{governanceTensions.map((tension) => <span key={tension.id}>{tension.title}</span>)}</div></div>}</section>}
    {stage === "triage" && <TriageStage selectedTension={selectedTension} agendaTensions={agendaTensions} workspace={workspace} outcome={outcome} setOutcome={setOutcome} resetOutcome={resetOutcome} personName={personName} outcomeNote={outcomeNote} setOutcomeNote={setOutcomeNote} commitmentTitle={commitmentTitle} setCommitmentTitle={setCommitmentTitle} commitmentOwnerId={commitmentOwnerId} setCommitmentOwnerId={setCommitmentOwnerId} commitmentDue={commitmentDue} setCommitmentDue={setCommitmentDue} commitmentAccepted={commitmentAccepted} setCommitmentAccepted={setCommitmentAccepted} raiserConfirmed={raiserConfirmed} setRaiserConfirmed={setRaiserConfirmed} startTriage={startTriage} nextAgendaItem={nextAgendaItem} keepOpen={keepOpen} recordDiscussion={recordDiscussion} recordCommitment={recordCommitment} recordGovernancePreparation={recordGovernancePreparation} recordResolution={recordResolution} />}
    {stage === "closing" && <section className={styles.stageSurface}><StageIntro kicker="Closing" title="End with a short spoken round" copy="What was useful? What should improve next time? The purpose is learning and closure, not another reporting requirement." /><div className={styles.closingCard}><div><strong>{activeProjects.length}</strong><span>active projects</span></div><div><strong>{activeActions.length}</strong><span>open commitments</span></div><div><strong>{operationalTensions.length}</strong><span>operational tensions still open</span></div></div><div className={styles.savedReality}><strong>Only explicitly recorded outcomes changed the Workspace.</strong><p>Everything else remains facilitation context from the live meeting.</p></div><button className="primary" type="button" onClick={endMeeting}>End tactical meeting</button></section>}
    <footer className={styles.footer}><button className="quiet" type="button" disabled={stepIndex === 0} onClick={previousStage}>Previous</button><div><strong>{stepIndex + 1} / {STAGES.length}</strong><span>{STAGE_LABELS[stage]}</span></div>{stage !== "closing" ? <button className="primary" type="button" onClick={() => stage === "agenda" && agendaTensions.length ? startTriage(agendaTensions[0]) : nextStage()}>{stage === "agenda" && agendaTensions.length ? "Start triage" : "Next"}</button> : <span />}</footer>
  </main>;
}

function TriageStage(props: {
  selectedTension?: Tension; agendaTensions: Tension[]; workspace: WorkspaceData; outcome: MeetingOutcome | null; setOutcome: (outcome: MeetingOutcome) => void; resetOutcome: () => void; personName: (id: string) => string;
  outcomeNote: string; setOutcomeNote: (value: string) => void; commitmentTitle: string; setCommitmentTitle: (value: string) => void; commitmentOwnerId: string; setCommitmentOwnerId: (value: string) => void; commitmentDue: string; setCommitmentDue: (value: string) => void; commitmentAccepted: boolean; setCommitmentAccepted: (value: boolean) => void; raiserConfirmed: boolean; setRaiserConfirmed: (value: boolean) => void;
  startTriage: (tension: Tension) => void; nextAgendaItem: (id: string) => void; keepOpen: (tension: Tension) => Promise<void>; recordDiscussion: (tension: Tension) => Promise<void>; recordCommitment: (tension: Tension) => Promise<void>; recordGovernancePreparation: (tension: Tension) => Promise<void>; recordResolution: (tension: Tension) => Promise<void>;
}) {
  const tension = props.selectedTension;
  return <section className={styles.stageSurface}><StageIntro kicker="Triage" title="What is needed in this live meeting?" copy="Choose a facilitation path first. Nothing is written to the Workspace until the group reviews and explicitly records an outcome." />{!tension ? <div className={styles.noSelection}><CalmEmpty text="Choose an agenda item to triage it." /></div> : <div className={styles.triageLayout}><aside className={styles.triageQueue}><span className="section-kicker">Meeting agenda</span>{props.agendaTensions.map((item) => <button key={item.id} type="button" className={item.id === tension.id ? styles.selectedQueueItem : ""} onClick={() => props.startTriage(item)}><strong>{item.title}</strong><small>{props.personName(item.raiserId)}</small></button>)}</aside><article className={styles.triageCard}><div className={styles.triageMeta}><span>Raised by {props.personName(tension.raiserId)}</span><span>{tensionStatus(tension)}</span></div><h2>{tension.title}</h2>{tension.latestNote && <div className={styles.currentContext}><strong>Current context</strong><p>{tension.latestNote}</p></div>}{tension.status === "awaiting_confirmation" ? <div className={styles.resolutionCheck}><span className="section-kicker">Ask the tension-holder</span><h3>Did you get what you needed?</h3><p>The person who raised the tension decides whether the real situation is resolved.</p><label className={styles.confirmCheck}><input type="checkbox" checked={props.raiserConfirmed} onChange={(event) => props.setRaiserConfirmed(event.target.checked)} />{props.personName(tension.raiserId)} confirmed this in the meeting</label><div className="process-actions"><button className="secondary" type="button" onClick={() => void props.keepOpen(tension)}>Record: keep open</button><button className="primary" disabled={!props.raiserConfirmed} type="button" onClick={() => void props.recordResolution(tension)}>Record resolution</button></div></div> : <><div className={styles.needQuestion}>What does the group need to do <strong>now</strong>?</div><div className={styles.outcomes}><OutcomeButton selected={props.outcome === "input"} onClick={() => { props.resetOutcome(); props.setOutcome("input"); }} title="Get input or help now" detail="Ask for the missing information, expertise or help in the room." /><OutcomeButton selected={props.outcome === "conversation"} onClick={() => { props.resetOutcome(); props.setOutcome("conversation"); }} title="Have the conversation now" detail="Facilitate the discussion that cannot usefully wait." /><OutcomeButton selected={props.outcome === "decision"} onClick={() => { props.resetOutcome(); props.setOutcome("decision"); }} title="Identify a decision" detail="Clarify a decision that sits within existing authority." /><OutcomeButton selected={props.outcome === "commitment"} onClick={() => { props.resetOutcome(); props.setOutcome("commitment"); }} title="Capture a commitment" detail="Agree a concrete owner and next step after the discussion." /><OutcomeButton selected={props.outcome === "governance"} onClick={() => { props.resetOutcome(); props.setOutcome("governance"); }} title="Prepare for Governance" detail="Identify that structural proposal preparation is required." /><OutcomeButton selected={props.outcome === "resolution"} onClick={() => { props.resetOutcome(); props.setOutcome("resolution"); }} title="Confirm resolution" detail="Ask the tension raiser whether the underlying gap is gone." /></div>{props.outcome && <OutcomeRecorder {...props} outcome={props.outcome} tension={tension} people={props.workspace.people} onCancel={props.resetOutcome} onRecordDiscussion={() => void props.recordDiscussion(tension)} onRecordCommitment={() => void props.recordCommitment(tension)} onRecordGovernance={() => void props.recordGovernancePreparation(tension)} onRecordResolution={() => void props.recordResolution(tension)} />}{props.outcome && <button className={styles.skipRecord} type="button" onClick={() => props.nextAgendaItem(tension.id)}>Discussion complete · next item without recording</button>}</>}</article></div>}</section>;
}

function MeetingLandscape({ projects, actions, tensions, personName, today }: { projects: Project[]; actions: Action[]; tensions: Tension[]; personName: (id: string) => string; today: string }) {
  const unlinked = tensions.filter((tension) => !tension.linkedProjectId);
  return <div className={styles.meetingLandscape}><div className={styles.landscapeLegend}><span><i className={styles.tensionDot} /> unresolved tension</span><span><i className={styles.actionDot} /> commitment</span><span><i className={styles.overdueDot} /> overdue commitment</span></div><div className={styles.projectField}>{projects.map((project) => { const projectTensions = tensions.filter((tension) => tension.linkedProjectId === project.id); const projectActions = actions.filter((action) => action.projectId === project.id || projectTensions.some((tension) => tension.id === action.sourceTensionId)); const size = 148 + Math.min(projectTensions.length + projectActions.length, 6) * 9; return <article key={project.id} className={styles.meetingProject} style={{ width: size, height: size }} title={`${projectTensions.length} tensions · ${projectActions.length} commitments`}><div><strong>{project.title}</strong><small>{personName(project.ownerId)}</small></div><div className={styles.objectCluster}>{projectTensions.slice(0, 7).map((tension) => <i key={tension.id} className={styles.tensionDot} />)}{projectActions.slice(0, 7).map((action) => <i key={action.id} className={action.due && action.due < today ? styles.overdueDot : styles.actionDot} />)}</div></article>; })}{unlinked.map((tension) => <article key={tension.id} className={styles.unlinkedObject}><strong>{tension.title}</strong><small>{personName(tension.raiserId)}</small></article>)}</div></div>;
}

function OutcomeButton({ selected, onClick, title, detail }: { selected: boolean; onClick: () => void; title: string; detail: string }) { return <button type="button" className={selected ? styles.chosenOutcome : ""} onClick={onClick}><strong>{title}</strong><span>{detail}</span></button>; }

function OutcomeRecorder(props: {
  outcome: MeetingOutcome; tension: Tension; people: WorkspaceData["people"]; personName: (id: string) => string;
  outcomeNote: string; setOutcomeNote: (value: string) => void; commitmentTitle: string; setCommitmentTitle: (value: string) => void;
  commitmentOwnerId: string; setCommitmentOwnerId: (value: string) => void; commitmentDue: string; setCommitmentDue: (value: string) => void;
  commitmentAccepted: boolean; setCommitmentAccepted: (value: boolean) => void; raiserConfirmed: boolean; setRaiserConfirmed: (value: boolean) => void;
  onCancel: () => void; onRecordDiscussion: () => void; onRecordCommitment: () => void; onRecordGovernance: () => void; onRecordResolution: () => void;
}) {
  if (props.outcome === "governance") return <div className={styles.outcomeRecorder}><strong>About to record</strong><p>This tension will be marked as structural and placed in Governance preparation. Its original text and current note will be preserved. A proposal must still be prepared before a Governance Meeting can process it.</p><div className="process-actions"><button className="quiet" onClick={props.onCancel}>Cancel</button><button className="primary" onClick={props.onRecordGovernance}>Record and prepare for Governance</button></div></div>;
  if (props.outcome === "resolution") return <div className={styles.outcomeRecorder}><strong>About to record</strong><p>The tension will be resolved only after its raiser confirms that the underlying gap is gone.</p><label className={styles.confirmCheck}><input type="checkbox" checked={props.raiserConfirmed} onChange={(event) => props.setRaiserConfirmed(event.target.checked)} />{props.personName(props.tension.raiserId)} confirmed this in the meeting</label><div className="process-actions"><button className="quiet" onClick={props.onCancel}>Cancel</button><button className="primary" disabled={!props.raiserConfirmed} onClick={props.onRecordResolution}>Record resolution</button></div></div>;
  if (props.outcome === "commitment") return <div className={styles.outcomeRecorder}><strong>Commitment to record</strong><label className={styles.detailField}><span>Concrete next step</span><textarea rows={2} value={props.commitmentTitle} onChange={(event) => props.setCommitmentTitle(event.target.value)} /></label><div className={styles.commitmentFields}><label>Owner<select value={props.commitmentOwnerId} onChange={(event) => props.setCommitmentOwnerId(event.target.value)}>{props.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label>Due date <em>(optional)</em><input type="date" value={props.commitmentDue} onChange={(event) => props.setCommitmentDue(event.target.value)} /></label></div><label className={styles.confirmCheck}><input type="checkbox" checked={props.commitmentAccepted} onChange={(event) => props.setCommitmentAccepted(event.target.checked)} />{props.personName(props.commitmentOwnerId)} explicitly accepted this commitment in the meeting</label><p className={styles.recordPreview}>It will be recorded as <strong>{props.commitmentAccepted ? "accepted/open" : "proposed"}</strong> and linked to this tension.</p><div className="process-actions"><button className="quiet" onClick={props.onCancel}>Cancel</button><button className="primary" disabled={!props.commitmentTitle.trim()} onClick={props.onRecordCommitment}>Record commitment</button></div></div>;
  const label = props.outcome === "input" ? "What input or help was obtained?" : props.outcome === "conversation" ? "What did the conversation establish?" : "What decision was identified, and under whose authority?";
  return <div className={styles.outcomeRecorder}><strong>Record only after the discussion</strong><label className={styles.detailField}><span>{label}</span><textarea rows={3} value={props.outcomeNote} onChange={(event) => props.setOutcomeNote(event.target.value)} /></label><p className={styles.recordPreview}>This text will become the tension’s current meeting outcome. No request, notification or governance change will be created.</p><div className="process-actions"><button className="quiet" onClick={props.onCancel}>Cancel</button><button className="primary" disabled={!props.outcomeNote.trim()} onClick={props.onRecordDiscussion}>Record outcome</button></div></div>;
}

function CheckInStage() { return <section className={styles.stageSurface}><StageIntro kicker="Check-in" title="Arrive before processing the work" copy="Do a short spoken round so everyone is present. There is nothing to record here unless somebody surfaces an actual tension." /><div className={styles.teachingGrid}><article><span>Throughout the week</span><strong>Projects hold current operational reality</strong><p>In a live meeting, scan that landscape together rather than repeat written reports.</p></article><article><span>Throughout the week</span><strong>People raise and process tensions asynchronously</strong><p>Bring only the items that genuinely benefit from synchronous discussion.</p></article><article><span>During this meeting</span><strong>The facilitator guides; the group decides</strong><p>Nothing becomes organisational record until someone explicitly records the agreed outcome.</p></article></div><div className={styles.distinction}><div><strong>Tactical</strong><p>Given the organisation we currently have, what do we need to do?</p></div><div><strong>Governance</strong><p>How should roles, authority or standing ways of working change?</p></div></div></section>; }
function StageIntro({ kicker, title, copy }: { kicker: string; title: string; copy: string }) { return <div className={styles.stageIntro}><span className="section-kicker">{kicker}</span><h2>{title}</h2><p>{copy}</p></div>; }
function CalmEmpty({ text }: { text: string }) { return <div className={styles.calmEmpty}><span>○</span><p>{text}</p></div>; }
function tensionStatus(tension: Tension) { if (tension.status === "awaiting_confirmation") return "awaiting confirmation"; if (tension.status === "needs_sync") return "needs conversation"; return tension.status; }
function readError(error: unknown) { return error instanceof Error ? error.message : "Something could not be saved."; }
