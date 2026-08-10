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
        <div className="brand">SDBP Governance<small>Structure · rhythm · memory</small></div>
        <nav className="nav" aria-label="Primary navigation">
          {(Object.keys(labels) as View[]).map((key) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>
              {labels[key]}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <Header view={view} />
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

function Header({ view }: { view: View }) {
  const descriptions: Record<View, string> = {
    attention: "Only what needs something from you now.",
    work: "Current projects and concrete next actions.",
    tensions: "Capture what needs attention before deciding the solution.",
    organisation: "Who currently does what, independent of formal titles.",
    governance: "Change responsibilities and standing rules when the structure needs to evolve.",
    records: "The authoritative organisational memory and searchable legal backbone.",
    pulse: "Where SDBP is losing momentum or clarity. This is not an approval queue.",
  };
  return (
    <div className="topline">
      <div><h1>{labels[view]}</h1><div className="muted">{descriptions[view]}</div></div>
      <span className="pill">Prototype · Edo view</span>
    </div>
  );
}

function AttentionView({ items, deferred, completeItem, deferItem, restoreItem }: {
  items: AttentionItem[];
  deferred: AttentionItem[];
  completeItem: (id: string) => void;
  deferItem: (id: string) => void;
  restoreItem: (id: string) => void;
}) {
  return (
    <>
      <div className="notice"><strong>Weekly rhythm:</strong> the app asks for the minimum necessary interaction. If you intentionally park something, it comes back. If you ignore it, it stays visible.</div>
      <div className="section-head"><h2>Needs your attention</h2><span className="muted">{items.length} open</span></div>
      {items.length === 0 ? <div className="empty">Nothing needs you right now.</div> : items.map((item) => (
        <div className="card" key={item.id}>
          <div className="card-head">
            <div><div className="kind">{item.kind.replace("_", " ")}</div><h2>{item.title}</h2></div>
            {item.staleDays && item.staleDays >= 7 ? <span className="badge-warn">stale · {item.staleDays} days</span> : null}
          </div>
          <p className="muted">{item.reason}</p>
          <div className="actions">
            <button className="primary" onClick={() => completeItem(item.id)}>{item.primaryAction}</button>
            {item.kind === "project_update" && <button className="secondary" onClick={() => completeItem(item.id)}>No change</button>}
            <button className="secondary" onClick={() => deferItem(item.id)}>Remind me later</button>
          </div>
        </div>
      ))}

      {deferred.length > 0 && <section className="section">
        <div className="section-head"><h2>Parked intentionally</h2><span className="muted">Comes back on its reminder date</span></div>
        <div className="list">{deferred.map((item) => (
          <div className="row" key={item.id}>
            <div><div className="row-title">{item.title}</div><div className="muted">Deferred, not ignored.</div></div>
            <button className="secondary" onClick={() => restoreItem(item.id)}>Bring back now</button>
          </div>
        ))}</div>
      </section>}
    </>
  );
}

function WorkView() {
  return (
    <>
      <section><div className="section-head"><h2>Active projects</h2><button className="primary">+ Project</button></div>
        <div className="list">{projects.map((project) => (
          <div className="row" key={project.id}>
            <div><div className="row-title">{project.title}</div><div className="muted">{project.summary}</div></div>
            <div className="muted">Owner: {personName(project.ownerId)}</div>
          </div>
        ))}</div>
      </section>
      <section className="section"><div className="section-head"><h2>Actions</h2><button className="secondary">+ Action</button></div>
        <div className="list">{actions.map((action) => (
          <div className="row" key={action.id}><div><div className="row-title">{action.title}</div><div className="muted">{action.source}</div></div><div className="muted">{personName(action.ownerId)} · {action.status}</div></div>
        ))}</div>
      </section>
    </>
  );
}

function TensionsView() {
  const [draft, setDraft] = useState("");
  return (
    <>
      <div className="card">
        <div className="kind">Capture first</div><h2>What is on your mind?</h2>
        <p className="muted">You do not need to know the solution yet.</p>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Membership list still not received…" style={{width:"100%", border:"1px solid var(--border)", borderRadius:10, padding:12}} />
        <div className="actions"><button className="primary" disabled={!draft.trim()} onClick={() => setDraft("")}>Raise tension</button></div>
      </div>
      <section className="section"><div className="section-head"><h2>Open tensions</h2><span className="muted">The agenda is the tensions</span></div>
        <div className="list">{tensions.map((tension) => (
          <div className="row" key={tension.id}><div><div className="row-title">{tension.title}</div><div className="muted">Raised by {personName(tension.raiserId)} · linked to General Assembly</div></div><button className="secondary">What do you need?</button></div>
        ))}</div>
      </section>
    </>
  );
}

function OrganisationView() {
  return <div className="list">{people.map((person) => <div className="row" key={person.id}><div><div className="row-title">{person.name}</div><div className="muted">{person.legalPosition ? `Legal position: ${person.legalPosition}` : "Board member"}</div></div><div>{person.roles.length ? person.roles.join(" · ") : <span className="muted">No operating role captured yet</span>}</div></div>)}</div>;
}

function GovernanceView() {
  return <><div className="notice">Use governance when the underlying responsibility or standing rule needs to change, not merely to solve one instance.</div><div className="empty">No governance proposal currently needs processing.</div></>;
}

function RecordsView() {
  return <div className="list">
    <div className="row"><div><div className="row-title">SDBP Statutes</div><div className="muted">Authoritative legal document · searchable by article and keyword</div></div><button className="secondary">Search statutes</button></div>
    <div className="row"><div><div className="row-title">Board minutes</div><div className="muted">Meeting records and resulting decisions</div></div><button className="secondary">Open</button></div>
    <div className="row"><div><div className="row-title">Governance agreements</div><div className="muted">Standing agreements and superseded versions</div></div><button className="secondary">Open</button></div>
  </div>;
}

function PulseView({ attention }: { attention: AttentionItem[] }) {
  const metrics = useMemo(() => ({
    overdue: actions.filter((a) => a.status !== "done" && a.due && a.due < "2026-08-11").length,
    stale: attention.filter((a) => (a.staleDays ?? 0) >= 7 && a.status !== "done").length,
    tensions: tensions.filter((t) => t.status !== "resolved").length,
  }), [attention]);
  return <>
    <div className="grid">
      <div className="card"><div className="muted">Open tensions</div><div className="metric">{metrics.tensions}</div></div>
      <div className="card"><div className="muted">Stale attention items</div><div className="metric">{metrics.stale}</div></div>
      <div className="card"><div className="muted">Overdue actions</div><div className="metric">{metrics.overdue}</div></div>
    </div>
    <section className="section"><div className="section-head"><h2>Where clarity is slipping</h2><span className="muted">Exceptions only</span></div>
      <div className="list"><div className="row"><div><div className="row-title">Membership administration has not been updated</div><div className="muted">The weekly prompt is still unanswered and Luka has an open tension linked to the General Assembly.</div></div><span className="badge-warn">needs attention</span></div></div>
    </section>
  </>;
}

function personName(id: string) {
  return people.find((person) => person.id === id)?.name ?? id;
}
