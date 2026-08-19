import type {
  Action,
  GovernanceEffect,
  GovernanceProposal,
  Person,
  Project,
  RoleDefinition,
  StandingAgreement,
  Tension,
  TensionPoll,
} from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";
import { notifyAttention } from "@/lib/supabase/attention-notifications";

export type WorkspacePerson = Person & {
  linked: boolean;
  canInvite: boolean;
};

export type WorkspaceAttentionSignal = {
  id: string;
  recipientId: string;
  tensionId?: string;
  projectId?: string;
  signalType: "tension_need" | "project_comment";
  message: string;
  createdBy?: string;
  createdAt: string;
};

export type ProjectUpdateEntry = {
  id: string;
  projectId: string;
  authorId?: string;
  updateKind: "baseline" | "update" | "no_change" | "edit";
  summary: string;
  createdAt: string;
};

export type ProjectCommentEntry = {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export type WorkspaceData = {
  people: WorkspacePerson[];
  roles: RoleDefinition[];
  projects: Project[];
  actions: Action[];
  tensions: Tension[];
  governanceProposals: GovernanceProposal[];
  standingAgreements: StandingAgreement[];
  attentionSignals?: WorkspaceAttentionSignal[];
};

type RoleRow = {
  id: string;
  title: string;
  category: "board" | "operating";
  purpose: string;
  scope: string;
  responsibilities: string[] | null;
  accountabilities: string[] | null;
  source: string;
  definition_status: "draft" | "defined";
};
type AssignmentRow = { role_id: string; person_id: string; ends_on: string | null };
type ProjectRow = {
  id: string;
  title: string;
  owner_id: string;
  role_id: string | null;
  status: "active" | "paused" | "complete";
  summary: string;
  last_update_at: string | null;
  next_prompt_on: string | null;
  source_tension_id: string | null;
  participant_ids: string[] | null;
  created_at: string;
};
type ActionRow = {
  id: string;
  title: string;
  owner_id: string;
  status: "proposed" | "open" | "done" | "cancelled";
  due_on: string | null;
  project_id: string | null;
  source_label: string | null;
  source_tension_id: string | null;
};
type TensionRow = {
  id: string;
  title: string;
  raiser_id: string;
  project_id: string | null;
  status: Tension["status"];
  resolution_proposed_by: string | null;
  latest_note: string | null;
  created_at: string;
};
type ProposalRow = {
  id: string;
  tension_id: string;
  title: string;
  proposal: string;
  proposer_id: string;
  stage: GovernanceProposal["stage"];
  meeting_notes: GovernanceProposal["meetingNotes"] | null;
  created_at: string;
  accepted_at: string | null;
};
type AttentionSignalRow = {
  id: string;
  recipient_id: string;
  tension_id: string | null;
  project_id: string | null;
  signal_type: "tension_need" | "project_comment";
  message: string;
  created_by: string | null;
  created_at: string;
};
type ProjectUpdateRow = {
  id: string;
  project_id: string;
  author_id: string | null;
  update_kind: ProjectUpdateEntry["updateKind"];
  summary: string;
  created_at: string;
};
type ProjectCommentRow = {
  id: string;
  project_id: string;
  author_id: string;
  body: string;
  created_at: string;
};
type StandingAgreementRow = {
  id: string;
  category: StandingAgreement["category"];
  title: string;
  body: string;
  status: StandingAgreement["status"];
  source_proposal_id: string | null;
  updated_at: string;
};
type PollRow = { id: string; tension_id: string; chosen_option_id: string | null };
type PollOptionRow = { id: string; poll_id: string; starts_at: string };
type PollParticipantRow = { poll_id: string; person_id: string };
type PollVoteRow = { poll_id: string; option_id: string; person_id: string; available: boolean };

export async function loadWorkspace(): Promise<WorkspaceData> {
  const [peopleResult, rolesResult, assignmentsResult, projectsResult, actionsResult, tensionsResult, proposalsResult, attentionResult] = await Promise.all([
    supabase.from("people").select("id,name,email,auth_user_id,can_invite").eq("active", true).order("name"),
    supabase.from("roles").select("id,title,category,purpose,scope,responsibilities,accountabilities,source,definition_status").order("title"),
    supabase.from("role_assignments").select("role_id,person_id,ends_on").is("ends_on", null),
    supabase.from("projects").select("id,title,owner_id,role_id,status,summary,last_update_at,next_prompt_on,source_tension_id,participant_ids,created_at").order("created_at", { ascending: false }),
    supabase.from("actions").select("id,title,owner_id,status,due_on,project_id,source_label,source_tension_id").order("created_at", { ascending: false }),
    supabase.from("tensions").select("id,title,raiser_id,project_id,status,resolution_proposed_by,latest_note,created_at").order("created_at", { ascending: false }),
    supabase.from("governance_proposals").select("id,tension_id,title,proposal,proposer_id,stage,meeting_notes,created_at,accepted_at").order("created_at", { ascending: false }),
    supabase.from("attention_signals").select("id,recipient_id,tension_id,project_id,signal_type,message,created_by,created_at").is("acknowledged_at", null).order("created_at", { ascending: false }),
  ]);

  const error = peopleResult.error || rolesResult.error || assignmentsResult.error || projectsResult.error || actionsResult.error || tensionsResult.error || proposalsResult.error || attentionResult.error;
  if (error) throw error;

  const assignments = (assignmentsResult.data ?? []) as AssignmentRow[];
  const roles = ((rolesResult.data ?? []) as RoleRow[]).map((row): RoleDefinition => ({
    id: row.id,
    title: row.title,
    category: row.category,
    holderIds: assignments.filter((assignment) => assignment.role_id === row.id).map((assignment) => assignment.person_id),
    purpose: row.purpose,
    scope: row.scope,
    responsibilities: row.responsibilities ?? [],
    accountabilities: row.accountabilities ?? [],
    source: row.source,
    status: row.definition_status,
  }));

  const effectByProposal = new Map<string, GovernanceEffect>();
  const effectResult = await supabase.from("governance_proposals").select("id,governance_effect");
  if (!effectResult.error) {
    for (const row of effectResult.data ?? []) {
      if (row.governance_effect) effectByProposal.set(row.id as string, row.governance_effect as GovernanceEffect);
    }
  } else if (!isOptionalSchemaError(effectResult.error)) {
    throw effectResult.error;
  }

  const standingAgreements = await loadOptionalStandingAgreements();
  const pollsByTension = await loadOptionalTensionPolls();
  const roleTitle = new Map(roles.map((role) => [role.id, role.title]));

  return {
    people: (peopleResult.data ?? []).map((row): WorkspacePerson => ({
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
      linked: Boolean(row.auth_user_id),
      canInvite: Boolean(row.can_invite),
    })),
    roles,
    projects: ((projectsResult.data ?? []) as ProjectRow[]).map((row): Project => ({
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      role: row.role_id ? roleTitle.get(row.role_id) : undefined,
      status: row.status,
      lastUpdate: dateOnly(row.last_update_at ?? row.created_at),
      nextPrompt: row.next_prompt_on ?? addDays(dateOnly(row.created_at), 7),
      summary: row.summary,
      sourceTensionId: row.source_tension_id ?? undefined,
      participantIds: unique([row.owner_id, ...(row.participant_ids ?? [])]),
    })),
    actions: ((actionsResult.data ?? []) as ActionRow[]).map((row): Action => ({
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      status: row.status,
      due: row.due_on ?? undefined,
      projectId: row.project_id ?? undefined,
      source: row.source_label ?? undefined,
      sourceTensionId: row.source_tension_id ?? undefined,
    })),
    tensions: ((tensionsResult.data ?? []) as TensionRow[]).map((row): Tension => ({
      id: row.id,
      title: row.title,
      raiserId: row.raiser_id,
      linkedProjectId: row.project_id ?? undefined,
      status: row.status,
      resolutionProposedBy: row.resolution_proposed_by ?? undefined,
      latestNote: row.latest_note ?? undefined,
      createdAt: dateOnly(row.created_at),
      poll: pollsByTension.get(row.id),
    })),
    governanceProposals: ((proposalsResult.data ?? []) as ProposalRow[]).map((row): GovernanceProposal => ({
      id: row.id,
      tensionId: row.tension_id,
      title: row.title,
      proposal: row.proposal,
      proposerId: row.proposer_id,
      stage: row.stage,
      meetingNotes: row.meeting_notes ?? {},
      governanceEffect: effectByProposal.get(row.id),
      createdAt: dateOnly(row.created_at),
      acceptedAt: row.accepted_at ? dateOnly(row.accepted_at) : undefined,
    })),
    standingAgreements,
    attentionSignals: ((attentionResult.data ?? []) as AttentionSignalRow[]).map((row): WorkspaceAttentionSignal => ({
      id: row.id,
      recipientId: row.recipient_id,
      tensionId: row.tension_id ?? undefined,
      projectId: row.project_id ?? undefined,
      signalType: row.signal_type,
      message: row.message,
      createdBy: row.created_by ?? undefined,
      createdAt: row.created_at,
    })),
  };
}

async function loadOptionalStandingAgreements(): Promise<StandingAgreement[]> {
  const result = await supabase
    .from("standing_agreements")
    .select("id,category,title,body,status,source_proposal_id,updated_at")
    .order("category")
    .order("title");
  if (result.error) {
    if (isOptionalSchemaError(result.error)) return [];
    throw result.error;
  }
  return ((result.data ?? []) as StandingAgreementRow[]).map((row) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    status: row.status,
    sourceProposalId: row.source_proposal_id ?? undefined,
    updatedAt: row.updated_at,
  }));
}

async function loadOptionalTensionPolls(): Promise<Map<string, TensionPoll>> {
  const [polls, options, participants, votes] = await Promise.all([
    supabase.from("tension_polls").select("id,tension_id,chosen_option_id"),
    supabase.from("tension_poll_options").select("id,poll_id,starts_at").order("starts_at"),
    supabase.from("tension_poll_participants").select("poll_id,person_id"),
    supabase.from("tension_poll_votes").select("poll_id,option_id,person_id,available"),
  ]);

  const firstError = polls.error || options.error || participants.error || votes.error;
  if (firstError) {
    if (isOptionalSchemaError(firstError)) return new Map();
    throw firstError;
  }

  const pollRows = (polls.data ?? []) as PollRow[];
  const optionRows = (options.data ?? []) as PollOptionRow[];
  const participantRows = (participants.data ?? []) as PollParticipantRow[];
  const voteRows = (votes.data ?? []) as PollVoteRow[];
  const byTension = new Map<string, TensionPoll>();

  for (const poll of pollRows) {
    byTension.set(poll.tension_id, {
      id: poll.id,
      tensionId: poll.tension_id,
      participantIds: participantRows.filter((row) => row.poll_id === poll.id).map((row) => row.person_id),
      chosenOptionId: poll.chosen_option_id ?? undefined,
      options: optionRows.filter((row) => row.poll_id === poll.id).map((option) => ({
        id: option.id,
        startsAt: option.starts_at,
        votes: voteRows.filter((vote) => vote.poll_id === poll.id && vote.option_id === option.id).map((vote) => ({
          personId: vote.person_id,
          available: vote.available,
        })),
      })),
    });
  }
  return byTension;
}

export async function canInvitePeople() {
  const { data, error } = await supabase.rpc("can_invite_people");
  if (error) throw error;
  return Boolean(data);
}

export async function invitePerson(name: string, email: string) {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanEmail) throw new Error("Name and email are required.");

  const { data: existing, error: existingError } = await supabase.from("people").select("id,active").ilike("email", cleanEmail).maybeSingle();
  if (existingError) throw existingError;

  if (!existing) {
    const { error: insertError } = await supabase.from("people").insert({ name: cleanName, email: cleanEmail, active: true });
    if (insertError) throw insertError;
  } else if (!existing.active) {
    const { error: reactivateError } = await supabase.rpc("reactivate_workspace_person", { target_email: cleanEmail, target_name: cleanName });
    if (reactivateError) throw reactivateError;
  }

  const redirectTo = `${window.location.origin}/governance/`;
  const { error: inviteError } = await supabase.auth.signInWithOtp({
    email: cleanEmail,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  if (inviteError) throw inviteError;
}

export async function saveRole(role: RoleDefinition) {
  const { error: roleError } = await supabase.from("roles").upsert({
    id: role.id,
    title: role.title.trim(),
    category: role.category,
    purpose: role.purpose.trim(),
    scope: role.scope.trim(),
    responsibilities: role.responsibilities,
    accountabilities: role.accountabilities,
    source: role.source.trim(),
    definition_status: role.status,
    updated_at: new Date().toISOString(),
  });
  if (roleError) throw roleError;
  if (isPresidentRole(role)) return;

  const { error: deleteError } = await supabase.from("role_assignments").delete().eq("role_id", role.id).is("ends_on", null);
  if (deleteError) throw deleteError;
  if (role.holderIds.length) {
    const { error: assignmentError } = await supabase.from("role_assignments").insert(role.holderIds.map((personId) => ({ role_id: role.id, person_id: personId })));
    if (assignmentError) throw assignmentError;
  }
}

export async function deleteRole(roleId: string) {
  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) throw error;
}

export async function createProject(input: { title: string; ownerId: string; participantIds?: string[]; summary?: string; sourceTensionId?: string }) {
  const today = todayISO();
  const { error } = await supabase.from("projects").insert({
    title: input.title.trim(),
    owner_id: input.ownerId,
    status: "active",
    summary: input.summary?.trim() ?? "",
    last_update_at: new Date().toISOString(),
    next_prompt_on: addDays(today, 7),
    source_tension_id: input.sourceTensionId ?? null,
    participant_ids: unique([input.ownerId, ...(input.participantIds ?? [])]),
  });
  if (error) throw error;
}

export async function updateProject(projectId: string, summary: string) {
  const { error } = await supabase.from("projects").update({
    summary: summary.trim(),
    last_update_at: new Date().toISOString(),
    next_prompt_on: addDays(todayISO(), 7),
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);
  if (error) throw error;
}

export async function touchProject(projectId: string) {
  const { error } = await supabase.from("projects").update({
    last_update_at: new Date().toISOString(),
    next_prompt_on: addDays(todayISO(), 7),
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);
  if (error) throw error;
}

export async function completeProject(projectId: string) {
  const { error } = await supabase.from("projects").update({
    status: "complete",
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);
  if (error) throw error;
}

export async function createAction(input: { title: string; ownerId: string; status?: Action["status"]; due?: string; projectId?: string; source?: string; sourceTensionId?: string }) {
  const { error } = await supabase.from("actions").insert({
    title: input.title.trim(),
    owner_id: input.ownerId,
    status: input.status ?? "open",
    due_on: input.due ?? null,
    project_id: input.projectId ?? null,
    source_label: input.source?.trim() || null,
    source_tension_id: input.sourceTensionId ?? null,
  });
  if (error) throw error;
}

export async function setActionStatus(actionId: string, status: Action["status"]) {
  const { error } = await supabase.from("actions").update({
    status,
    updated_at: new Date().toISOString(),
    completed_at: status === "done" ? new Date().toISOString() : null,
  }).eq("id", actionId);
  if (error) throw error;
}

export async function createTension(input: { title: string; raiserId: string; projectId?: string }) {
  const { error } = await supabase.from("tensions").insert({
    title: input.title.trim(),
    raiser_id: input.raiserId,
    project_id: input.projectId ?? null,
    status: "open",
  });
  if (error) throw error;
}

export async function setTensionNeed(tensionId: string, kind: "input" | "sync", recipientIds: string[], detail: string) {
  const { error } = await supabase.rpc("set_tension_need", { target_tension_id: tensionId, need_kind: kind, recipient_ids: recipientIds, detail });
  if (error) throw error;
  await notifyTensionChange(tensionId);
}

export async function createTensionPoll(tensionId: string, optionTimes: string[]) {
  const { error } = await supabase.rpc("create_tension_poll", { target_tension_id: tensionId, option_times: optionTimes });
  if (error) throw error;
}

export async function voteTensionPoll(pollId: string, availableOptionIds: string[]) {
  const { error } = await supabase.rpc("vote_tension_poll", { target_poll_id: pollId, available_option_ids: availableOptionIds });
  if (error) throw error;
}

export async function chooseTensionPollOption(pollId: string, optionId: string) {
  const { error } = await supabase.rpc("choose_tension_poll_option", { target_poll_id: pollId, target_option_id: optionId });
  if (error) throw error;
}

export async function acknowledgeAttentionSignal(signalId: string) {
  const { error } = await supabase.rpc("acknowledge_attention_signal", { target_signal_id: signalId });
  if (error) throw error;
}

export async function loadProjectUpdates(projectId: string): Promise<ProjectUpdateEntry[]> {
  const { data, error } = await supabase.from("project_updates").select("id,project_id,author_id,update_kind,summary,created_at").eq("project_id", projectId).order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ProjectUpdateRow[]).map((row) => ({ id: row.id, projectId: row.project_id, authorId: row.author_id ?? undefined, updateKind: row.update_kind, summary: row.summary, createdAt: row.created_at }));
}

export async function loadProjectComments(projectId: string): Promise<ProjectCommentEntry[]> {
  const { data, error } = await supabase.from("project_comments").select("id,project_id,author_id,body,created_at").eq("project_id", projectId).order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ProjectCommentRow[]).map((row) => ({ id: row.id, projectId: row.project_id, authorId: row.author_id, body: row.body, createdAt: row.created_at }));
}

export async function addProjectComment(projectId: string, body: string) {
  const { error } = await supabase.rpc("add_project_comment", { target_project_id: projectId, comment_body: body.trim() });
  if (error) throw error;
}

export async function updateTension(tensionId: string, patch: Partial<{ status: Tension["status"]; resolutionProposedBy: string | null; latestNote: string | null }>) {
  const values: Record<string, unknown> = {};
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.resolutionProposedBy !== undefined) values.resolution_proposed_by = patch.resolutionProposedBy;
  if (patch.latestNote !== undefined) values.latest_note = patch.latestNote;
  if (patch.status === "resolved") values.resolved_at = new Date().toISOString();
  const { error } = await supabase.from("tensions").update(values).eq("id", tensionId);
  if (error) throw error;
  if (shouldNotifyTensionChange(patch)) await notifyTensionChange(tensionId);
}

export async function createGovernanceProposal(input: { tensionId: string; title: string; proposal: string; proposerId: string; governanceEffect?: GovernanceEffect }) {
  const { error } = await supabase.from("governance_proposals").insert({
    tension_id: input.tensionId,
    title: input.title.trim(),
    proposal: input.proposal.trim(),
    proposer_id: input.proposerId,
    stage: "prepared",
    meeting_notes: {},
    governance_effect: input.governanceEffect ?? null,
  });
  if (error) throw error;
}

export async function saveGovernanceProposal(proposal: GovernanceProposal) {
  const values = {
    proposal: proposal.proposal,
    stage: proposal.stage,
    meeting_notes: proposal.meetingNotes,
    governance_effect: proposal.governanceEffect ?? null,
    accepted_at: proposal.stage === "accepted" ? (proposal.acceptedAt ? `${proposal.acceptedAt}T12:00:00Z` : new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("governance_proposals").update(values).eq("id", proposal.id);
  if (error) {
    if (!proposal.governanceEffect && isOptionalSchemaError(error)) {
      const { error: legacyError } = await supabase.from("governance_proposals").update({
        proposal: proposal.proposal,
        stage: proposal.stage,
        meeting_notes: proposal.meetingNotes,
        accepted_at: values.accepted_at,
        updated_at: values.updated_at,
      }).eq("id", proposal.id);
      if (legacyError) throw legacyError;
      return;
    }
    throw error;
  }
}

export async function acceptGovernanceProposal(proposal: GovernanceProposal) {
  if (!proposal.governanceEffect) throw new Error("Define where this governance change will live before accepting it.");
  const { error } = await supabase.rpc("accept_governance_proposal_with_effect", {
    target_proposal_id: proposal.id,
    final_proposal: proposal.proposal,
    final_meeting_notes: proposal.meetingNotes,
    final_effect: proposal.governanceEffect,
  });
  if (error) throw error;
}

export function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateOnly(value: string) {
  return value.slice(0, 10);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function isPresidentRole(role: RoleDefinition) {
  return role.category === "board" && role.title.trim().toLowerCase() === "president";
}

function shouldNotifyTensionChange(patch: Partial<{ status: Tension["status"]; latestNote: string | null }>) {
  if (patch.status === "awaiting_confirmation") return true;
  const note = patch.latestNote ?? "";
  return note.startsWith("Needs input or help from ") || note.startsWith("Needs a real conversation with ");
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || /does not exist|schema cache/i.test(error.message ?? "");
}

async function notifyTensionChange(tensionId: string) {
  await notifyAttention({ tensionId });
}
