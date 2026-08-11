"use client";

import { useEffect, useMemo, useState } from "react";
import { actions, myAttention, people, projects, roleDefinitions, tensions } from "@/lib/mock-data";
import type { Action, AttentionItem, Project, RoleDefinition, Tension } from "@/lib/domain";

type View = "attention" | "work" | "tensions" | "organisation" | "governance" | "records" | "pulse";
type TensionOutcome = "information" | "action" | "project" | "governance" | "sync" | "none";

type PrototypeSnapshot = {
  attention: AttentionItem[];
  projects: Project[];
  actions: Action[];
  tensions: Tension[];
  roles: RoleDefinition[];
};

const CURRENT_USER_ID = "edo";
const PROTOTYPE_TODAY = "2026-08-11";
const NEXT_WEEK = "2026-08-18";
const SESSION_STORAGE_KEY = "sdbp-governance-prototype-v1";

const labels: Record<View, string> = {
  attention: "My Attention",
  work: "Work",
  tensions: "Tensions",
  organisation: "Organisation",
  governance: "Governance",
  records: "Records",
  pulse: "SDBP Pulse",
};

const navMeta: Record<View, string> = {
  attention: "Today",
  work: "Projects & actions",
  tensions: "Open tensions",
  organisation: "People & roles",
  governance: "Change the structure",
  records: "Organisational memory",
  pulse: "Process health",
};

export function Prototype() {
  const [view, setView] = useState<View>("attention");
  const [attention, setAttention] = useState<AttentionItem[]>(myAttention);
  const [workProjects, setWorkProjects] = useState<Project[]>(projects);
  const [workActions, setWorkActions] = useState<Action[]>(actions);
  const [workTensions, setWorkTensions] = useState<Tension[]>(tensions);
  const [roles, setRoles] = useState<RoleDefinition[]>(roleDefinitions);
  const [projectUpdateId, setProjectUpdateId] = useState<string | null>(null);
  const [selectedTensionId, setSelectedTensionId] = useState<string | null>(null);
  const [tensionDraftSeed, setTensionDraftSeed] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [saveNotice, setSaveNotice] = useState("");

  const activeAttention = attention.filter((item) => item.status === "needs_action");
  const deferredAttention = attention.filter((item) => item.status === "deferred");
  const projectUpdate = workProjects.find((project) => project.id === projectUpdateId) ?? null;

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        const snapshot = JSON.parse(stored) as Partial<PrototypeSnapshot>;
        if (Array.isArray(snapshot.attention)) setAttention(snapshot.attention);
        if (Array.isArray(snapshot.projects)) setWorkProjects(snapshot.projects);
        if (Array.isArray(snapshot.actions)) setWorkActions(snapshot.actions);
        if (Array.isArray(snapshot.tensions)) setWorkTensions(snapshot.tensions);
        if (Array.isArray(snapshot.roles)) setRoles(snapshot.roles);
      }
    } catch {
      window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    const snapshot: PrototypeSnapshot = {
      attention,
      projects: workProjects,
      actions: workActions,
      tensions: workTensions,
      roles,
    };
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(snapshot));
  }, [sessionReady, attention, workProjects, workActions, workTensions, roles]);

  useEffect(() => {
    if (!saveNotice) return;
    const timer = window.setTimeout(() => setSaveNotice(""), 3600);
    return () => window.clearTimeout(timer);
  }, [saveNotice]);

  function announce(message: string) {
    setSaveNotice(message);
  }

  function completeItem(id: string) {
    setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "done" } : item));
  }

  function completeAttentionForTarget(kind: AttentionItem["kind"], targetId: string) {
    setAttention((items) => items.map((item) => item.kind === kind && item.targetId === targetId ? { ...item, status: "done" } : item));
  }

  function deferItem(id: string) {
    setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "deferred" } : item));
    announce("Reminder parked for later in this prototype session.");
  }

  function restoreItem(id: string) {
    setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "needs_action" } : item));
    announce("Item returned to My Attention.");
  }

  function openTensions(seed = "", tensionId: string | null = null) {
    setTensionDraftSeed(seed);
    setSelectedTensionId(tensionId);
    setView("tensions");
  }

  function handleAttentionPrimary(item: AttentionItem) {
    if (item.kind === "project_update" && item.targetId) {
      setProjectUpdateId(item.targetId);
      return;
    }

    if (item.kind === "action" && item.targetId) {
      const action = workActions.find((candidate) => candidate.id === item.targetId);
      setWorkActions((current) => current.map((candidate) => candidate.id === item.targetId ? { ...candidate, status: "open" } : candidate));
      completeItem(item.id);
      announce(action ? `Action accepted: “${action.title}”.` : "Action accepted.");

      if (action?.sourceTensionId) {
        setWorkTensions((current) => current.map((tension) => tension.id === action.sourceTensionId
          ? {
              ...tension,
              waitingFor: tension.raiserId,
              latestNote: `${personName(CURRENT_USER_ID)} accepted the action “${action.title}”. Waiting for ${personName(tension.raiserId)} to confirm whether this resolves the tension.`,
            }
          : tension));
        completeAttentionForTarget("tension", action.sourceTensionId);
      }
      return;
    }

    if (item.kind === "tension" && item.targetId) {
      openTensions("", item.targetId);
      return;
    }

    if (item.kind === "governance") {
      setView("governance");
    }
  }

  function handleNoChange(item: AttentionItem) {
    if (item.targetId) {
      setWorkProjects((current) => current.map((project) => project.id === item.targetId
        ? { ...project, lastUpdate: PROTOTYPE_TODAY, nextPrompt: NEXT_WEEK }
        : project));
    }
    completeItem(item.id);
    announce("Project checked: no change. Next prompt is Aug 18.");
  }

  function saveProjectUpdate(projectId: string, summary: string) {
    const project = workProjects.find((candidate) => candidate.id === projectId);
    setWorkProjects((current) => current.map((candidate) => candidate.id === projectId
      ? { ...candidate, summary: summary.trim(), lastUpdate: PROTOTYPE_TODAY, nextPrompt: NEXT_WEEK }
      : candidate));
    completeAttentionForTarget("project_update", projectId);
    setProjectUpdateId(null);
    announce(`${project?.title ?? "Project"} updated and saved in this browser session.`);
  }

  function raiseTensionFromProject(projectId: string) {
    const project = workProjects.find((candidate) => candidate.id === projectId);
    setProjectUpdateId(null);
    openTensions(project ? `${project.title}: ` : "");
  }

  function addTension(tension: Tension) {
    setWorkTensions((current) => [tension, ...current]);
    announce(`Tension raised: “${tension.title}”.`);
  }

  function respondToTension(tensionId: string, note: string) {
    setWorkTensions((current) => current.map((tension) => tension.id === tensionId
      ? {
          ...tension,
          waitingFor: tension.raiserId,
          latestNote: `${personName(CURRENT_USER_ID)} responded: ${note.trim()} Waiting for ${personName(tension.raiserId)} to confirm whether this resolves the tension.`,
        }
      : tension));
    completeAttentionForTarget("tension", tensionId);
    announce("Response recorded on the tension.");
  }

  function resolveTension(tensionId: string, note: string) {
    setWorkTensions((current) => current.map((tension) => tension.id === tensionId
      ? { ...tension, status: "resolved", waitingFor: undefined, latestNote: note }
      : tension));
    completeAttentionForTarget("tension", tensionId);
    announce("Tension resolved.");
  }

  function moveTension(tensionId: string, status: "governance" | "needs_sync", note: string) {
    setWorkTensions((current) => current.map((tension) => tension.id === tensionId
      ? { ...tension, status, waitingFor: undefined, latestNote: note }
      : tension));
    completeAttentionForTarget("tension", tensionId);
    announce(status === "governance" ? "Tension moved to Governance." : "Tension marked as needing synchronous discussion.");
  }

  function createActionFromTension(tensionId: string, title: string, ownerId: string) {
    const tension = workTensions.find((candidate) => candidate.id === tensionId);
    if (!tension) return;

    const action: Action = {
      id: `action-${Date.now()}`,
      title: title.trim(),
      ownerId,
      status: ownerId === CURRENT_USER_ID ? "open" : "proposed",
      source: tension.title,
      sourceTensionId: tension.id,
    };
    setWorkActions((current) => [action, ...current]);

    if (ownerId === CURRENT_USER_ID) {
      resolveTension(tensionId, `Action created: “${action.title}”. The tension is resolved.`);
      announce(`Action created: “${action.title}”.`);
    } else {
      setWorkTensions((current) => current.map((candidate) => candidate.id === tensionId
        ? {
            ...candidate,
            status: "open",
            waitingFor: ownerId,
            latestNote: `Action proposed to ${personName(ownerId)}: “${action.title}”. The tension stays open until they respond.`,
          }
        : candidate));
      announce(`Action proposed to ${personName(ownerId)}: “${action.title}”.`);
    }
  }

  function createProjectFromTension(tensionId: string, title: string) {
    const tension = workTensions.find((candidate) => candidate.id === tensionId);
    if (!tension) return;

    const project: Project = {
      id: `project-${Date.now()}`,
      title: title.trim(),
      ownerId: CURRENT_USER_ID,
      status: "active",
      lastUpdate: PROTOTYPE_TODAY,
      nextPrompt: NEXT_WEEK,
      summary: `Created from tension: ${tension.title}`,
    };
    setWorkProjects((current) => [project, ...current]);
    resolveTension(tensionId, `Project created: “${project.title}”. The tension is resolved.`);
    announce(`Project created: “${project.title}”.`);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /></div>
          <div className="brand">SDBP Governance<small>Structure · rhythm · memory</small></div>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {(Object.keys(labels) as View[]).map((key) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>
              <strong>{labels[key]}</strong>
              <small>{navMeta[key]}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">E</div>
          <div><strong>Edo</strong><small>Prototype view · saves in this tab</small></div>
        </div>
      </aside>

      <main className="main">
        <Header view={view} attentionCount={activeAttention.length} />
        {view === "attention" && <AttentionView
          items={activeAttention}
          deferred={deferredAttention}
          onPrimary={handleAttentionPrimary}
          onNoChange={handleNoChange}
          deferItem={deferItem}
          restoreItem={restoreItem}
          onRaiseTension={() => openTensions()}
        />}
        {view === "work" && <WorkView projects={workProjects} actions={workActions} />}
        {view === "tensions" && <TensionsView
          tensions={workTensions}
          projects={workProjects}
          selectedTensionId={selectedTensionId}
          draftSeed={tensionDraftSeed}
          onAddTension={addTension}
          onRespond={respondToTension}
          onResolve={resolveTension}
          onMove={moveTension}
          onCreateAction={createActionFromTension}
          onCreateProject={createProjectFromTension}
        />}
        {view === "organisation" && <OrganisationView roles={roles} setRoles={setRoles} onSaved={(title) => announce(`Role saved: “${title}”.`)} />}
        {view === "governance" && <GovernanceView />}
        {view === "records" && <RecordsView />}
        {view === "pulse" && <PulseView attention={attention} actions={workActions} tensions={workTensions} />}
      </main>

      {saveNotice && <div className="save-toast" role="status" aria-live="polite"><span aria-hidden="true">✓</span>{saveNotice}</div>}

      {projectUpdate && <ProjectUpdateEditor
        project={projectUpdate}
        onSave={saveProjectUpdate}
        onNoChange={() => {
          const item = attention.find((candidate) => candidate.kind === "project_update" && candidate.targetId === projectUpdate.id);
          if (item) handleNoChange(item);
          setProjectUpdateId(null);
        }}
        onRaiseTension={() => raiseTensionFromProject(projectUpdate.id)}
        onClose={() => setProjectUpdateId(null)}
      />}
    </div>
  );
}

function Header({ view, attentionCount }: { view: View; attentionCount: number }) {
  const descriptions: Record<View, string> = {
    attention: attentionCount ? `${attentionCount} things need your attention. Start with the one that creates the most movement.` : "Nothing needs you right now.",
    work: "Keep outcomes visible. Update only when something actually changed.",
    tensions: "A tension is a gap between current reality and a potential future you sense. Raise one whenever something could be better.",
    organisation: "See who fills each SDBP role, what that role covers, and where its authority comes from.",
    governance: "Governance changes SDBP's ongoing roles, accountabilities, domains and policies. Use it when a tension requires a change to the standing organisational structure.",
    records: "The legal and organisational memory you can return to when context matters.",
    pulse: "A quiet overview of where SDBP is losing momentum or clarity — not an approval queue.",
  };
  return (
    <header className="page-head">
      <div>
        <div className="eyebrow">SDBP · working space</div>
        <h1>{labels[view]}</h1>
        <p>{descriptions[view]}</p>
      </div>
      <div className="brand-signal" aria-label="SDBP visual signature"><span /><span /><span /></div>
    </header>
  );
}

function AttentionView({ items, deferred, onPrimary, onNoChange, deferItem, restoreItem, onRaiseTension }: {
  items: AttentionItem[];
  deferred: AttentionItem[];
  onPrimary: (item: AttentionItem) => void;
  onNoChange: (item: AttentionItem) => void;
  deferItem: (id: string) => void;
  restoreItem: (id: string) => void;
  onRaiseTension: () => void;
}) {
  const featured = items[0];
  const rest = items.slice(1);

  return (
    <>
      {featured ? (
        <div className="attention-layout">
          <article className="focus-card">
            <div className="focus-top">
              <span className="kind">Most important now · {humanKind(featured.kind)}</span>
              {featured.staleDays && featured.staleDays >= 7 ? <span className="badge-warn">{featured.staleDays} days since update</span> : null}
            </div>
            <div className="focus-body">
              <div>
                <h2>{featured.title}</h2>
                <p>{featured.reason}</p>
              </div>
              <div className="focus-orb" aria-hidden="true"><span>{featured.staleDays ?? "→"}</span></div>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => onPrimary(featured)}>{featured.primaryAction}</button>
              {featured.kind === "project_update" && <button className="secondary" onClick={() => onNoChange(featured)}>No change</button>}
              <button className="quiet" onClick={() => deferItem(featured.id)}>Remind me later</button>
            </div>
          </article>

          <aside className="week-card">
            <div>
              <span className="kind">This week</span>
              <div className="week-number">{items.length}</div>
              <p>open interactions</p>
            </div>
            <div className="week-divider" />
            <button className="text-action" onClick={onRaiseTension}>+ Raise a tension</button>
            <small>The app will keep parked items in view and bring them back when due.</small>
          </aside>
        </div>
      ) : <div className="calm-empty"><span>✓</span><h2>Clear for now</h2><p>Nothing is waiting for you.</p></div>}

      {rest.length > 0 && (
        <section className="section">
          <div className="section-head"><div><span className="section-kicker">Next</span><h2>Then move these forward</h2></div></div>
          <div className="attention-grid">
            {rest.map((item) => (
              <AttentionCard key={item.id} item={item} onPrimary={onPrimary} deferItem={deferItem} />
            ))}
          </div>
        </section>
      )}

      {deferred.length > 0 && <section className="section parked-section">
        <div className="section-head"><div><span className="section-kicker">Parked intentionally</span><h2>Not forgotten</h2></div><span className="muted">Returns on its reminder date</span></div>
        <div className="soft-list">{deferred.map((item) => (
          <div className="soft-row" key={item.id}>
            <div><strong>{item.title}</strong><small>Deferred, not ignored.</small></div>
            <button className="quiet" onClick={() => restoreItem(item.id)}>Bring back now</button>
          </div>
        ))}</div>
      </section>}
    </>
  );
}

function AttentionCard({ item, onPrimary, deferItem }: {
  item: AttentionItem;
  onPrimary: (item: AttentionItem) => void;
  deferItem: (id: string) => void;
}) {
  return (
    <article className="attention-card">
      <div className={`type-dot type-${item.kind}`} aria-hidden="true" />
      <div className="attention-copy">
        <span className="kind">{humanKind(item.kind)}</span>
        <h3>{item.title}</h3>
        <p>{item.reason}</p>
      </div>
      <div className="actions compact-actions">
        <button className="primary small" onClick={() => onPrimary(item)}>{item.primaryAction}</button>
        <button className="quiet small" onClick={() => deferItem(item.id)}>Later</button>
      </div>
    </article>
  );
}

function ProjectUpdateEditor({ project, onSave, onNoChange, onRaiseTension, onClose }: {
  project: Project;
  onSave: (projectId: string, summary: string) => void;
  onNoChange: () => void;
  onRaiseTension: () => void;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState(project.summary);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="workflow-editor" role="dialog" aria-modal="true" aria-labelledby="project-update-title">
        <div className="editor-head">
          <div><span className="section-kicker">Weekly project update</span><h2 id="project-update-title">{project.title}</h2></div>
          <button className="quiet editor-close" onClick={onClose} aria-label="Close project update">×</button>
        </div>
        <p className="editor-note">Has anything meaningfully changed since the last update? Keep this short. The app needs the current reality, not a report.</p>
        <label className="field"><span>Current project state</span><textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} /></label>
        <div className="workflow-choice-row">
          <button className="secondary" onClick={onNoChange}>No change</button>
          <button className="secondary" onClick={onRaiseTension}>Raise a tension instead</button>
          <button className="primary" disabled={!summary.trim()} onClick={() => onSave(project.id, summary)}>Save update</button>
        </div>
      </section>
    </div>
  );
}

function WorkView({ projects, actions }: { projects: Project[]; actions: Action[] }) {
  return (
    <div className="work-layout">
      <section className="work-main">
        <div className="section-head"><div><span className="section-kicker">Current outcomes</span><h2>Active projects</h2></div></div>
        <div className="project-grid">{projects.filter((project) => project.status === "active").map((project, index) => (
          <article className={`project-card ${index === 0 ? "project-featured" : ""}`} key={project.id}>
            <div className="project-accent" aria-hidden="true" />
            <span className="kind">{project.role ?? "SDBP project"}</span>
            <h3>{project.title}</h3>
            <p>{project.summary}</p>
            <div className="project-meta">
              <span><strong>{personName(project.ownerId)}</strong><small>owner</small></span>
              <span><strong>{formatShortDate(project.lastUpdate)}</strong><small>last updated</small></span>
              <span><strong>{formatShortDate(project.nextPrompt)}</strong><small>next prompt</small></span>
            </div>
          </article>
        ))}</div>
      </section>

      <aside className="action-rail">
        <div className="section-head"><div><span className="section-kicker">Concrete next steps</span><h2>Actions</h2></div></div>
        <div className="action-stack">{actions.filter((action) => action.status !== "done" && action.status !== "cancelled").map((action) => (
          <article className="action-slip" key={action.id}>
            <span className="action-status">{action.status}</span>
            <h3>{action.title}</h3>
            <p>{action.source}</p>
            <div className="action-owner"><span className="mini-avatar">{personInitial(action.ownerId)}</span>{personName(action.ownerId)}</div>
          </article>
        ))}</div>
      </aside>
    </div>
  );
}

function TensionsView({ tensions, projects, selectedTensionId, draftSeed, onAddTension, onRespond, onResolve, onMove, onCreateAction, onCreateProject }: {
  tensions: Tension[];
  projects: Project[];
  selectedTensionId: string | null;
  draftSeed: string;
  onAddTension: (tension: Tension) => void;
  onRespond: (tensionId: string, note: string) => void;
  onResolve: (tensionId: string, note: string) => void;
  onMove: (tensionId: string, status: "governance" | "needs_sync", note: string) => void;
  onCreateAction: (tensionId: string, title: string, ownerId: string) => void;
  onCreateProject: (tensionId: string, title: string) => void;
}) {
  const [draft, setDraft] = useState(draftSeed);
  const [processingId, setProcessingId] = useState<string | null>(selectedTensionId);
  const [outcome, setOutcome] = useState<TensionOutcome | null>(null);
  const [outcomeTitle, setOutcomeTitle] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [ownerId, setOwnerId] = useState(CURRENT_USER_ID);
  const activeTensions = tensions.filter((tension) => tension.status !== "resolved");

  function resetProcessing() {
    setProcessingId(null);
    setOutcome(null);
    setOutcomeTitle("");
    setOutcomeNote("");
    setOwnerId(CURRENT_USER_ID);
  }

  function startProcessing(tensionId: string) {
    setProcessingId(tensionId);
    setOutcome(null);
    setOutcomeTitle("");
    setOutcomeNote("");
    setOwnerId(CURRENT_USER_ID);
  }

  function raiseTension() {
    const title = draft.trim();
    if (!title) return;
    const tension: Tension = {
      id: `tension-${Date.now()}`,
      title,
      raiserId: CURRENT_USER_ID,
      status: "open",
      createdAt: PROTOTYPE_TODAY,
    };
    onAddTension(tension);
    setDraft("");
    startProcessing(tension.id);
  }

  return (
    <>
      <div className="tension-composer">
        <div className="composer-copy">
          <span className="section-kicker">Raise a tension</span>
          <h2>What tension do you want to raise?</h2>
          <p>A tension can point to a problem, an opportunity, missing clarity, or something blocking the work. You do not need to know the solution yet.</p>
        </div>
        <div className="composer-input">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Membership list still not received…" />
          <button className="primary" disabled={!draft.trim()} onClick={raiseTension}>Raise tension</button>
        </div>
      </div>

      <section className="section">
        <div className="section-head"><div><span className="section-kicker">Open</span><h2>Tensions waiting to be processed</h2></div><span className="counter">{activeTensions.length}</span></div>
        {activeTensions.length === 0 ? <div className="calm-empty compact-empty"><span>✓</span><h3>No open tensions</h3><p>Nothing currently needs processing.</p></div> : (
          <div className="tension-stream">{activeTensions.map((tension) => {
            const project = projects.find((candidate) => candidate.id === tension.linkedProjectId);
            const canProcess = tension.raiserId === CURRENT_USER_ID && tension.status === "open";
            const needsMyResponse = tension.waitingFor === CURRENT_USER_ID && tension.raiserId !== CURRENT_USER_ID && tension.status === "open";
            const isProcessing = processingId === tension.id;

            return (
              <article className={`tension-card ${isProcessing ? "tension-card-open" : ""}`} key={tension.id}>
                <div className="tension-line" aria-hidden="true" />
                <div className="tension-content">
                  <div className="tension-meta"><span>Raised by {personName(tension.raiserId)}</span>{project && <span>{project.title}</span>}<span>{formatTensionStatus(tension)}</span></div>
                  <h3>{tension.title}</h3>
                  <p>{tension.latestNote ?? (tension.waitingFor ? `Waiting for ${personName(tension.waitingFor)}.` : "Ready to process.")}</p>

                  {isProcessing && needsMyResponse && (
                    <div className="tension-process-panel">
                      <span className="kind">Your response</span>
                      <h4>What does {personName(tension.raiserId)} need to know from you?</h4>
                      <textarea rows={3} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} placeholder="Give the concrete response or commitment…" />
                      <div className="process-actions"><button className="quiet" onClick={resetProcessing}>Cancel</button><button className="primary small" disabled={!outcomeNote.trim()} onClick={() => { onRespond(tension.id, outcomeNote); resetProcessing(); }}>Send response</button></div>
                    </div>
                  )}

                  {isProcessing && canProcess && (
                    <TensionProcessPanel
                      tension={tension}
                      outcome={outcome}
                      setOutcome={setOutcome}
                      outcomeTitle={outcomeTitle}
                      setOutcomeTitle={setOutcomeTitle}
                      outcomeNote={outcomeNote}
                      setOutcomeNote={setOutcomeNote}
                      ownerId={ownerId}
                      setOwnerId={setOwnerId}
                      onCancel={resetProcessing}
                      onCreateAction={() => { onCreateAction(tension.id, outcomeTitle, ownerId); resetProcessing(); }}
                      onCreateProject={() => { onCreateProject(tension.id, outcomeTitle); resetProcessing(); }}
                      onResolveInformation={() => { onResolve(tension.id, `Information captured: ${outcomeNote.trim()}`); resetProcessing(); }}
                      onResolveNone={() => { onResolve(tension.id, "No further action is needed. The tension is resolved."); resetProcessing(); }}
                      onGovernance={() => { onMove(tension.id, "governance", "This tension requires a change to an ongoing role, accountability, domain or policy and has moved to Governance."); resetProcessing(); }}
                      onSync={() => { onMove(tension.id, "needs_sync", "Asynchronous processing was not enough. This tension needs synchronous discussion."); resetProcessing(); }}
                    />
                  )}
                </div>

                {!isProcessing && needsMyResponse && <button className="secondary" onClick={() => startProcessing(tension.id)}>Respond <span aria-hidden="true">→</span></button>}
                {!isProcessing && canProcess && <button className="secondary" onClick={() => startProcessing(tension.id)}>What do you need? <span aria-hidden="true">→</span></button>}
                {!isProcessing && !needsMyResponse && !canProcess && <span className={`tension-state tension-state-${tension.status}`}>{formatTensionStatus(tension)}</span>}
              </article>
            );
          })}</div>
        )}
      </section>
    </>
  );
}

function TensionProcessPanel({ tension, outcome, setOutcome, outcomeTitle, setOutcomeTitle, outcomeNote, setOutcomeNote, ownerId, setOwnerId, onCancel, onCreateAction, onCreateProject, onResolveInformation, onResolveNone, onGovernance, onSync }: {
  tension: Tension;
  outcome: TensionOutcome | null;
  setOutcome: (outcome: TensionOutcome | null) => void;
  outcomeTitle: string;
  setOutcomeTitle: (value: string) => void;
  outcomeNote: string;
  setOutcomeNote: (value: string) => void;
  ownerId: string;
  setOwnerId: (value: string) => void;
  onCancel: () => void;
  onCreateAction: () => void;
  onCreateProject: () => void;
  onResolveInformation: () => void;
  onResolveNone: () => void;
  onGovernance: () => void;
  onSync: () => void;
}) {
  const outcomes: { id: TensionOutcome; label: string; description: string }[] = [
    { id: "information", label: "Information", description: "I need an answer, fact or clarification." },
    { id: "action", label: "Action", description: "I need one concrete next step." },
    { id: "project", label: "Project", description: "I need an outcome that will take more than one step." },
    { id: "governance", label: "Governance", description: "An ongoing role, accountability, domain or policy needs to change." },
    { id: "sync", label: "Synchronous discussion", description: "This cannot be processed well enough asynchronously." },
    { id: "none", label: "Nothing further", description: "Naming or reviewing it was enough." },
  ];

  return (
    <div className="tension-process-panel">
      <span className="kind">Process tension</span>
      <h4>What do you need?</h4>
      <p className="process-help">Choose the outcome that would resolve “{tension.title}”. If work is proposed to somebody else, the tension remains open until they respond.</p>
      <div className="outcome-grid">{outcomes.map((candidate) => (
        <button key={candidate.id} className={outcome === candidate.id ? "outcome-option selected" : "outcome-option"} onClick={() => setOutcome(candidate.id)}>
          <strong>{candidate.label}</strong><small>{candidate.description}</small>
        </button>
      ))}</div>

      {outcome === "information" && <div className="outcome-form"><label className="field"><span>Information or clarification</span><textarea rows={3} value={outcomeNote} onChange={(event) => setOutcomeNote(event.target.value)} /></label><button className="primary small" disabled={!outcomeNote.trim()} onClick={onResolveInformation}>Record and resolve</button></div>}
      {outcome === "action" && <div className="outcome-form outcome-form-grid"><label className="field"><span>Action</span><input value={outcomeTitle} onChange={(event) => setOutcomeTitle(event.target.value)} placeholder="Send current membership list" /></label><label className="field"><span>Owner</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button className="primary small" disabled={!outcomeTitle.trim()} onClick={onCreateAction}>Create action</button></div>}
      {outcome === "project" && <div className="outcome-form"><label className="field"><span>Project outcome</span><input value={outcomeTitle} onChange={(event) => setOutcomeTitle(event.target.value)} placeholder="Prepare membership data for the General Assembly" /></label><button className="primary small" disabled={!outcomeTitle.trim()} onClick={onCreateProject}>Create project</button></div>}
      {outcome === "governance" && <div className="outcome-form"><p>This moves the tension to Governance because the standing organisational structure needs to change.</p><button className="primary small" onClick={onGovernance}>Move to Governance</button></div>}
      {outcome === "sync" && <div className="outcome-form"><p>The tension stays visible but is marked as needing synchronous discussion.</p><button className="primary small" onClick={onSync}>Mark as needing sync</button></div>}
      {outcome === "none" && <div className="outcome-form"><p>No action, project or structural change is needed.</p><button className="primary small" onClick={onResolveNone}>Resolve tension</button></div>}

      <div className="process-actions"><button className="quiet" onClick={onCancel}>Close</button></div>
    </div>
  );
}

function OrganisationView({ roles, setRoles, onSaved }: {
  roles: RoleDefinition[];
  setRoles: React.Dispatch<React.SetStateAction<RoleDefinition[]>>;
  onSaved: (title: string) => void;
}) {
  const [editingRole, setEditingRole] = useState<RoleDefinition | null>(null);
  const unfilledRoles = roles.filter((role) => role.holderIds.length === 0);

  function editRole(role: RoleDefinition) {
    setEditingRole(role);
  }

  function addRole(holderId = "", category: RoleDefinition["category"] = "operating") {
    setEditingRole({
      id: `role-${Date.now()}`,
      title: "",
      category,
      holderIds: holderId ? [holderId] : [],
      purpose: "",
      scope: "",
      responsibilities: [],
      accountabilities: [],
      source: category === "board" ? "SDBP Statutes / applicable law" : "SDBP operating governance",
      status: "draft",
    });
  }

  function saveRole(nextRole: RoleDefinition) {
    setRoles((current) => current.some((role) => role.id === nextRole.id)
      ? current.map((role) => role.id === nextRole.id ? nextRole : role)
      : [...current, nextRole]);
    setEditingRole(null);
    onSaved(nextRole.title);
  }

  return (
    <>
      <div className="org-intro">
        <div>
          <span className="section-kicker">Roles and authority</span>
          <h2>Roles make responsibilities explicit</h2>
          <p>Board roles and operating roles are both roles. Board-role authority comes from the statutes and applicable law; operating-role authority comes from SDBP governance. Hover a role to see its definition, or click it to edit.</p>
          <div className="org-actions"><button className="primary small" onClick={() => addRole()}>+ Add role</button></div>
        </div>
        <div className="org-ring" aria-hidden="true"><span>SDBP</span></div>
      </div>

      <div className="people-grid">{people.map((person) => {
        const boardRoles = roles.filter((role) => role.category === "board" && role.holderIds.includes(person.id));
        const operatingRoles = roles.filter((role) => role.category === "operating" && role.holderIds.includes(person.id));

        return (
          <article className="person-card" key={person.id}>
            <div className="person-top"><div className="person-avatar">{person.name.charAt(0)}</div></div>
            <h3>{person.name}</h3>

            <div className="person-role-group">
              <span className="role-group-label">Board role</span>
              <div className="role-list">
                {boardRoles.length
                  ? boardRoles.map((role) => <RoleChip key={role.id} role={role} onEdit={editRole} />)
                  : <button className="missing-role" onClick={() => addRole(person.id, "board")}>+ Add board role</button>}
              </div>
            </div>

            <div className="person-role-group">
              <span className="role-group-label">Operating roles</span>
              <div className="role-list">
                {operatingRoles.length
                  ? operatingRoles.map((role) => <RoleChip key={role.id} role={role} onEdit={editRole} />)
                  : <button className="missing-role" onClick={() => addRole(person.id, "operating")}>+ Add operating role</button>}
              </div>
            </div>
          </article>
        );
      })}</div>

      {unfilledRoles.length > 0 && (
        <section className="section">
          <div className="section-head"><div><span className="section-kicker">Unfilled</span><h2>Roles without a holder</h2></div></div>
          <div className="unfilled-role-list">{unfilledRoles.map((role) => <RoleChip key={role.id} role={role} onEdit={editRole} />)}</div>
        </section>
      )}

      {editingRole && <RoleEditor key={editingRole.id} role={editingRole} onSave={saveRole} onClose={() => setEditingRole(null)} />}
    </>
  );
}

function RoleChip({ role, onEdit }: { role: RoleDefinition; onEdit: (role: RoleDefinition) => void }) {
  return (
    <div className="role-chip-wrap">
      <button className={`role-chip role-chip-${role.category}`} onClick={() => onEdit(role)} aria-describedby={`role-tip-${role.id}`}>
        {role.title || "Untitled role"}
      </button>
      <div className="role-popover" id={`role-tip-${role.id}`} role="tooltip">
        <div className="role-popover-head">
          <div><span className="kind">{role.category === "board" ? "Board role" : "Operating role"}</span><h3>{role.title || "Untitled role"}</h3></div>
          <span className={`definition-status ${role.status}`}>{role.status}</span>
        </div>
        <RoleDetail label="Purpose" text={role.purpose || "Not defined yet."} />
        <RoleDetail label="Scope" text={role.scope || "Not defined yet."} />
        <RoleList label="Responsibilities" items={role.responsibilities} />
        <RoleList label="Accountabilities" items={role.accountabilities} />
        <div className="role-source"><strong>Source</strong><span>{role.source || "Not recorded"}</span></div>
        <button className="secondary small" onClick={() => onEdit(role)}>Edit role</button>
      </div>
    </div>
  );
}

function RoleDetail({ label, text }: { label: string; text: string }) {
  return <div className="role-detail"><strong>{label}</strong><p>{text}</p></div>;
}

function RoleList({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="role-detail">
      <strong>{label}</strong>
      {items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Not defined yet.</p>}
    </div>
  );
}

function RoleEditor({ role, onSave, onClose }: { role: RoleDefinition; onSave: (role: RoleDefinition) => void; onClose: () => void }) {
  const [title, setTitle] = useState(role.title);
  const [category, setCategory] = useState<RoleDefinition["category"]>(role.category);
  const [holderId, setHolderId] = useState(role.holderIds[0] ?? "");
  const [purpose, setPurpose] = useState(role.purpose);
  const [scope, setScope] = useState(role.scope);
  const [responsibilities, setResponsibilities] = useState(role.responsibilities.join("\n"));
  const [accountabilities, setAccountabilities] = useState(role.accountabilities.join("\n"));
  const [source, setSource] = useState(role.source);
  const [status, setStatus] = useState<RoleDefinition["status"]>(role.status);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="role-editor" role="dialog" aria-modal="true" aria-labelledby="role-editor-title">
        <div className="editor-head">
          <div><span className="section-kicker">Role definition</span><h2 id="role-editor-title">{role.title ? `Edit ${role.title}` : "Add role"}</h2></div>
          <button className="quiet editor-close" onClick={onClose} aria-label="Close role editor">×</button>
        </div>
        <p className="editor-note">Prototype only: these edits are saved in this browser tab and survive a refresh. Closing the tab resets the prototype.</p>

        <form onSubmit={(event) => {
          event.preventDefault();
          onSave({
            ...role,
            title: title.trim(),
            category,
            holderIds: holderId ? [holderId] : [],
            purpose: purpose.trim(),
            scope: scope.trim(),
            responsibilities: splitLines(responsibilities),
            accountabilities: splitLines(accountabilities),
            source: source.trim(),
            status,
          });
        }}>
          <div className="editor-grid">
            <label className="field field-wide"><span>Role title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Secretary" autoFocus /></label>
            <label className="field"><span>Role type</span><select value={category} onChange={(event) => setCategory(event.target.value as RoleDefinition["category"])}><option value="board">Board role</option><option value="operating">Operating role</option></select></label>
            <label className="field"><span>Holder</span><select value={holderId} onChange={(event) => setHolderId(event.target.value)}><option value="">Unfilled</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="field field-wide"><span>Purpose</span><textarea rows={2} value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Why does this role exist?" /></label>
            <label className="field field-wide"><span>Scope</span><textarea rows={3} value={scope} onChange={(event) => setScope(event.target.value)} placeholder="What does the role cover, and where are its boundaries?" /></label>
            <label className="field"><span>Responsibilities</span><textarea rows={5} value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} placeholder="One responsibility per line" /></label>
            <label className="field"><span>Accountabilities</span><textarea rows={5} value={accountabilities} onChange={(event) => setAccountabilities(event.target.value)} placeholder="One ongoing accountability per line" /></label>
            <label className="field"><span>Source</span><input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Statutes, law, governance decision…" /></label>
            <label className="field"><span>Definition status</span><select value={status} onChange={(event) => setStatus(event.target.value as RoleDefinition["status"])}><option value="draft">Draft</option><option value="defined">Defined</option></select></label>
          </div>
          <div className="editor-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button type="submit" className="primary" disabled={!title.trim()}>Save role</button></div>
        </form>
      </section>
    </div>
  );
}

function GovernanceView() {
  const governanceSteps = [
    { name: "Present Proposal", description: "The proposer describes the tension and presents a governance change intended to address it." },
    { name: "Clarifying Questions", description: "Others may ask questions to understand the tension or proposal. This is not the place for reactions, opinions or discussion." },
    { name: "Reaction Round", description: "Each participant may react to the proposal. The proposer listens without responding during the round." },
    { name: "Option to Clarify", description: "The proposer may clarify the proposal or amend it after hearing the reactions." },
    { name: "Objection Round", description: "Participants may raise concerns about adopting the proposal. Concerns that meet the objection criteria are captured as valid objections. If there are none, the proposal is accepted." },
    { name: "Integration", description: "If valid objections exist, the proposal is amended to resolve each objection while still addressing the original tension. The proposal then returns to an Objection Round." },
    { name: "Proposal Accepted", description: "When no valid objections remain, the proposal is adopted and the resulting governance change is recorded." },
  ];

  return (
    <div className="governance-layout">
      <section className="governance-stage">
        <span className="section-kicker">Governance process</span>
        <h2>Change the standing organisational structure</h2>
        <p>Use governance when resolving a tension requires changing an ongoing role, accountability, domain or policy. A governance proposal is adopted when no valid objections remain.</p>
        <div className="process-path" aria-label="Integrative Decision-Making process">
          {governanceSteps.map((step, index) => <span key={step.name} className={index === 0 ? "active" : ""}>{step.name}</span>)}
        </div>
        <div className="soft-list">
          {governanceSteps.map((step, index) => (
            <div className="soft-row" key={step.name}>
              <div><strong>{index + 1}. {step.name}</strong><small>{step.description}</small></div>
            </div>
          ))}
        </div>
        <div className="calm-empty compact-empty"><span>○</span><h3>No governance proposal needs processing</h3><p>There is currently no proposed structural change waiting for a response.</p></div>
      </section>
      <aside className="governance-note">
        <span className="kind">What belongs here?</span>
        <h3>Governance</h3>
        <p>Changes an ongoing role, accountability, domain or policy.</p>
        <div className="note-divider" />
        <h3>Operational work</h3>
        <p>One-off actions, project updates and immediate barriers stay in Work or Tensions.</p>
      </aside>
    </div>
  );
}

function RecordsView() {
  const records = [
    { label: "Legal backbone", title: "SDBP Statutes", text: "Authoritative current version, version history and searchable provisions.", action: "Search statutes", mark: "§" },
    { label: "What happened", title: "Board minutes", text: "Meeting records and the decisions or commitments that followed.", action: "Open minutes", mark: "M" },
    { label: "How we work", title: "Governance agreements", text: "Standing agreements, current versions and what they superseded.", action: "Open agreements", mark: "G" },
  ];
  return (
    <>
      <div className="records-intro"><span className="section-kicker">Planned persistence</span><strong>Uploads are not connected yet.</strong><p>Records will become persistent after the central interaction loop is validated and Supabase is connected.</p></div>
      <div className="records-grid">{records.map((record, index) => (
        <article className={`record-card record-${index + 1}`} key={record.title}>
          <div className="record-mark">{record.mark}</div>
          <span className="kind">{record.label}</span>
          <h2>{record.title}</h2>
          <p>{record.text}</p>
          <button className="secondary" disabled>{record.action}</button>
        </article>
      ))}</div>
    </>
  );
}

function PulseView({ attention, actions, tensions }: { attention: AttentionItem[]; actions: Action[]; tensions: Tension[] }) {
  const metrics = useMemo(() => ({
    overdue: actions.filter((action) => action.status !== "done" && action.due && action.due < PROTOTYPE_TODAY).length,
    stale: attention.filter((item) => (item.staleDays ?? 0) >= 7 && item.status !== "done").length,
    tensions: tensions.filter((tension) => tension.status !== "resolved").length,
  }), [attention, actions, tensions]);
  const signalCount = metrics.overdue + metrics.stale + metrics.tensions;

  return (
    <>
      <div className="pulse-layout">
        <article className="pulse-hero">
          <span className="section-kicker">Process signals</span>
          <div className="pulse-number">{signalCount}</div>
          <h2>{signalCount === 1 ? "visible signal needs attention" : "visible signals need attention"}</h2>
          <p>{signalCount ? "These are exceptions in the current organisational rhythm, not a performance score." : "No stale attention, unresolved tensions or overdue actions are currently visible."}</p>
          <div className="signal-line"><span style={{ width: `${Math.min(100, signalCount * 18)}%` }} /></div>
        </article>
        <div className="pulse-metrics">
          <Metric label="Open tensions" value={metrics.tensions} note="not resolved" />
          <Metric label="Stale items" value={metrics.stale} note="7+ days" />
          <Metric label="Overdue actions" value={metrics.overdue} note="past due date" />
        </div>
      </div>

      <section className="section">
        <div className="section-head"><div><span className="section-kicker">Exceptions only</span><h2>Where clarity is slipping</h2></div></div>
        {signalCount === 0 ? <div className="calm-empty compact-empty"><span>✓</span><h3>No exception needs attention</h3><p>The visible process is currently clear.</p></div> : (
          <div className="exception-stack">
            {metrics.stale > 0 && <article className="exception-card"><div className="exception-marker"><span /></div><div><h3>{metrics.stale} stale attention {metrics.stale === 1 ? "item" : "items"}</h3><p>An interaction has remained unanswered for at least seven days.</p></div><span className="badge-warn">needs attention</span></article>}
            {tensions.filter((tension) => tension.status !== "resolved").map((tension) => <article className="exception-card" key={tension.id}><div className="exception-marker"><span /></div><div><h3>{tension.title}</h3><p>{tension.latestNote ?? `Open tension raised by ${personName(tension.raiserId)}.`}</p></div><span className="badge-warn">{formatTensionStatus(tension)}</span></article>)}
          </div>
        )}
      </section>
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}

function splitLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function humanKind(kind: AttentionItem["kind"]) {
  return kind.replace("_", " ");
}

function personName(id: string) {
  return people.find((person) => person.id === id)?.name ?? id;
}

function personInitial(id: string) {
  return personName(id).charAt(0);
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function formatTensionStatus(tension: Tension) {
  if (tension.status === "needs_sync") return "Needs sync";
  if (tension.status === "governance") return "Moved to governance";
  if (tension.waitingFor) return `Waiting for ${personName(tension.waitingFor)}`;
  return "Open";
}
