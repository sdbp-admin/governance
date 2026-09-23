"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Tension, TensionRequest, TensionPoll } from "@/lib/domain";
import { loadBoardFeed, loadCommunicationAttentionSignals } from "@/lib/supabase/board-feed";
import { loadMeetingPolls, voteMeetingPoll, type MeetingPoll } from "@/lib/supabase/meeting-planning";
import { markTensionRequestResponded, loadTensionRequests } from "@/lib/supabase/tension-requests";
import { loadOperationalAttentionSnoozes, snoozeOperationalAttention } from "@/lib/supabase/operational-attention";
import { acknowledgeAttentionSignal, loadWorkspace, setActionStatus, updateTension, voteTensionPoll, type WorkspaceData } from "@/lib/supabase/workspace";
import { supabase } from "@/lib/supabase/client";
import { loadGovernanceResponseAttention, loadSpatialMentions, spatialAttention, type PersonalAttention } from "@/components/spatial/spatial-attention";
import styles from "./board.module.css";

type AttentionItem = {
  id: string;
  group: "response" | "communication";
  kind: "request" | "commitment" | "confirmation" | "tension_poll" | "meeting_poll" | "consent" | "mention" | "legacy_need";
  title: string;
  context: string;
  initiatedBy?: string;
  signalId?: string;
  boardPostId?: string;
  projectId?: string;
  tensionId?: string;
  actionId?: string;
  requestId?: string;
  proposalId?: string;
  pollId?: string;
  label: string;
  attentionKind?: string;
  sourceId?: string;
};

type AttentionModel = {
  items: AttentionItem[];
  workspace: WorkspaceData;
  requests: TensionRequest[];
  meetingPolls: MeetingPoll[];
};

export function BoardAttention({ userId, active, onCount, onOpenChat }: {
  userId: string;
  active: boolean;
  onCount: (count: number) => void;
  onOpenChat: (postId: string) => void;
}) {
  const [model, setModel] = useState<AttentionModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    setError("");
    const workspace = await loadWorkspace();
    const [requests, mentions, communication, feed, governance, meetingResult, signalActors, snoozes] = await Promise.all([
      loadTensionRequests(),
      loadSpatialMentions(workspace, userId),
      loadCommunicationAttentionSignals(),
      loadBoardFeed(),
      loadGovernanceResponseAttention(workspace, userId),
      loadMeetingPolls(),
      supabase.from("attention_signals").select("id,created_by").eq("recipient_id", userId).is("acknowledged_at", null),
      loadOperationalAttentionSnoozes(),
    ]);
    if (signalActors.error) throw signalActors.error;
    const actorBySignal = new Map((signalActors.data ?? []).map(row => [row.id as string, (row.created_by as string | null) ?? undefined]));
    const name = (id?: string) => workspace.people.find(person => person.id === id)?.name;
    const projectName = (id?: string) => workspace.projects.find(project => project.id === id)?.title;
    const tension = (id?: string) => workspace.tensions.find(item => item.id === id);
    const action = (id?: string) => workspace.actions.find(item => item.id === id);
    const personal = spatialAttention(workspace, requests, userId, mentions).filter(item =>
      item.kind === "request" ||
      (item.kind === "commitment" && workspace.actions.find(candidate => candidate.id === item.actionId)?.status === "proposed") ||
      item.kind === "confirmation" || item.kind === "mention" ||
      (item.kind === "need" && (Boolean(item.signalId) || item.label.startsWith("Your availability")))
    );
    const items: AttentionItem[] = personal.map(item => toAttentionItem(item, workspace, requests, actorBySignal));

    for (const signal of communication.filter(item => item.recipientId === userId && item.signalType === "board_feed_mention" && item.boardPostId)) {
      const post = feed.find(item => item.id === signal.boardPostId);
      items.push({
        id: `board-${signal.id}`, group: "communication", kind: "mention", signalId: signal.id,
        boardPostId: signal.boardPostId, title: "Board conversation", context: "Chat",
        initiatedBy: name(signal.createdBy ?? post?.authorId), label: post?.body ?? signal.message,
      });
    }
    for (const item of governance) {
      const proposalId = item.id.replace(/^consent-/, "");
      const proposal = workspace.governanceProposals.find(candidate => candidate.id === proposalId);
      items.push({
        id: item.id, group: "response", kind: "consent", proposalId,
        attentionKind: "governance_consent", sourceId: proposalId,
        tensionId: proposal?.tensionId, projectId: item.projectId, title: proposal?.title ?? "Governance proposal",
        context: "Governance · Quick Consent", initiatedBy: name(proposal?.proposerId), label: "Your response is needed.",
      });
    }
    for (const poll of meetingResult.polls.filter(item => item.meetingType === "governance" && !item.chosenOptionId && item.participantIds.includes(userId) && !item.options.some(option => option.votes.some(vote => vote.personId === userId)))) {
      items.push({
        id: `meeting-${poll.id}`, group: "response", kind: "meeting_poll", pollId: poll.id,
        attentionKind: "governance_meeting_availability", sourceId: poll.id,
        title: poll.title, context: "Governance meeting availability", initiatedBy: name(poll.createdBy), label: "Choose the times when you are available.",
      });
    }
    const now = Date.now();
    const activeSnoozes = new Set(snoozes
      .filter(item => new Date(item.snoozedUntil).getTime() > now)
      .map(item => `${item.attentionKind}:${item.sourceId}`));
    const visibleItems = items.filter(item => item.group === "communication" || !item.attentionKind || !item.sourceId || !activeSnoozes.has(`${item.attentionKind}:${item.sourceId}`));
    visibleItems.sort((a, b) => groupOrder(a.group) - groupOrder(b.group) || a.title.localeCompare(b.title));
    setModel({ items: visibleItems, workspace, requests, meetingPolls: meetingResult.polls });
    onCount(visibleItems.length);
  }, [onCount, userId]);

  useEffect(() => {
    let alive = true;
    void load().catch(reason => { if (alive) setError(readError(reason)); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [load]);

  useEffect(() => {
    if (!active) return;
    const refresh = () => void load().catch(reason => setError(readError(reason)));
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [active, load]);

  const groups = useMemo(() => model ? [
    { key: "response" as const, title: "Needs your response", items: model.items.filter(item => item.group === "response") },
    { key: "communication" as const, title: "Messages for you", items: model.items.filter(item => item.group === "communication") },
  ].filter(group => group.items.length) : [], [model]);

  async function run(id: string, action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(id); setError("");
    try { await action(); await load(); }
    catch (reason) { setError(readError(reason)); }
    finally { setBusy(null); }
  }

  async function snooze(item: AttentionItem) {
    if (busy || !model || !item.attentionKind || !item.sourceId) return;
    setBusy(item.id); setError("");
    try {
      await snoozeOperationalAttention(item.attentionKind, item.sourceId);
      setModel(current => current ? { ...current, items: current.items.filter(candidate => candidate.id !== item.id) } : current);
      onCount(Math.max(0, model.items.length - 1));
    } catch (reason) { setError(readError(reason)); }
    finally { setBusy(null); }
  }

  if (loading) return <section className={styles.attentionList}><p className={styles.empty} role="status">Finding what needs you…</p></section>;
  if (!model) return <section className={styles.attentionList}>{error && <p className={styles.error} role="alert">{error}</p>}</section>;

  return <section className={styles.attentionList} aria-label="For me">
    <div className={styles.attentionIntro}><h1>For me</h1><p>Explicit messages and work currently waiting for you.</p></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {!model.items.length && <div className={styles.clear}><strong>Nothing is waiting for you.</strong><span>Ordinary unread activity does not appear here.</span></div>}
    {groups.map(group => <section className={styles.attentionGroup} key={group.key}><h2>{group.title}</h2>
      {group.items.map(item => {
        const tension = model.workspace.tensions.find(candidate => candidate.id === item.tensionId);
        const action = model.workspace.actions.find(candidate => candidate.id === item.actionId);
        const request = model.requests.find(candidate => candidate.id === item.requestId);
        const tensionPoll = tension?.poll;
        const meetingPoll = model.meetingPolls.find(candidate => candidate.id === item.pollId);
        return <article className={styles.attentionItem} data-kind={item.group} key={item.id}>
          <div className={styles.attentionRow}>
            {item.boardPostId
              ? <button type="button" className={styles.attentionSummary} onClick={() => onOpenChat(item.boardPostId!)}><strong>{attentionSentence(item)}</strong><span>{item.context}</span></button>
              : <a className={styles.attentionSummary} href={workspaceLink(item)} target="_blank" rel="noopener noreferrer"><strong>{attentionSentence(item)}</strong><span>{item.context}</span></a>}
            <details className={styles.attentionDetails}><summary aria-label={`More options for ${item.title}`}>•••</summary><div>
              {item.label && <p>{item.label}</p>}
              {item.kind === "tension_poll" && tensionPoll && <AvailabilityChoices poll={tensionPoll} value={choices[item.id] ?? []} onChange={value => setChoices(current => ({ ...current, [item.id]: value }))} />}
              {item.kind === "meeting_poll" && meetingPoll && <MeetingChoices poll={meetingPoll} value={choices[item.id] ?? []} onChange={value => setChoices(current => ({ ...current, [item.id]: value }))} />}
              <div className={styles.attentionActions}>
              {item.boardPostId && <button type="button" onClick={() => onOpenChat(item.boardPostId!)}>Open in Chat</button>}
              {item.kind === "request" && request && <button className={styles.primary} type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => markTensionRequestResponded(request.id))}>I’ve responded</button>}
              {item.kind === "commitment" && action?.status === "proposed" && <button className={styles.primary} type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => setActionStatus(action.id, "open"))}>Accept</button>}
              {item.kind === "confirmation" && tension && <><button type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => declineResolution(tension))}>No, keep open</button><button className={styles.primary} type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => confirmResolution(tension))}>Yes, resolved</button></>}
              {item.kind === "tension_poll" && tensionPoll && <button className={styles.primary} type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => voteTensionPoll(tensionPoll.id, choices[item.id] ?? []))}>Save availability</button>}
              {item.kind === "meeting_poll" && meetingPoll && <button className={styles.primary} type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => voteMeetingPoll(meetingPoll.id, choices[item.id] ?? []))}>Save availability</button>}
              {item.kind === "consent" && item.proposalId && <button className={styles.primary} type="button" disabled={busy === item.id} onClick={() => void run(item.id, () => respondConsent(item.proposalId!))}>No objection</button>}
              {!item.boardPostId && <a href={workspaceLink(item)} target="_blank" rel="noopener noreferrer">Open Workspace on desktop</a>}
              </div>
            </div></details>
            <button
              type="button"
              className={styles.attentionCheck}
              aria-label={item.group === "communication" ? `Acknowledge ${item.title}` : `Seen for now: ${item.title}`}
              disabled={busy === item.id}
              onClick={() => item.group === "communication" && item.signalId
                ? void run(item.id, () => acknowledgeAttentionSignal(item.signalId!))
                : void snooze(item)}
            >✓</button>
          </div>
        </article>;
      })}
    </section>)}
  </section>;
}

function toAttentionItem(item: PersonalAttention, workspace: WorkspaceData, requests: TensionRequest[], actorBySignal: Map<string, string | undefined>): AttentionItem {
  const name = (id?: string) => workspace.people.find(person => person.id === id)?.name;
  const project = workspace.projects.find(candidate => candidate.id === item.projectId);
  const tension = workspace.tensions.find(candidate => candidate.id === item.tensionId);
  const action = workspace.actions.find(candidate => candidate.id === item.actionId);
  const request = requests.find(candidate => candidate.id === item.requestId);
  if (item.kind === "request") return { ...base(item), group: "response", kind: "request", attentionKind: "tension_request", sourceId: request?.id ?? item.requestId, title: tension?.title ?? "Tension request", context: `${project ? `${project.title} · ` : ""}Request for ${request?.kind === "conversation" ? "conversation" : "input"}`, initiatedBy: name(request?.requesterId), label: request?.detail || item.label };
  if (item.kind === "commitment") return { ...base(item), group: "response", kind: "commitment", attentionKind: "proposed_commitment", sourceId: action?.id ?? item.actionId, title: action?.title ?? "Commitment", context: `${project?.title ?? tension?.title ?? "Workspace"} · Proposed commitment`, label: item.label };
  if (item.kind === "confirmation") return { ...base(item), group: "response", kind: "confirmation", attentionKind: "resolution_confirmation", sourceId: tension?.id ?? item.tensionId, title: tension?.title ?? "Resolution check", context: `${project ? `${project.title} · ` : ""}Resolution check`, initiatedBy: name(tension?.resolutionProposedBy), label: item.label };
  if (item.kind === "mention") return { ...base(item), group: "communication", kind: "mention", title: action?.title ?? tension?.title ?? project?.title ?? "Conversation mention", context: `${action ? "Commitment" : tension ? "Tension" : "Project"} conversation`, initiatedBy: name(item.signalId ? actorBySignal.get(item.signalId) : undefined), label: item.label };
  if (item.label.startsWith("Your availability")) return { ...base(item), group: "response", kind: "tension_poll", attentionKind: "tension_availability", sourceId: tension?.poll?.id ?? item.tensionId, title: tension?.title ?? "Conversation availability", context: `${project ? `${project.title} · ` : ""}Availability poll`, label: item.label };
  return { ...base(item), group: "response", kind: "legacy_need", attentionKind: "legacy_tension_need", sourceId: item.signalId, title: tension?.title ?? "Tension", context: `${project ? `${project.title} · ` : ""}Input requested`, initiatedBy: name(item.signalId ? actorBySignal.get(item.signalId) : undefined), label: item.label };
}

function base(item: PersonalAttention) {
  return { id: item.id, signalId: item.signalId, projectId: item.projectId, tensionId: item.tensionId, actionId: item.actionId, requestId: item.requestId };
}
function groupOrder(group: AttentionItem["group"]) { return group === "response" ? 0 : 1; }
function attentionSentence(item: AttentionItem) {
  const actor = item.initiatedBy ?? "Someone";
  if (item.kind === "request") return `${actor} asked for your ${item.context.toLowerCase().includes("conversation") ? "conversation" : "input"} on ${item.title}`;
  if (item.kind === "commitment") return `${item.title} is waiting for your acceptance`;
  if (item.kind === "confirmation") return `${actor} asked you to confirm whether ${item.title} is resolved`;
  if (item.kind === "tension_poll" || item.kind === "meeting_poll") return `${actor} asked for your availability for ${item.title}`;
  if (item.kind === "consent") return `${actor} needs your response to ${item.title}`;
  if (item.kind === "legacy_need") return `${actor} asked for your input on ${item.title}`;
  return `${actor} mentioned you in ${item.title}`;
}
function workspaceLink(item: AttentionItem) {
  const params = new URLSearchParams();
  if (item.projectId) params.set("project", item.projectId);
  if (item.tensionId) params.set("tension", item.tensionId);
  return `/governance/spatial/${params.size ? `?${params}` : ""}`;
}
function AvailabilityChoices({ poll, value, onChange }: { poll: TensionPoll; value: string[]; onChange: (value: string[]) => void }) {
  return <fieldset className={styles.pollChoices}><legend>When can you join?</legend>{poll.options.map(option => <label key={option.id}><input type="checkbox" checked={value.includes(option.id)} onChange={event => onChange(event.target.checked ? [...value, option.id] : value.filter(id => id !== option.id))} />{formatTime(option.startsAt)}</label>)}</fieldset>;
}
function MeetingChoices({ poll, value, onChange }: { poll: MeetingPoll; value: string[]; onChange: (value: string[]) => void }) {
  return <fieldset className={styles.pollChoices}><legend>When can you join?</legend>{poll.options.map(option => <label key={option.id}><input type="checkbox" checked={value.includes(option.id)} onChange={event => onChange(event.target.checked ? [...value, option.id] : value.filter(id => id !== option.id))} />{formatTime(option.startsAt)}</label>)}</fieldset>;
}
function formatTime(value: string) { return new Date(value).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
async function respondConsent(proposalId: string) {
  const result = await supabase.rpc("respond_governance_quick_consent", { target_proposal_id: proposalId, consent_response: "no_objection", objection_reason: null });
  if (result.error) throw result.error;
}
function confirmResolution(tension: Tension) { return updateTension(tension.id, { status: "resolved", resolutionProposedBy: null, latestNote: tension.latestNote ?? null }); }
function declineResolution(tension: Tension) { return updateTension(tension.id, { status: "open", resolutionProposedBy: null, latestNote: tension.latestNote ?? null }); }
function readError(error: unknown) { return error && typeof error === "object" && "message" in error ? String(error.message) : "Could not load your attention."; }
