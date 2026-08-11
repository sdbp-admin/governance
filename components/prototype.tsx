"use client";

import { useMemo, useState } from "react";
import { actions, myAttention, people, projects, tensions } from "@/lib/mock-data";
import type { AttentionItem } from "@/lib/domain";

type View = "attention" | "work" | "tensions" | "organisation" | "governance" | "records" | "pulse";

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
  tensions: "What needs movement",
  organisation: "People & roles",
  governance: "Change the structure",
  records: "Organisational memory",
  pulse: "Process health",
};

export function Prototype() {
  const [view, setView] = useState<View>("attention");
  const [attention, setAttention] = useState<AttentionItem[]>(myAttention);
  const activeAttention = attention.filter((item) => item.status === "needs_action");
  const deferredAttention = attention.filter((item) => item.status === "deferred");

  function completeItem(id: string) {
    setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "done" } : item));
  }

  function deferItem(id: string) {
    setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "deferred" } : item));
  }

  function restoreItem(id: string) {
    setAttention((items) => items.map((item) => item.id === id ? { ...item, status: "needs_action" } : item));
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
          <div><strong>Edo</strong><small>Prototype view</small></div>
        </div>
      </aside>

      <main className="main">
        <Header view={view} attentionCount={activeAttention.length} />
        {view === "attention" && <AttentionView items={activeAttention} deferred={deferredAttention} completeItem={completeItem} deferItem={deferItem} restoreItem={restoreItem} />}
        {view === "work" && <WorkView />}
        {view === "tensions" && <TensionsView />}
        {view === "organisation" && <OrganisationView />}
        {view === "governance" && <GovernanceView />}
        {view === "records" && <RecordsView />}
        {view === "pulse" && <PulseView attention={attention} />}
      </main>
    </div>
  );
}

function Header({ view, attentionCount }: { view: View; attentionCount: number }) {
  const descriptions: Record<View, string> = {
    attention: attentionCount ? `${attentionCount} things need your attention. Start with the one that creates the most movement.` : "Nothing needs you right now.",
    work: "Keep outcomes visible. Update only when something actually changed.",
    tensions: "Capture what is pulling your attention before deciding what the solution should be.",
    organisation: "See the work SDBP depends on, separate from formal titles and individual people.",
    governance: "Change responsibilities and standing rules when the structure itself needs to evolve.",
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

function AttentionView({ items, deferred, completeItem, deferItem, restoreItem }: {
  items: AttentionItem[];
  deferred: AttentionItem[];
  completeItem: (id: string) => void;
  deferItem: (id: string) => void;
  restoreItem: (id: string) => void;
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
              <button className="primary" onClick={() => completeItem(featured.id)}>{featured.primaryAction}</button>
              {featured.kind === "project_update" && <button className="secondary" onClick={() => completeItem(featured.id)}>No change</button>}
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
            <button className="text-action">+ Raise a tension</button>
            <small>The app will keep parked items in view and bring them back when due.</small>
          </aside>
        </div>
      ) : <div className="calm-empty"><span>✓</span><h2>Clear for now</h2><p>Nothing is waiting for you.</p></div>}

      {rest.length > 0 && (
        <section className="section">
          <div className="section-head"><div><span className="section-kicker">Next</span><h2>Then move these forward</h2></div></div>
          <div className="attention-grid">
            {rest.map((item) => (
              <AttentionCard key={item.id} item={item} completeItem={completeItem} deferItem={deferItem} />
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

function AttentionCard({ item, completeItem, deferItem }: {
  item: AttentionItem;
  completeItem: (id: string) => void;
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
        <button className="primary small" onClick={() => completeItem(item.id)}>{item.primaryAction}</button>
        <button className="quiet small" onClick={() => deferItem(item.id)}>Later</button>
      </div>
    </article>
  );
}

function WorkView() {
  return (
    <div className="work-layout">
      <section className="work-main">
        <div className="section-head"><div><span className="section-kicker">Current outcomes</span><h2>Active projects</h2></div><button className="primary small">+ Project</button></div>
        <div className="project-grid">{projects.map((project, index) => (
          <article className={`project-card ${index === 0 ? "project-featured" : ""}`} key={project.id}>
            <div className="project-accent" aria-hidden="true" />
            <span className="kind">{project.role ?? "SDBP project"}</span>
            <h3>{project.title}</h3>
            <p>{project.summary}</p>
            <div className="project-meta">
              <span><strong>{personName(project.ownerId)}</strong><small>owner</small></span>
              <span><strong>{formatShortDate(project.nextPrompt)}</strong><small>next prompt</small></span>
            </div>
          </article>
        ))}</div>
      </section>

      <aside className="action-rail">
        <div className="section-head"><div><span className="section-kicker">Concrete next steps</span><h2>Actions</h2></div><button className="quiet small">+ Add</button></div>
        <div className="action-stack">{actions.map((action) => (
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

function TensionsView() {
  const [draft, setDraft] = useState("");
  return (
    <>
      <div className="tension-composer">
        <div className="composer-copy">
          <span className="section-kicker">Capture first</span>
          <h2>What is pulling your attention?</h2>
          <p>You do not need to know the solution yet. Name what is happening.</p>
        </div>
        <div className="composer-input">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Membership list still not received…" />
          <button className="primary" disabled={!draft.trim()} onClick={() => setDraft("")}>Raise tension</button>
        </div>
      </div>

      <section className="section">
        <div className="section-head"><div><span className="section-kicker">Open</span><h2>The agenda is the tensions</h2></div><span className="counter">{tensions.length}</span></div>
        <div className="tension-stream">{tensions.map((tension) => (
          <article className="tension-card" key={tension.id}>
            <div className="tension-line" aria-hidden="true" />
            <div className="tension-content">
              <div className="tension-meta"><span>Raised by {personName(tension.raiserId)}</span><span>General Assembly</span></div>
              <h3>{tension.title}</h3>
              <p>{tension.waitingFor ? `Waiting for ${personName(tension.waitingFor)}.` : "Ready to process."}</p>
            </div>
            <button className="secondary">What do you need? <span aria-hidden="true">→</span></button>
          </article>
        ))}</div>
      </section>
    </>
  );
}

function OrganisationView() {
  return (
    <>
      <div className="org-intro">
        <div><span className="section-kicker">One SDBP circle for now</span><h2>Roles make the work visible</h2><p>Formal board positions remain separate from the operating roles people currently fill.</p></div>
        <div className="org-ring" aria-hidden="true"><span>SDBP</span></div>
      </div>
      <div className="people-grid">{people.map((person) => (
        <article className="person-card" key={person.id}>
          <div className="person-top"><div className="person-avatar">{person.name.charAt(0)}</div>{person.legalPosition && <span className="legal-chip">{person.legalPosition}</span>}</div>
          <h3>{person.name}</h3>
          <small>{person.legalPosition ? "Formal position + operating roles" : "Board member"}</small>
          <div className="role-list">{person.roles.length ? person.roles.map((role) => <span key={role}>{role}</span>) : <em>No operating role captured yet</em>}</div>
        </article>
      ))}</div>
    </>
  );
}

function GovernanceView() {
  return (
    <div className="governance-layout">
      <section className="governance-stage">
        <span className="section-kicker">Structural change</span>
        <h2>Use governance when the pattern needs fixing</h2>
        <p>Not every tension belongs here. Governance changes an ongoing responsibility, authority, role or standing rule.</p>
        <div className="process-path" aria-label="Governance process">
          {['Tension','Proposal','Clarify','React','Object','Integrate','Decide'].map((step, index) => <span key={step} className={index === 0 ? "active" : ""}>{step}</span>)}
        </div>
        <div className="calm-empty compact-empty"><span>○</span><h3>No proposal needs processing</h3><p>The structure is quiet right now.</p></div>
      </section>
      <aside className="governance-note">
        <span className="kind">A useful distinction</span>
        <h3>Solve this instance</h3>
        <p>Create an action or update a project.</p>
        <div className="note-divider" />
        <h3>Fix the underlying responsibility</h3>
        <p>Raise a governance tension.</p>
      </aside>
    </div>
  );
}

function RecordsView() {
  const records = [
    { label: "Legal backbone", title: "SDBP Statutes", text: "Search the authoritative document by article or keyword.", action: "Search statutes", mark: "§" },
    { label: "What happened", title: "Board minutes", text: "Meeting records and the decisions or commitments that followed.", action: "Open minutes", mark: "M" },
    { label: "How we work", title: "Governance agreements", text: "Standing agreements, current versions and what they superseded.", action: "Open agreements", mark: "G" },
  ];
  return (
    <div className="records-grid">{records.map((record, index) => (
      <article className={`record-card record-${index + 1}`} key={record.title}>
        <div className="record-mark">{record.mark}</div>
        <span className="kind">{record.label}</span>
        <h2>{record.title}</h2>
        <p>{record.text}</p>
        <button className="secondary">{record.action} <span aria-hidden="true">→</span></button>
      </article>
    ))}</div>
  );
}

function PulseView({ attention }: { attention: AttentionItem[] }) {
  const metrics = useMemo(() => ({
    overdue: actions.filter((a) => a.status !== "done" && a.due && a.due < "2026-08-11").length,
    stale: attention.filter((a) => (a.staleDays ?? 0) >= 7 && a.status !== "done").length,
    tensions: tensions.filter((t) => t.status !== "resolved").length,
  }), [attention]);

  return (
    <>
      <div className="pulse-layout">
        <article className="pulse-hero">
          <span className="section-kicker">Clarity signal</span>
          <div className="pulse-number">1</div>
          <h2>place needs attention</h2>
          <p>Membership administration is the only visible point where the weekly rhythm is currently slipping.</p>
          <div className="signal-line"><span /></div>
        </article>
        <div className="pulse-metrics">
          <Metric label="Open tensions" value={metrics.tensions} note="needs movement" />
          <Metric label="Stale items" value={metrics.stale} note="7+ days" />
          <Metric label="Overdue actions" value={metrics.overdue} note="past due date" />
        </div>
      </div>

      <section className="section">
        <div className="section-head"><div><span className="section-kicker">Exception only</span><h2>Where clarity is slipping</h2></div></div>
        <article className="exception-card">
          <div className="exception-marker"><span /></div>
          <div><h3>Membership administration has not been updated</h3><p>The weekly prompt is still unanswered and Luka has an open tension linked to the General Assembly.</p></div>
          <span className="badge-warn">needs attention</span>
        </article>
      </section>
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
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
