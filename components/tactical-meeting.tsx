"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Action, Project, Tension } from "@/lib/domain";
import {
  completeProject,
  createTension,
  loadWorkspace,
  setActionStatus,
  todayISO,
  touchProject,
  updateProject,
  updateTension,
  type WorkspaceData,
} from "@/lib/supabase/workspace";
import styles from "@/components/tactical-meeting.module.css";

type LiveProfile = { id: string; name: string; email: string };
type Stage = "checkin" | "sync" | "agenda" | "triage" | "closing";
type NeedKind = "input" | "sync";

const EMPTY_WORKSPACE: WorkspaceData = { people: [], roles: [], projects: [], actions: [], tensions: [], governanceProposals: [] };
const STAGES: Stage[] = ["checkin", "sync", "agenda", "triage", "closing"];

const STAGE_LABELS: Record<Stage, string> = {
  checkin: "Check-in",
  sync: "Operational sync",
  agenda: "Build agenda",
  triage: "Triage",
  closing: "Closing",
};

export function TacticalMeeting({ liveProfile }: { liveProfile: LiveProfile }) {
  const [workspace, setWorkspace] = useState<WorkspaceData>(EMPTY_WORKSPACE);
  const [stage, setStage] = useState<Stage>("checkin");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState("");
  const [newTension, setNewTension] = useState("");
  const [newTensionRaiser, setNewTensionRaiser] = useState(liveProfile.id);
  const [selectedTensionId, setSelectedTensionId] = useState<string | null>(null);
  const [needKind, setNeedKind] = useState<NeedKind | null>(null);
  const [needPeople, setNeedPeople] = useState<string[]>([]);
  const [needDetail, setNeedDetail] = useState("");

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await loadWorkspace();
      setWorkspace(next);
      setError("");
    } catch (refreshError) {
      setError(readError(refreshError));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "SDBP Tactical Meeting";
    void refresh();

    const onFocus = () => void refresh(true);
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => {
      document.title = previousTitle;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const peopleById = useMemo(() => new Map(workspace.people.map((person) => [person.id, person])), [workspace.people]);
  const personName = (id: string) => peopleById.get(id)?.name ?? "Unknown";
  const today = todayISO();

  const activeProjects = useMemo(() => [...workspace.projects]
    .filter((project) => project.status === "active")
    .sort((a, b) => Number(b.nextPrompt <= today) - Number(a.nextPrompt <= today) || a.title.localeCompare(b.title)), [workspace.projects, today]);

  const activeActions = useMemo(() => workspace.actions.filter((action) => action.status === "proposed" || action.status === "open"), [workspace.actions]);
  const operationalTensions = useMemo(() => workspace.tensions.filter((tension) => tension.status !== "resolved" && tension.status !== "governance"), [workspace.tensions]);
  const governanceTensions = useMemo(() => workspace.tensions.filter((tension) => tension.status === "governance"), [workspace.tensions]);
  const selectedTension = selectedTensionId ? operationalTensions.find((tension) => tension.id === selectedTensionId) : undefined;

  const overdueActions = activeActions.filter((action) => action.due && action.due < today).length;
  const dueProjects = activeProjects.filter((project) => project.nextPrompt <= today).length;
  const openGovernance = workspace.governanceProposals.filter((proposal) => proposal.stage !== "accepted").length + governanceTensions.filter((tension) => !workspace.governanceProposals.some((proposal) => proposal.tensionId === tension.id)).length;

  async function run(action: () => Promise<void>, success?: string) {
    try {
      setError("");
      await action();
      await refresh(true);
      if (success) setNotice(success);
      return true;
    } catch (actionError) {
      setError(readError(actionError));
      return false;
    }
  }

  function go(next: Stage) {
    setNeedKind(null);
    setNeedPeople([]);
    setNeedDetail("");
    setStage(next);
  }

  function nextStage() {
    const index = STAGES.indexOf(stage);
    if (index < STAGES.length - 1) go(STAGES[index + 1]);
  }

  function previousStage() {
    const index = STAGES.indexOf(stage);
    if (index > 0) go(STAGES[index - 1]);
  }

  function beginProjectUpdate(project: Project) {
    setEditingProjectId(project.id);
    setProjectDraft(project.summary);
  }

  async function saveProject(project: Project) {
    const ok = await run(() => updateProject(project.id, projectDraft), `Updated ${project.title}.`);
    if (ok) setEditingProjectId(null);
  }

  async function noProjectChange(project: Project) {
    const ok = await run(() => touchProject(project.id), `Checked ${project.title}: no change.`);
    if (ok) setEditingProjectId(null);
  }

  async function finishProject(project: Project) {
    if (!window.confirm(`Confirm that the outcome for “${project.title}” has been achieved?`)) return;
    const ok = await run(() => completeProject(project.id), `Completed ${project.title}.`);
    if (ok) setEditingProjectId(null);
  }

  async function changeAction(action: Action) {
    const next = action.status === "proposed" ? "open" : "done";
    await run(
      () => setActionStatus(action.id, next),
      next === "open" ? `Accepted action for ${personName(action.ownerId)}.` : `Completed action: ${action.title}.`,
    );
  }

  async function raiseMeetingTension() {
    const title = newTension.trim();
    if (!title || !newTensionRaiser) return;
    const ok = await run(
      () => createTension({ title, raiserId: newTensionRaiser }),
      `Tension added for ${personName(newTensionRaiser)}.`,
    );
    if (ok) {
      setNewTension("");
      setNewTensionRaiser(liveProfile.id);
    }
  }

  function startTriage(tension: Tension) {
    setSelectedTensionId(tension.id);
    setNeedKind(null);
    setNeedPeople([]);
    setNeedDetail("");
    setStage("triage");
  }

  function nextTensionAfter(tensionId: string) {
    const index = operationalTensions.findIndex((tension) => tension.id === tensionId);
    const next = operationalTensions[index + 1] ?? operationalTensions.find((tension) => tension.id !== tensionId);
    setNeedKind(null);
    setNeedPeople([]);
    setNeedDetail("");
    if (next) setSelectedTensionId(next.id);
    else {
      setSelectedTensionId(null);
      setStage("closing");
    }
  }

  async function saveNeed(tension: Tension) {
    if (!needKind || !needPeople.length) return;
    const names = needPeople.map(personName).filter((name) => name !== "Unknown");
    if (!names.length) return;
    const prefix = needKind === "input" ? `Needs input or help from ${names.join(", ")}` : `Needs a real conversation with ${names.join(", ")}`;
    const note = needDetail.trim() ? `${prefix} — ${needDetail.trim()}` : `${prefix}.`;
    const status: Tension["status"] = needKind === "sync" ? "needs_sync" : "open";
    const ok = await run(
      () => updateTension(tension.id, { status, resolutionProposedBy: null, latestNote: note }),
      "Need captured in the shared workspace.",
    );
    if (ok) nextTensionAfter(tension.id);
  }

  async function moveToGovernance(tension: Tension) {
    const ok = await run(() => updateTension(tension.id, {
      status: "governance",
      resolutionProposedBy: null,
      latestNote: "This tension needs a change to an ongoing role, responsibility, authority or standing way of working.",
    }), "Structural tension moved to Governance.");
    if (ok) nextTensionAfter(tension.id);
  }

  async function resolveInMeeting(tension: Tension) {
    const raiser = personName(tension.raiserId);
    if (!window.confirm(`Has ${raiser} confirmed in the meeting that this tension is resolved?`)) return;
    const ok = await run(() => updateTension(tension.id, {
      status: "resolved",
      resolutionProposedBy: null,
      latestNote: `${raiser} confirmed during the tactical meeting that the tension is resolved.`,
    }), "Tension resolved.");
    if (ok) nextTensionAfter(tension.id);
  }

  async function keepOpen(tension: Tension) {
    const ok = await run(() => updateTension(tension.id, {
      status: "open",
      resolutionProposedBy: null,
      latestNote: tension.latestNote ?? null,
    }), "Tension remains open.");
    if (ok) nextTensionAfter(tension.id);
  }

  function toggleNeedPerson(id: string) {
    setNeedPeople((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  }

  function endMeeting() {
    window.close();
    window.setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("tactical");
      window.location.assign(url.toString());
    }, 180);
  }

  if (loading) return <main className={styles.loading}><span className="auth-spinner" /><h1>Opening tactical meeting</h1><p>Loading the current SDBP workspace.</p></main>;

  const stepIndex = STAGES.indexOf(stage);

  return <main className={styles.meeting}>
    <header className={styles.header}>
      <div>
        <span className="section-kicker">SDBP · live facilitation</span>
        <h1>Tactical meeting</h1>
        <p><strong>Change the work, not the structure.</strong> This meeting does together what SDBP Governance normally allows us to do asynchronously throughout the week.</p>
      </div>
      <button className="quiet" type="button" onClick={endMeeting}>Close meeting</button>
    </header>

    <nav className={styles.steps} aria-label="Tactical meeting steps">
      {STAGES.map((item, index) => <button key={item} type="button" className={`${styles.step}${item === stage ? ` ${styles.activeStep}` : ""}${index < stepIndex ? ` ${styles.pastStep}` : ""}`} onClick={() => go(item)}>
        <span>{index + 1}</span><strong>{STAGE_LABELS[item]}</strong>
      </button>)}
    </nav>

    {error && <div className="records-status error launch-error">{error}</div>}
    {notice && <div className={styles.notice}>{notice}</div>}

    {stage === "checkin" && <CheckInStage />}

    {stage === "sync" && <section className={styles.stageSurface}>
      <StageIntro kicker="Operational synchronization" title="Get current before creating an agenda" copy="Use the shared state instead of a second reporting ritual. Review what is due, capture short project updates, and confirm current commitments. Skip anything that does not need airtime." />

      <div className={styles.pulseGrid}>
        <PulseNumber label="Project updates due" value={dueProjects} />
        <PulseNumber label="Overdue actions" value={overdueActions} />
        <PulseNumber label="Operational tensions" value={operationalTensions.length} />
        <PulseNumber label="Governance waiting" value={openGovernance} />
      </div>

      <div className={styles.syncGrid}>
        <section className={styles.syncPanel}>
          <div className={styles.panelHead}><div><span className="section-kicker">Projects</span><h2>Progress updates</h2></div><span>{activeProjects.length}</span></div>
          <p className={styles.panelGuide}>Keep it to current reality. An update is not a performance report.</p>
          <div className={styles.stack}>{activeProjects.length ? activeProjects.map((project) => <article className={styles.projectRow} key={project.id}>
            <div className={styles.rowTop}><div><strong>{project.title}</strong><small>{personName(project.ownerId)} · last checked {shortDate(project.lastUpdate)}</small></div>{project.nextPrompt <= today && <span className={styles.dueBadge}>update due</span>}</div>
            {editingProjectId === project.id ? <div className={styles.inlineEditor}>
              <textarea rows={3} value={projectDraft} onChange={(event) => setProjectDraft(event.target.value)} placeholder="Current reality / useful change" />
              <div className="process-actions"><button className="quiet" type="button" onClick={() => setEditingProjectId(null)}>Cancel</button><button className="secondary small" type="button" onClick={() => void noProjectChange(project)}>No change</button><button className="secondary small" type="button" onClick={() => void finishProject(project)}>Outcome achieved</button><button className="primary small" type="button" onClick={() => void saveProject(project)}>Save update</button></div>
            </div> : <>
              <p>{project.summary || "No update recorded yet."}</p>
              <button className="text-action" type="button" onClick={() => beginProjectUpdate(project)}>Update →</button>
            </>}
          </article>) : <CalmEmpty text="No active projects." />}</div>
        </section>

        <section className={styles.syncPanel}>
          <div className={styles.panelHead}><div><span className="section-kicker">Actions</span><h2>Current commitments</h2></div><span>{activeActions.length}</span></div>
          <p className={styles.panelGuide}>Capture only what the owner confirms. Stop once the current commitment is clear.</p>
          <div className={styles.stack}>{activeActions.length ? activeActions.map((action) => <article className={styles.actionRow} key={action.id}>
            <div><strong>{action.title}</strong><small>{personName(action.ownerId)}{action.due ? ` · due ${shortDate(action.due)}` : ""}{action.source ? ` · ${action.source}` : ""}</small></div>
            <button className={action.status === "proposed" ? "secondary small" : "quiet small"} type="button" onClick={() => void changeAction(action)}>{action.status === "proposed" ? "Accept" : "Done"}</button>
          </article>) : <CalmEmpty text="No open commitments." />}</div>
        </section>
      </div>
    </section>}

    {stage === "agenda" && <section className={styles.stageSurface}>
      <StageIntro kicker="Agenda building" title="Surface the tensions that need live attention" copy="The agenda is the set of real gaps people sense right now. Existing open tensions are already here; add a new one only if it actually surfaced in the meeting." />

      <div className={styles.raiseBar}>
        <label><span>New tension</span><input value={newTension} onChange={(event) => setNewTension(event.target.value)} placeholder="What could be better?" /></label>
        <label className={styles.raiserSelect}><span>Raised by</span><select value={newTensionRaiser} onChange={(event) => setNewTensionRaiser(event.target.value)}>{workspace.people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <button className="primary" type="button" disabled={!newTension.trim()} onClick={() => void raiseMeetingTension()}>Add to agenda</button>
      </div>

      <div className={styles.agendaList}>{operationalTensions.length ? operationalTensions.map((tension, index) => <article className={styles.agendaRow} key={tension.id}>
        <span className={styles.agendaNumber}>{index + 1}</span>
        <div><strong>{tension.title}</strong><small>{personName(tension.raiserId)} · {tensionStatus(tension)}</small>{tension.latestNote && <p>{tension.latestNote}</p>}</div>
        <button className="secondary small" type="button" onClick={() => startTriage(tension)}>Triage →</button>
      </article>) : <CalmEmpty text="No operational tensions are waiting. You can move straight to Closing." />}</div>

      {governanceTensions.length > 0 && <div className={styles.governanceAside}><strong>Already in Governance</strong><p>These are structural tensions. They stay out of tactical triage because resolving them requires changing how SDBP is organised.</p><div>{governanceTensions.map((tension) => <span key={tension.id}>{tension.title}</span>)}</div></div>}
    </section>}

    {stage === "triage" && <section className={styles.stageSurface}>
      <StageIntro kicker="Triage" title="What do you need to move the work forward?" copy="Do not solve more than necessary. Get the information, conversation, decision or next useful step the tension-holder needs, then move on." />

      {!selectedTension ? <div className={styles.noSelection}><CalmEmpty text="Choose a tension from the agenda to triage it." /><button className="secondary" type="button" onClick={() => setStage("agenda")}>Back to agenda</button></div> : <div className={styles.triageLayout}>
        <aside className={styles.triageQueue}>
          <span className="section-kicker">Agenda</span>
          {operationalTensions.map((tension) => <button key={tension.id} type="button" className={tension.id === selectedTension.id ? styles.selectedQueueItem : ""} onClick={() => startTriage(tension)}><strong>{tension.title}</strong><small>{personName(tension.raiserId)}</small></button>)}
        </aside>

        <article className={styles.triageCard}>
          <div className={styles.triageMeta}><span>Raised by {personName(selectedTension.raiserId)}</span><span>{tensionStatus(selectedTension)}</span></div>
          <h2>{selectedTension.title}</h2>
          {selectedTension.latestNote && <div className={styles.currentContext}><strong>Current context</strong><p>{selectedTension.latestNote}</p></div>}

          {selectedTension.status === "awaiting_confirmation" ? <div className={styles.resolutionCheck}>
            <span className="section-kicker">Ask the tension-holder</span>
            <h3>Did you get what you needed?</h3>
            <p>Someone believes this is resolved. The person who raised the tension decides whether the real situation is actually resolved.</p>
            <div className="process-actions"><button className="secondary" type="button" onClick={() => void keepOpen(selectedTension)}>No · keep open</button><button className="primary" type="button" onClick={() => void resolveInMeeting(selectedTension)}>Yes · resolved</button></div>
          </div> : <>
            <div className={styles.needQuestion}>What does <strong>{personName(selectedTension.raiserId)}</strong> need now?</div>
            <div className={styles.outcomes}>
              <button type="button" className={needKind === "input" ? styles.chosenOutcome : ""} onClick={() => setNeedKind("input")}><strong>Input or help</strong><span>Information, expertise, a decision within existing authority, or help from someone.</span></button>
              <button type="button" className={needKind === "sync" ? styles.chosenOutcome : ""} onClick={() => setNeedKind("sync")}><strong>Real conversation</strong><span>A quick call or discussion is the useful next step.</span></button>
              <button type="button" onClick={() => void moveToGovernance(selectedTension)}><strong>Change how we work</strong><span>This requires changing a role, responsibility, authority or standing rule.</span></button>
              <button type="button" onClick={() => void resolveInMeeting(selectedTension)}><strong>Resolved</strong><span>The tension-holder confirms the gap no longer exists.</span></button>
            </div>

            {needKind && <div className={styles.needEditor}>
              <strong>{needKind === "input" ? "Who is relevant?" : "Who needs to be in the conversation?"}</strong>
              <div className={styles.peoplePicker}>{workspace.people.filter((person) => person.id !== selectedTension.raiserId).map((person) => <label key={person.id}><input type="checkbox" checked={needPeople.includes(person.id)} onChange={() => toggleNeedPerson(person.id)} />{person.name}</label>)}</div>
              <label className={styles.detailField}><span>Useful context <em>(optional)</em></span><textarea rows={3} value={needDetail} onChange={(event) => setNeedDetail(event.target.value)} placeholder="Only what the other person needs to understand the request." /></label>
              <div className="process-actions"><button className="quiet" type="button" onClick={() => { setNeedKind(null); setNeedPeople([]); setNeedDetail(""); }}>Cancel</button><button className="primary" type="button" disabled={!needPeople.length} onClick={() => void saveNeed(selectedTension)}>Capture & next tension</button></div>
            </div>}

            <div className={styles.workReminder}><strong>If the useful outcome is a real Action or Project</strong><p>Create it in Work in the main app. Do not create work objects merely to satisfy the meeting process.</p></div>
          </>}
        </article>
      </div>}
    </section>}

    {stage === "closing" && <section className={styles.stageSurface}>
      <StageIntro kicker="Closing" title="End with a short spoken round" copy="What was useful? What should we improve next time? The purpose is learning and closure, not another reporting requirement." />
      <div className={styles.closingCard}>
        <div><strong>{activeProjects.length}</strong><span>active projects</span></div>
        <div><strong>{activeActions.length}</strong><span>open commitments</span></div>
        <div><strong>{operationalTensions.length}</strong><span>operational tensions still open</span></div>
      </div>
      <div className={styles.savedReality}><strong>Nothing needs to be transferred back.</strong><p>Updates, commitments and tensions captured during this meeting already changed the shared SDBP workspace. The asynchronous rhythm simply continues from here.</p></div>
      <button className="primary" type="button" onClick={endMeeting}>End tactical meeting</button>
    </section>}

    <footer className={styles.footer}>
      <button className="quiet" type="button" disabled={stepIndex === 0} onClick={previousStage}>Previous</button>
      <div><strong>{stepIndex + 1} / {STAGES.length}</strong><span>{STAGE_LABELS[stage]}</span></div>
      {stage !== "closing" ? <button className="primary" type="button" onClick={nextStage}>{stage === "agenda" && operationalTensions.length ? "Start triage" : "Next"}</button> : <span />}
    </footer>
  </main>;
}

function CheckInStage() {
  return <section className={styles.stageSurface}>
    <StageIntro kicker="Check-in" title="Arrive before processing the work" copy="Do a short spoken round so everyone is present. There is nothing to record here unless somebody surfaces an actual tension." />
    <div className={styles.teachingGrid}>
      <article><span>Throughout the week</span><strong>Projects ask for short updates</strong><p>In a live meeting, we scan those same projects together during Operational sync.</p></article>
      <article><span>Throughout the week</span><strong>People raise tensions when they sense a gap</strong><p>In a live meeting, those same tensions become the agenda.</p></article>
      <article><span>Throughout the week</span><strong>The app asks: what do you need?</strong><p>In a live meeting, the facilitator asks the same question out loud and moves on once there is a useful next step.</p></article>
    </div>
    <div className={styles.distinction}><div><strong>Tactical</strong><p>Given the organisation we currently have, what do we need to do?</p></div><div><strong>Governance</strong><p>Given the tensions we experience, how should the organisation itself change?</p></div></div>
  </section>;
}

function StageIntro({ kicker, title, copy }: { kicker: string; title: string; copy: string }) {
  return <div className={styles.stageIntro}><span className="section-kicker">{kicker}</span><h2>{title}</h2><p>{copy}</p></div>;
}

function PulseNumber({ label, value }: { label: string; value: number }) {
  return <article><strong>{value}</strong><span>{label}</span></article>;
}

function CalmEmpty({ text }: { text: string }) {
  return <div className={styles.calmEmpty}><span>○</span><p>{text}</p></div>;
}

function tensionStatus(tension: Tension) {
  if (tension.status === "awaiting_confirmation") return "awaiting confirmation";
  if (tension.status === "needs_sync") return "needs conversation";
  return tension.status;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Something could not be saved.";
}
