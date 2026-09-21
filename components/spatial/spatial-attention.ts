import type { TensionRequest } from "@/lib/domain";
import { deriveAttention } from "@/components/attention-view";
import { loadCommunicationAttentionSignals } from "@/lib/supabase/board-feed";
import { loadProjectComments } from "@/lib/supabase/project-comments";
import { loadTensionComments } from "@/lib/supabase/tension-comments";
import { loadActionComments, loadActionCommentAttentionSignals } from "@/lib/supabase/action-comments";
import { loadCommentThreadSummary } from "@/lib/supabase/comment-thread-state";
import type { WorkspaceData } from "@/lib/supabase/workspace";
import { supabase } from "@/lib/supabase/client";

export type PersonalAttention = { id: string; kind: "request" | "commitment" | "mention" | "need" | "confirmation" | "update" | "governance"; projectId?: string; tensionId?: string; actionId?: string; requestId?: string; signalId?: string; commentId?: string; label: string };
export type SpatialUnreadActivity = {
  kind: "project" | "tension" | "action";
  sourceId: string;
  projectId?: string;
  tensionId?: string;
  actionId?: string;
  unreadCount: number;
};

export async function loadSpatialUnreadActivity(workspace: WorkspaceData, userId: string, mentions: PersonalAttention[] = []): Promise<SpatialUnreadActivity[]> {
  const [projectParticipation, tensionParticipation, actionParticipation] = await Promise.all([
    supabase.from("project_comments").select("project_id").eq("author_id", userId),
    supabase.from("tension_comments").select("tension_id").eq("author_id", userId),
    supabase.from("action_comments").select("action_id").eq("author_id", userId),
  ]);
  const participationError = projectParticipation.error || tensionParticipation.error || actionParticipation.error;
  if (participationError) throw participationError;

  const projectIds = new Set<string>();
  const tensionIds = new Set<string>();
  const actionIds = new Set<string>();

  for (const project of workspace.projects) {
    if (project.status === "active" && (project.ownerId === userId || (project.participantIds ?? []).includes(userId))) projectIds.add(project.id);
  }
  for (const tension of workspace.tensions) {
    if (tension.status !== "resolved" && tension.raiserId === userId) tensionIds.add(tension.id);
  }
  for (const action of workspace.actions) {
    if ((action.status === "open" || action.status === "proposed") && action.ownerId === userId) actionIds.add(action.id);
  }

  for (const row of projectParticipation.data ?? []) projectIds.add(row.project_id as string);
  for (const row of tensionParticipation.data ?? []) tensionIds.add(row.tension_id as string);
  for (const row of actionParticipation.data ?? []) actionIds.add(row.action_id as string);
  for (const mention of mentions) {
    if (mention.actionId) actionIds.add(mention.actionId);
    else if (mention.tensionId) tensionIds.add(mention.tensionId);
    else if (mention.projectId) projectIds.add(mention.projectId);
  }

  const descriptors = [
    ...[...projectIds].map(sourceId => ({ kind: "project" as const, sourceId })),
    ...[...tensionIds].map(sourceId => ({ kind: "tension" as const, sourceId })),
    ...[...actionIds].map(sourceId => ({ kind: "action" as const, sourceId })),
  ];

  const summaries = await Promise.all(descriptors.map(async descriptor => ({
    ...descriptor,
    summary: await loadCommentThreadSummary(descriptor.kind, descriptor.sourceId),
  })));

  return summaries.flatMap(({ kind, sourceId, summary }) => {
    if (summary.unreadCount <= 0) return [];
    if (kind === "project") return [{ kind, sourceId, projectId: sourceId, unreadCount: summary.unreadCount }];
    if (kind === "tension") {
      const tension = workspace.tensions.find(item => item.id === sourceId);
      if (!tension) return [];
      return [{ kind, sourceId, tensionId: sourceId, projectId: tension.linkedProjectId, unreadCount: summary.unreadCount }];
    }
    const action = workspace.actions.find(item => item.id === sourceId);
    if (!action) return [];
    const sourceTension = action.sourceTensionId ? workspace.tensions.find(item => item.id === action.sourceTensionId) : undefined;
    return [{
      kind,
      sourceId,
      actionId: sourceId,
      tensionId: action.sourceTensionId,
      projectId: action.projectId ?? sourceTension?.linkedProjectId,
      unreadCount: summary.unreadCount,
    }];
  });
}

export async function loadSpatialMentions(workspace: WorkspaceData, userId: string): Promise<PersonalAttention[]> {
  const [communication, actionSignals] = await Promise.all([loadCommunicationAttentionSignals(), loadActionCommentAttentionSignals(userId)]);
  const projectSignals = (workspace.attentionSignals ?? []).filter(s => s.recipientId === userId && s.signalType === "project_comment" && s.projectId);
  const tensionSignals = communication.filter(s => s.recipientId === userId && s.signalType === "tension_comment" && s.tensionId);
  const candidates = [
    ...projectSignals.map(s => ({ signal: s, kind: "project" as const, id: s.projectId! })),
    ...tensionSignals.map(s => ({ signal: s, kind: "tension" as const, id: s.tensionId! })),
    ...actionSignals.map(s => ({ signal: s, kind: "action" as const, id: s.actionId })),
  ];
  const results = await Promise.all(candidates.map(async ({ signal, kind, id }) => {
    const [entries, summary] = await Promise.all([
      kind === "project" ? loadProjectComments(id) : kind === "tension" ? loadTensionComments(id) : loadActionComments(id),
      loadCommentThreadSummary(kind, id),
    ]);
    // The existing unacknowledged thread signal is the prompt. The comment's recorded
    // recipient IDs and the user's seen cursor distinguish an explicit mention from
    // ordinary unread conversation, without relying on notification wording.
    const seenAt = summary.lastSeenAt ? new Date(summary.lastSeenAt).getTime() : -Infinity;
    const mentions = entries.filter(c => c.mentionedIds.includes(userId) && c.authorId !== userId && new Date(c.createdAt).getTime() > seenAt);
    if (!mentions.length) return null;
    const target = mentions.at(-1)!;
    const action = kind === "action" ? workspace.actions.find(item => item.id === id) : undefined;
    return { id: `mention-${signal.id}`, kind: "mention" as const, signalId: signal.id, commentId: target.id, actionId: action?.id, tensionId: kind === "tension" ? id : undefined, projectId: kind === "project" ? id : kind === "tension" ? workspace.tensions.find(t => t.id === id)?.linkedProjectId : action?.projectId, label: "You were mentioned in this conversation" };
  }));
  return results.filter((item): item is NonNullable<typeof item> => item !== null);
}

export function spatialAttention(workspace: WorkspaceData, requests: TensionRequest[], userId: string, mentions: PersonalAttention[]): PersonalAttention[] {
  const keys = new Set(requests.map(r => `${r.tensionId}:${r.recipientId}`));
  const legacy = { ...workspace, attentionSignals: (workspace.attentionSignals ?? []).filter(s => s.signalType === "tension_need" && !keys.has(`${s.tensionId}:${s.recipientId}`)) };
  const result: PersonalAttention[] = [...mentions];
  for (const tension of workspace.tensions.filter(t => t.status === "awaiting_confirmation" && t.raiserId === userId)) {
    const proposer = workspace.people.find(person => person.id === tension.resolutionProposedBy)?.name ?? "Someone";
    result.push({ id: `confirmation-${tension.id}`, kind: "confirmation", projectId: tension.linkedProjectId, tensionId: tension.id, label: `${proposer} believes this is resolved. Check the real situation.` });
  }
  for (const item of deriveAttention(legacy, userId, id => workspace.people.find(p => p.id === id)?.name ?? "Unknown")) {
    if (item.kind === "action" || item.kind === "comment" || item.kind === "tension_comment" || item.kind === "feed") continue;
    const tension = item.targetId ? workspace.tensions.find(t => t.id === item.targetId) : undefined;
    if (tension?.status === "awaiting_confirmation" && tension.raiserId === userId) continue;
    // An open tension being tracked by its raiser is not, by itself, an owed response.
    if (item.kind === "tension" && !item.signalId && tension?.status !== "awaiting_confirmation" && tension?.latestNote) continue;
    result.push({ id: item.id, kind: item.kind === "project_update" ? "update" : item.kind === "governance" ? "governance" : tension?.status === "awaiting_confirmation" ? "confirmation" : "need", projectId: item.kind === "project_update" ? item.targetId : tension?.linkedProjectId, tensionId: tension?.id, signalId: item.signalId, label: item.reason });
  }
  // Keep real open responsibilities even when their project/tension has completed.
  for (const action of workspace.actions.filter(a => a.ownerId === userId && (a.status === "open" || a.status === "proposed"))) result.push({ id: `action-${action.id}`, kind: "commitment", actionId: action.id, projectId: action.projectId, tensionId: action.sourceTensionId, label: action.status === "proposed" ? "Awaiting your acceptance" : "Your open commitment" });
  for (const request of requests.filter(r => r.status === "open" && r.recipientId === userId)) result.push({ id: `request-${request.id}`, kind: "request", requestId: request.id, tensionId: request.tensionId, projectId: workspace.tensions.find(t => t.id === request.tensionId)?.linkedProjectId, label: "You need to respond" });
  for (const tension of workspace.tensions) {
    const poll = tension.poll;
    if (tension.status === "needs_sync" && poll && !poll.chosenOptionId && poll.participantIds.includes(userId) && !poll.options.some(option => option.votes.some(vote => vote.personId === userId))) result.push({ id: `poll-${poll.id}`, kind: "need", tensionId: tension.id, projectId: tension.linkedProjectId, label: "Your availability is needed for this conversation" });
  }
  return result;
}

// Same read model as Quick Consent: availability and an explicit outstanding response.
// Failure is surfaced by the caller, never interpreted as 'nothing needs you'.
export async function loadGovernanceResponseAttention(workspace: WorkspaceData, userId: string): Promise<PersonalAttention[]> {
  const ids = workspace.governanceProposals.filter(p => p.stage === "prepared" || p.stage === "present_proposal").map(p => p.id);
  if (!ids.length) return [];
  const [rounds, responses, person] = await Promise.all([
    supabase.from("governance_consent_rounds").select("proposal_id,status").in("proposal_id", ids).eq("status", "open"),
    supabase.from("governance_consent_responses").select("proposal_id,person_id").in("proposal_id", ids).eq("person_id", userId),
    supabase.from("people").select("governance_available").eq("id", userId).single(),
  ]);
  if (rounds.error || responses.error || person.error) throw rounds.error ?? responses.error ?? person.error;
  if (person.data?.governance_available === false) return [];
  return (rounds.data ?? []).filter(r => !responses.data?.some(response => response.proposal_id === r.proposal_id)).map(r => {
    const proposal = workspace.governanceProposals.find(p => p.id === r.proposal_id)!;
    return { id: `consent-${r.proposal_id}`, kind: "governance", tensionId: proposal.tensionId, projectId: workspace.tensions.find(t => t.id === proposal.tensionId)?.linkedProjectId, label: `Your Quick Consent response is needed · ${proposal.title}` };
  });
}
