"use client";

import { useMemo, useState } from "react";
import { actions, myAttention, people, projects, roleDefinitions, tensions } from "@/lib/mock-data";
import type { AttentionItem, RoleDefinition } from "@/lib/domain";

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
  tensions: "Open tensions",
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
          <span className="section-kicker">Raise a tension</span>
          <h2>What tension do you want to raise?</h2>
          <p>A tension can point to a problem, an opportunity, missing clarity, or something blocking the work. You do not need to know the solution yet.</p>
        </div>
        <div className="composer-input">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} placeholder="Membership list still not received…" />
          <button className="primary" disabled={!draft.trim()} onClick={() => setDraft("")}>Raise tension</button>
        </div>
      </div>

      <section className="section">
        <div className="section-head"><div><span className="section-kicker">Open</span><h2>Tensions waiting to be processed</h2></div><span className="counter">{tensions.length}</span></div>
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
  const [roles, setRoles] = useState<RoleDefinition[]>(roleDefinitions);
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
        <p className="editor-note">Prototype only: these edits are kept in this browser session and reset when the page is refreshed.</p>

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
            <label className="field"><span>Responsibilities</span><textarea rows={5} value={responsibilities} onChange={(event) => setResponsibilities(event.target.value)} placeholder={'One responsibility per line'} /></label>
            <label className="field"><span>Accountabilities</span><textarea rows={5} value={accountabilities} onChange={(event) => setAccountabilities(event.target.value)} placeholder={'One ongoing accountability per line'} /></label>
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
