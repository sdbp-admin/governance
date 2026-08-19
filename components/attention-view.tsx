"use client";

import type { AttentionItem } from "@/lib/domain";
import type { CommunicationAttentionSignal } from "@/lib/supabase/board-feed";
import { todayISO, type WorkspaceData } from "@/lib/supabase/workspace";

export type AttentionSourceKind = "project" | "tension";
export type NavigableAttentionItem = AttentionItem & {
  sourceKind?: AttentionSourceKind;
  sourceId?: string;
};

export function deriveAttention(
  workspace: WorkspaceData,
  userId: string,
  personName: (id: string) => string,
  urgentTensionIds: ReadonlySet<string> = new Set(),
  communicationSignals: CommunicationAttentionSignal[] = [],
): NavigableAttentionItem[] {
  const today = todayISO();
  const items: NavigableAttentionItem[] = [];
  for (const project of workspace.projects) {
    if (project.status !== "active" || project.ownerId !== userId || project.nextPrompt > today) continue;
    items.push({ id: `project-${project.id}`, ownerId: userId, kind: "project_update", targetId: project.id, sourceKind: "project", sourceId: project.id, title: project.title, reason: `Project update is due. Last checked ${formatDate(project.lastUpdate)}.`, primaryAction: "Update project", status: "needs_action" });
  }
  for (const action of workspace.actions) {
    if (action.ownerId !== userId || (action.status !== "proposed" && action.status !== "open")) continue;
    const project = action.projectId ? workspace.projects.find((candidate) => candidate.id === action.projectId) : undefined;
    const sourceKind: AttentionSourceKind | undefined = action.sourceTensionId ? "tension" : action.projectId ? "project" : undefined;
    const sourceId = action.sourceTensionId ?? action.projectId;
    items.push({ id: `action-${action.id}`, ownerId: userId, kind: "action", targetId: action.id, sourceKind, sourceId, title: action.title, reason: `${project ? `Project: ${project.title}. ` : ""}${action.status === "proposed" ? `${action.source ? `From ${action.source}. ` : ""}Accept it if this is your commitment.` : `${action.source ? `From ${action.source}. ` : ""}This is an open commitment.`}`, primaryAction: action.status === "proposed" ? "Accept action" : "Mark done", status: "needs_action", due: action.due });
  }
  for (const signal of workspace.attentionSignals ?? []) {
    if (signal.recipientId !== userId) continue;
    if (signal.signalType === "tension_need" && signal.tensionId) {
      const tension = workspace.tensions.find((candidate) => candidate.id === signal.tensionId);
      if (!tension || tension.status === "resolved" || tension.status === "governance" || tension.status === "awaiting_confirmation") continue;
      const creator = personName(signal.createdBy ?? tension.raiserId);
      const request = tension.status === "needs_sync" ? "a real conversation" : "input or help";
      const detail = compactNeedDetail(signal.message);
      items.push({ id: `signal-${signal.id}`, ownerId: userId, kind: "tension", targetId: tension.id, sourceKind: "tension", sourceId: tension.id, signalId: signal.id, title: tension.title, reason: `${creator} needs ${request} from you.${detail ? ` ${detail}` : ""}`, primaryAction: "Open tension", status: "needs_action" });
    }
    if (signal.signalType === "project_comment" && signal.projectId) {
      const project = workspace.projects.find((candidate) => candidate.id === signal.projectId);
      if (project) items.push({ id: `signal-${signal.id}`, ownerId: userId, kind: "comment", targetId: project.id, sourceKind: "project", sourceId: project.id, signalId: signal.id, title: project.title, reason: signal.message, primaryAction: "Open comments", status: "needs_action" });
    }
  }
  for (const signal of communicationSignals) {
    if (signal.recipientId !== userId) continue;
    if (signal.signalType === "tension_comment" && signal.tensionId) {
      const tension = workspace.tensions.find((candidate) => candidate.id === signal.tensionId);
      if (tension) items.push({ id: `comm-${signal.id}`, ownerId: userId, kind: "tension_comment", targetId: tension.id, sourceKind: "tension", sourceId: tension.id, signalId: signal.id, title: tension.title, reason: signal.message, primaryAction: "Open comments", status: "needs_action" });
    }
    if (signal.signalType === "board_feed_mention" && signal.boardPostId) {
      items.push({ id: `comm-${signal.id}`, ownerId: userId, kind: "feed", targetId: signal.boardPostId, signalId: signal.id, title: "Board Feed mention", reason: signal.message, primaryAction: "Open Board Feed", status: "needs_action" });
    }
  }
  for (const tension of workspace.tensions) {
    if (tension.raiserId !== userId) continue;
    if (tension.status === "awaiting_confirmation") items.push({ id: `tension-${tension.id}`, ownerId: userId, kind: "tension", targetId: tension.id, sourceKind: "tension", sourceId: tension.id, title: tension.title, reason: `${personName(tension.resolutionProposedBy ?? "")} believes this is resolved. Check the real situation.`, primaryAction: "Review tension", status: "needs_action" });
    if (tension.status === "open") items.push({ id: `tension-${tension.id}`, ownerId: userId, kind: "tension", targetId: tension.id, sourceKind: "tension", sourceId: tension.id, title: tension.title, reason: tension.latestNote ? "This tension is still open. Did you get what you needed?" : "You raised this tension and it is still open.", primaryAction: tension.latestNote ? "Review tension" : "Process tension", status: "needs_action" });
    if (tension.status === "needs_sync") items.push({ id: `tension-${tension.id}`, ownerId: userId, kind: "tension", targetId: tension.id, sourceKind: "tension", sourceId: tension.id, title: tension.title, reason: tension.poll?.chosenOptionId ? "A time has been chosen. The conversation still needs to happen." : tension.poll ? "The conversation still needs scheduling or completion." : "You marked this for a real conversation. Did you get what you needed?", primaryAction: "Review tension", status: "needs_action" });
    if (tension.status === "governance" && !workspace.governanceProposals.some((proposal) => proposal.tensionId === tension.id)) items.push({ id: `governance-${tension.id}`, ownerId: userId, kind: "governance", targetId: tension.id, title: tension.title, reason: "This structural tension needs a proposal before it can be processed in Governance.", primaryAction: "Prepare proposal", status: "needs_action" });
  }
  return items.sort((a, b) => objectiveAttentionOrder(a, b, urgentTensionIds));
}

export function AttentionView({ items, urgentTensionIds, onPrimary, onOpenSource, onRaiseTension }: {
  items: NavigableAttentionItem[];
  urgentTensionIds: ReadonlySet<string>;
  onPrimary: (item: AttentionItem) => void;
  onOpenSource: (item: NavigableAttentionItem) => void;
  onRaiseTension: () => void;
}) {
  if (!items.length) return <div className="calm-empty"><span>✓</span><h2>Clear for now</h2><p>Nothing is waiting for you.</p><button className="text-action" onClick={onRaiseTension}>+ Raise a tension</button></div>;
  return <>
    <div className="attention-compact-head"><div><span className="section-kicker">Needs you now</span><h2>{items.length} open {items.length === 1 ? "interaction" : "interactions"}</h2></div><p>Overdue deadlines and tensions explicitly marked urgent are surfaced first. The Workspace does not decide importance itself.</p></div>
    <div className="attention-grid compact-attention-grid">{items.map((item) => {
      const urgent = (item.kind === "tension" || item.kind === "tension_comment") && Boolean(item.targetId && urgentTensionIds.has(item.targetId));
      return <article
        className={`attention-card compact-attention-card${urgent ? " attention-urgent" : ""}`}
        key={item.id}
        role="link"
        tabIndex={0}
        onClick={() => onOpenSource(item)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpenSource(item);
          }
        }}
        style={{ cursor: "pointer" }}
      >
        <div className={`type-dot type-${item.kind}`} />
        <div className="attention-copy">
          <span className="kind">{urgent ? "URGENT · " : ""}{humanKind(item.kind)}{item.due ? ` · due ${formatDate(item.due)}` : ""}</span>
          <h3>{compactText(item.title, 170)}</h3>
          <p>{compactText(item.reason, 220)}</p>
        </div>
        <div className="actions compact-actions">
          <button className="secondary small" type="button" onClick={(event) => { event.stopPropagation(); onOpenSource(item); }}>Open source →</button>
          <button className="primary small" type="button" onClick={(event) => { event.stopPropagation(); onPrimary(item); }}>{item.primaryAction}</button>
        </div>
      </article>;
    })}</div>
    <button className="text-action attention-raise" onClick={onRaiseTension}>+ Raise a tension</button>
  </>;
}

function objectiveAttentionOrder(a: AttentionItem, b: AttentionItem, urgentTensionIds: ReadonlySet<string>) {
  const today = todayISO();
  const aOverdue = Boolean(a.kind === "action" && a.due && a.due < today);
  const bOverdue = Boolean(b.kind === "action" && b.due && b.due < today);
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
  const aUrgent = Boolean((a.kind === "tension" || a.kind === "tension_comment") && a.targetId && urgentTensionIds.has(a.targetId));
  const bUrgent = Boolean((b.kind === "tension" || b.kind === "tension_comment") && b.targetId && urgentTensionIds.has(b.targetId));
  if (aUrgent !== bUrgent) return aUrgent ? -1 : 1;
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due !== b.due) return a.due ? -1 : 1;
  return 0;
}
function compactNeedDetail(message: string) { const marker = " — "; const index = message.indexOf(marker); return index >= 0 ? compactText(message.slice(index + marker.length), 150) : ""; }
function compactText(value: string, max: number) { const clean = value.replace(/\s+/g, " ").trim(); return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`; }
function humanKind(value: string) { if (value === "feed") return "Board Feed"; if (value === "tension_comment") return "tension comment"; return value.replace("_", " "); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`)); }
