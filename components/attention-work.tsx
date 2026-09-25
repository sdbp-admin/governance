"use client";

import { FormEvent, useState } from "react";
import type { Action, AttentionItem, Project, Tension } from "@/lib/domain";
import { formatShortDate, humanKind, personInitial, personName } from "@/lib/prototype-utils";

export type View = "attention" | "work" | "tensions" | "organisation" | "governance" | "records" | "pulse";

export const labels: Record<View, string> = {
  attention: "My Attention",
  work: "Work",
  tensions: "Tensions",
  organisation: "Organisation",
  governance: "Governance",
  records: "Records",
  pulse: "SDBP Pulse",
};

export const navMeta: Record<View, string> = {
  attention: "Today",
  work: "Projects & actions",
  tensions: "Open tensions",
  organisation: "People & roles",
  governance: "Change the structure",
  records: "Organisational memory",
  pulse: "Process health",
};

export function Header({ view, attentionCount, currentUserId }: { view: View; attentionCount: number; currentUserId: string }) {
  const descriptions: Record<View, string> = {
    attention: attentionCount ? `${attentionCount} things need ${personName(currentUserId)}'s attention. Start with the one that creates the most movement.` : `Nothing needs ${personName(currentUserId)} right now.`,
    work: "Keep commitments visible. Links to tensions provide context; they do not create workflow dependencies.",
    tensions: "A tension is a gap between current reality and a potential future you sense. Raise one whenever something could be better.",
    organisation: "See who fills each SDBP role, what that role covers, and where its authority comes from.",
    governance: "Governance changes SDBP's ongoing roles, accountabilities, domains and policies. Prepare here; run the process in a real meeting.",
    records: "The legal and organisational memory you can return to when context matters.",
    pulse: "A quiet overview of where SDBP is losing momentum or clarity — not an approval queue.",
  };
  return <header className="page-head"><div><div className="eyebrow">SDBP · working space</div><h1>{labels[view]}</h1><p>{descriptions[view]}</p></div><div className="brand-signal" aria-label="SDBP visual signature"><span /><span /><span /></div></header>;
}

export function AttentionView({ items, deferred, onPrimary, onNoChange, deferItem, restoreItem, onRaiseTension }: {
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
  return <>
    {featured ? <div className="attention-layout"><article className="focus-card"><div className="focus-top"><span className="kind">Most important now · {humanKind(featured.kind)}</span>{featured.staleDays && featured.staleDays >= 7 ? <span className="badge-warn">{featured.staleDays} days since update</span> : null}</div><div className="focus-body"><div><h2>{featured.title}</h2><p>{featured.reason}</p></div><div className="focus-orb" aria-hidden="true"><span>{featured.staleDays ?? "→"}</span></div></div><div className="actions"><button className="primary" onClick={() => onPrimary(featured)}>{featured.primaryAction}</button>{featured.kind === "project_update" && <button className="secondary" onClick={() => onNoChange(featured)}>No change</button>}<button className="quiet" onClick={() => deferItem(featured.id)}>Remind me later</button></div></article><aside className="week-card"><div><span className="kind">This week</span><div className="week-number">{items.length}</div><p>open interactions</p></div><div className="week-divider" /><button className="text-action" onClick={onRaiseTension}>+ Raise a tension</button><small>The app will keep parked items in view and bring them back when due.</small></aside></div> : <div className="calm-empty"><span>✓</span><h2>Clear for now</h2><p>Nothing is waiting for you.</p></div>}
    {rest.length > 0 && <section className="section"><div className="section-head"><div><span className="section-kicker">Next</span><h2>Then move these forward</h2></div></div><div className="attention-grid">{rest.map((item) => <AttentionCard key={item.id} item={item} onPrimary={onPrimary} deferItem={deferItem} />)}</div></section>}
    {deferred.length > 0 && <section className="section parked-section"><div className="section-head"><div><span className="section-kicker">Parked intentionally</span><h2>Not forgotten</h2></div><span className="muted">Returns on its reminder date</span></div><div className="soft-list">{deferred.map((item) => <div className="soft-row" key={item.id}><div><strong>{item.title}</strong><small>Deferred, not ignored.</small></div><button className="quiet" onClick={() => restoreItem(item.id)}>Bring back now</button></div>)}</div></section>}
  </>;
}

function AttentionCard({ item, onPrimary, deferItem }: { item: AttentionItem; onPrimary: (item: AttentionItem) => void; deferItem: (id: string) => void }) {
  return <article className="attention-card"><div className={`type-dot type-${item.kind}`} aria-hidden="true" /><div className="attention-copy"><span className="kind">{humanKind(item.kind)}</span><h3>{item.title}</h3><p>{item.reason}</p></div><div className="actions compact-actions"><button className="primary small" onClick={() => onPrimary(item)}>{item.primaryAction}</button><button className="quiet small" onClick={() => deferItem(item.id)}>Later</button></div></article>;
}

export function ProjectUpdateEditor({ project, onSave, onNoChange, onRaiseTension, onClose }: { project: Project; onSave: (projectId: string, summary: string) => void; onNoChange: () => void; onRaiseTension: () => void; onClose: () => void }) {
  const [summary, setSummary] = useState(project.summary);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor" role="dialog" aria-modal="true" aria-labelledby="project-update-title"><div className="editor-head"><div><span className="section-kicker">Weekly project update</span><h2 id="project-update-title">{project.title}</h2></div><button className="quiet editor-close" onClick={onClose} aria-label="Close project update">×</button></div><p className="editor-note">Has anything meaningfully changed since the last update? Keep this short. The app needs the current reality, not a report.</p><label className="field"><span>Current project state</span><textarea rows={5} value={summary} onChange={(event) => setSummary(event.target.value)} /></label><div className="workflow-choice-row"><button className="secondary" onClick={onNoChange}>No change</button><button className="secondary" onClick={onRaiseTension}>Raise a tension instead</button><button className="primary" disabled={!summary.trim()} onClick={() => onSave(project.id, summary)}>Save update</button></div></section></div>;
}

export function WorkView({ projects, actions, tensions, currentUserId, onCompleteAction, onCompleteProject, onAddAction, persistedActionIds = [] }: {
  projects: Project[];
  actions: Action[];
  tensions: Tension[];
  currentUserId: string;
  onCompleteAction: (actionId: string) => void;
  onCompleteProject: (projectId: string) => void;
  onAddAction?: (title: string) => Promise<boolean>;
  persistedActionIds?: string[];
}) {
  const [showComposer, setShowComposer] = useState(false);
  const [newAction, setNewAction] = useState("");
  const [saving, setSaving] = useState(false);
  const openActions = actions.filter((action) => action.status !== "done" && action.status !== "cancelled");
  const persisted = new Set(persistedActionIds);

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newAction.trim();
    if (!title || !onAddAction) return;
    setSaving(true);
    const saved = await onAddAction(title);
    setSaving(false);
    if (saved) {
      setNewAction("");
      setShowComposer(false);
    }
  }

  return <div className="work-layout"><section className="work-main"><div className="section-head"><div><span className="section-kicker">Current outcomes</span><h2>Active projects</h2></div></div><div className="project-grid">{projects.filter((project) => project.status === "active").map((project, index) => {
    const sourceTension = tensions.find((tension) => tension.id === project.sourceTensionId);
    return <article className={`project-card ${index === 0 ? "project-featured" : ""}`} key={project.id}><div className="project-accent" aria-hidden="true" /><span className="kind">{project.role ?? "SDBP project"}</span><h3>{project.title}</h3><p>{project.summary}</p>{sourceTension && <small className="action-context">From tension: {sourceTension.title}</small>}<div className="project-meta"><span><strong>{personName(project.ownerId)}</strong><small>owner</small></span><span><strong>{formatShortDate(project.lastUpdate)}</strong><small>last updated</small></span><span><strong>{formatShortDate(project.nextPrompt)}</strong><small>next prompt</small></span></div>{project.sourceTensionId && project.ownerId === currentUserId && <div className="actions compact-actions"><button className="secondary small" onClick={() => onCompleteProject(project.id)}>Mark outcome achieved</button></div>}</article>;
  })}</div></section><aside className="action-rail"><div className="section-head"><div><span className="section-kicker">Concrete next steps</span><h2>Actions</h2></div>{onAddAction && <button className="text-action" onClick={() => setShowComposer((value) => !value)}>{showComposer ? "Cancel" : "+ Add action"}</button>}</div>{onAddAction && <p className="live-action-note">Your own standalone actions are now saved to the board database. My Attention is reconstructed from their status.</p>}{showComposer && onAddAction && <div className="live-action-create"><form onSubmit={submitAction}><input autoFocus value={newAction} onChange={(event) => setNewAction(event.target.value)} placeholder="Concrete next step" aria-label="New action title" /><div className="actions compact-actions"><button className="primary small" type="submit" disabled={saving || !newAction.trim()}>{saving ? "Saving…" : "Save action"}</button></div></form></div>}<div className="action-stack">{openActions.length ? openActions.map((action) => {
    const sourceTension = tensions.find((tension) => tension.id === action.sourceTensionId);
    return <article className="action-slip" key={action.id}><span className="action-status">{action.status}</span><h3>{action.title}</h3>{action.source && <p>{action.source}</p>}{sourceTension && <small className="action-context">From tension: {sourceTension.title}</small>}<div className="action-owner"><span className="mini-avatar">{personInitial(action.ownerId)}</span>{personName(action.ownerId)}</div>{persisted.has(action.id) && <span className="persisted-mark">Saved</span>}{action.status === "open" && action.ownerId === currentUserId && <button className="secondary small action-done" onClick={() => onCompleteAction(action.id)}>Mark done</button>}</article>;
  }) : <div className="calm-empty compact-empty"><span>✓</span><h3>No open actions</h3><p>Completed actions leave this list.</p></div>}</div></aside></div>;
}
