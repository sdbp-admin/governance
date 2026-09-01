"use client";

import { useEffect, useState } from "react";
import { people } from "@/lib/mock-data";
import type { Project, Tension } from "@/lib/domain";
import { PROTOTYPE_TODAY, formatTensionStatus, personName } from "@/lib/prototype-utils";

type TensionOutcome = "information" | "action" | "project" | "governance" | "sync" | "none";

export function TensionsView({ tensions, projects, currentUserId, selectedTensionId, draftSeed, onAddTension, onMarkResolved, onResolve, onKeepOpen, onMove, onCreateAction, onCreateProject }: {
  tensions: Tension[];
  projects: Project[];
  currentUserId: string;
  selectedTensionId: string | null;
  draftSeed: string;
  onAddTension: (tension: Tension) => void;
  onMarkResolved: (tensionId: string) => void;
  onResolve: (tensionId: string, note: string) => void;
  onKeepOpen: (tensionId: string) => void;
  onMove: (tensionId: string, status: "governance" | "needs_sync", note: string) => void;
  onCreateAction: (tensionId: string, title: string, ownerId: string) => void;
  onCreateProject: (tensionId: string, title: string) => void;
}) {
  const [draft, setDraft] = useState(draftSeed);
  const [processingId, setProcessingId] = useState<string | null>(selectedTensionId);
  const [outcome, setOutcome] = useState<TensionOutcome | null>(null);
  const [outcomeTitle, setOutcomeTitle] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [ownerId, setOwnerId] = useState(currentUserId);
  const activeTensions = tensions.filter((tension) => tension.status !== "resolved");

  useEffect(() => { setDraft(draftSeed); }, [draftSeed]);
  useEffect(() => { setProcessingId(selectedTensionId); setOutcome(null); setOutcomeTitle(""); setOutcomeNote(""); setOwnerId(currentUserId); }, [selectedTensionId, currentUserId]);

  function resetProcessing() { setProcessingId(null); setOutcome(null); setOutcomeTitle(""); setOutcomeNote(""); setOwnerId(currentUserId); }
  function startProcessing(tensionId: string) { setProcessingId(tensionId); setOutcome(null); setOutcomeTitle(""); setOutcomeNote(""); setOwnerId(currentUserId); }
  function raiseTension() {
    const title = draft.trim();
    if (!title) return;
    const tension: Tension = { id: `tension-${Date.now()}`, title, raiserId: currentUserId, status: "open", createdAt: PROTOTYPE_TODAY };
    onAddTension(tension); setDraft(""); startProcessing(tension.id);
  }

  return <>
    <div className="tension-composer"><div className="composer-copy"><span className="section-kicker">Raise a tension</span><h2>What tension do you want to raise?</h2><p>A tension can point to a problem, an opportunity, missing clarity, or something blocking the work. You do not need to know the solution yet.</p></div><div className="composer-input"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Membership list still not received…" /><button className="primary" disabled={!draft.trim()} onClick={raiseTension}>Raise tension</button></div></div>

    <section className="section"><div className="section-head"><div><span className="section-kicker">Open</span><h2>Tensions that still exist</h2></div><span className="counter">{activeTensions.length}</span></div>{activeTensions.length === 0 ? <div className="calm-empty compact-empty"><span>✓</span><h3>No open tensions</h3><p>Nothing currently needs attention.</p></div> : <div className="tension-stream">{activeTensions.map((tension) => {
      const project = projects.find((candidate) => candidate.id === tension.linkedProjectId);
      const awaitingMyConfirmation = tension.status === "awaiting_confirmation" && tension.raiserId === currentUserId;
      const canProcess = tension.status === "open" && tension.raiserId === currentUserId;
      const canMarkResolved = tension.status === "open";
      const isProcessing = processingId === tension.id && canProcess;

      return <article className={`tension-card ${isProcessing ? "tension-card-open" : ""}`} key={tension.id}><div className="tension-line" aria-hidden="true" /><div className="tension-content"><div className="tension-meta"><span>Raised by {personName(tension.raiserId)}</span>{project && <span>{project.title}</span>}<span>{formatTensionStatus(tension)}</span></div><h3>{tension.title}</h3><p>{tension.latestNote ?? "Open until somebody believes the real-world tension is resolved."}</p>

        {isProcessing && <TensionProcessPanel tension={tension} outcome={outcome} setOutcome={setOutcome} outcomeTitle={outcomeTitle} setOutcomeTitle={setOutcomeTitle} outcomeNote={outcomeNote} setOutcomeNote={setOutcomeNote} ownerId={ownerId} setOwnerId={setOwnerId} onCancel={resetProcessing} onCreateAction={() => { onCreateAction(tension.id, outcomeTitle, ownerId); resetProcessing(); }} onCreateProject={() => { onCreateProject(tension.id, outcomeTitle); resetProcessing(); }} onResolveInformation={() => { onResolve(tension.id, `Information captured: ${outcomeNote.trim()}`); resetProcessing(); }} onResolveNone={() => { onResolve(tension.id, "No further action is needed. The tension is resolved."); resetProcessing(); }} onGovernance={() => { onMove(tension.id, "governance", "This tension requires a change to an ongoing role, accountability, domain or policy and has moved to Governance."); resetProcessing(); }} onSync={() => { onMove(tension.id, "needs_sync", "This tension needs a synchronous conversation."); resetProcessing(); }} />}

        {awaitingMyConfirmation && <div className="tension-process-panel"><span className="kind">Resolution check</span><h4>{personName(tension.resolutionProposedBy ?? "")} marked this resolved. Is it resolved for you?</h4><p className="process-help">Check the actual situation. If the tension still exists, keep it open.</p><div className="process-actions"><button className="secondary" onClick={() => onKeepOpen(tension.id)}>No, keep it open</button><button className="primary small" onClick={() => onResolve(tension.id, `${personName(currentUserId)} confirmed the tension is resolved.`)}>Yes, resolved</button></div></div>}
      </div>

      {!isProcessing && !awaitingMyConfirmation && canProcess && <div className="actions compact-actions"><button className="secondary" onClick={() => startProcessing(tension.id)}>What do you need? <span aria-hidden="true">→</span></button><button className="quiet" onClick={() => onMarkResolved(tension.id)}>Resolve</button></div>}
      {!isProcessing && !awaitingMyConfirmation && canMarkResolved && tension.raiserId !== currentUserId && <button className="secondary" onClick={() => onMarkResolved(tension.id)}>Mark resolved</button>}
      {!isProcessing && !awaitingMyConfirmation && !canMarkResolved && <span className={`tension-state tension-state-${tension.status}`}>{formatTensionStatus(tension)}</span>}
      </article>;
    })}</div>}</section>
  </>;
}

function TensionProcessPanel({ tension, outcome, setOutcome, outcomeTitle, setOutcomeTitle, outcomeNote, setOutcomeNote, ownerId, setOwnerId, onCancel, onCreateAction, onCreateProject, onResolveInformation, onResolveNone, onGovernance, onSync }: {
  tension: Tension; outcome: TensionOutcome | null; setOutcome: (outcome: TensionOutcome | null) => void; outcomeTitle: string; setOutcomeTitle: (value: string) => void; outcomeNote: string; setOutcomeNote: (value: string) => void; ownerId: string; setOwnerId: (value: string) => void; onCancel: () => void; onCreateAction: () => void; onCreateProject: () => void; onResolveInformation: () => void; onResolveNone: () => void; onGovernance: () => void; onSync: () => void;
}) {
  const outcomes: { id: TensionOutcome; label: string; description: string }[] = [
    { id: "information", label: "Information", description: "I need an answer, fact or clarification." },
    { id: "action", label: "Action", description: "I want to capture one concrete next step." },
    { id: "project", label: "Project", description: "I want to capture an outcome that takes more than one step." },
    { id: "governance", label: "Governance", description: "An ongoing role, accountability, domain or policy needs to change." },
    { id: "sync", label: "Synchronous discussion", description: "This needs a real conversation." },
    { id: "none", label: "Nothing further", description: "Naming or reviewing it was enough." },
  ];

  return <div className="tension-process-panel"><span className="kind">Process tension</span><h4>What do you need?</h4><p className="process-help">Capture useful resulting work when needed. Creating an action or project does not control this tension; come back and resolve the tension when reality has actually changed.</p><div className="outcome-grid">{outcomes.map((candidate) => <button key={candidate.id} className={outcome === candidate.id ? "outcome-option selected" : "outcome-option"} onClick={() => setOutcome(candidate.id)}><strong>{candidate.label}</strong><small>{candidate.description}</small></button>)}</div>
    {outcome === "information" && <div className="outcome-form"><label className="field"><span>Information or clarification</span><textarea rows={3} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} /></label><button className="primary small" disabled={!outcomeNote.trim()} onClick={onResolveInformation}>Record and resolve</button></div>}
    {outcome === "action" && <div className="outcome-form outcome-form-grid"><label className="field"><span>Action</span><input value={outcomeTitle} onChange={(event) => setOutcomeTitle(event.target.value)} placeholder="Send current membership list" /></label><label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button className="primary small" disabled={!outcomeTitle.trim()} onClick={onCreateAction}>Create action</button></div>}
    {outcome === "project" && <div className="outcome-form"><label className="field"><span>Project outcome</span><input value={outcomeTitle} onChange={(event) => setOutcomeTitle(event.target.value)} placeholder="Prepare membership data for the General Assembly" /></label><button className="primary small" disabled={!outcomeTitle.trim()} onClick={onCreateProject}>Create project</button></div>}
    {outcome === "governance" && <div className="outcome-form"><p>This moves the tension to Governance so a proposal can be prepared for a facilitator-led governance meeting.</p><button className="primary small" onClick={onGovernance}>Move to Governance</button></div>}
    {outcome === "sync" && <div className="outcome-form"><p>The app keeps the tension visible; the actual processing moves to a real conversation.</p><button className="primary small" onClick={onSync}>Mark as needing sync</button></div>}
    {outcome === "none" && <div className="outcome-form"><p>No action, project or structural change is needed.</p><button className="primary small" onClick={onResolveNone}>Resolve tension</button></div>}
    <div className="process-actions"><button className="quiet" onClick={onCancel}>Close</button></div>
  </div>;
}
