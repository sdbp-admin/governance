import type { Action, GovernanceProposal, Person, Project, RoleDefinition, Tension } from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";

export type WorkspacePerson = Person & {
  linked: boolean;
  canInvite: boolean;
};

export type WorkspaceData = {
  people: WorkspacePerson[];
  roles: RoleDefinition[];
  projects: Project[];
  actions: Action[];
  tensions: Tension[];
  governanceProposals: GovernanceProposal[];
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

export async function loadWorkspace(): Promise<WorkspaceData> {
  const [peopleResult, rolesResult, assignmentsResult, projectsResult, actionsResult, tensionsResult, proposalsResult] = await Promise.all([
    supabase.from("people").select("id,name,email,auth_user_id,can_invite").eq("active", true).order("name"),
    supabase.from("roles").select("id,title,category,purpose,scope,responsibilities,accountabilities,source,definition_status").order("title"),
    supabase.from("role_assignments").select("role_id,person_id,ends_on").is("ends_on", null),
    supabase.from("projects").select("id,title,owner_id,role_id,status,summary,last_update_at,next_prompt_on,source_tension_id,participant_ids,created_at").order("created_at", { ascending: false }),
    supabase.from("actions").select("id,title,owner_id,status,due_on,source_label,source_tension_id").order("created_at", { ascending: false }),
    supabase.from("tensions").select("id,title,raiser_id,project_id,status,resolution_proposed_by,latest_note,created_at").order("created_at", { ascending: false }),
    supabase.from("governance_proposals").select("id,tension_id,title,proposal,proposer_id,stage,meeting_notes,created_at,accepted_at").order("created_at", { ascending: false }),
  ]);

  const error = peopleResult.error || rolesResult.error || assignmentsResult.error || projectsResult.error || actionsResult.error || tensionsResult.error || proposalsResult.error;
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
    })),
    governanceProposals: ((proposalsResult.data ?? []) as ProposalRow[]).map((row): GovernanceProposal => ({
      id: row.id,
      tensionId: row.tension_id,
      title: row.title,
      proposal: row.proposal,
      proposerId: row.proposer_id,
      stage: row.stage,
      meetingNotes: row.meeting_notes ?? {},
      createdAt: dateOnly(row.created_at),
      acceptedAt: row.accepted_at ? dateOnly(row.accepted_at) : undefined,
    })),
  };
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

  const { data: existing, error: existingError } = await supabase
    .from("people")
    .select("id,active")
    .ilike("email", cleanEmail)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!existing) {
    const { error: insertError } = await supabase.from("people").insert({ name: cleanName, email: cleanEmail, active: true });
    if (insertError) throw insertError;
  } else if (!existing.active) {
    const { error: reactivateError } = await supabase.rpc("reactivate_workspace_person", {
      target_email: cleanEmail,
      target_name: cleanName,
    });
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

export async function createAction(input: { title: string; ownerId: string; status?: Action["status"]; due?: string; source?: string; sourceTensionId?: string }) {
  const { error } = await supabase.from("actions").insert({
    title: input.title.trim(),
    owner_id: input.ownerId,
    status: input.status ?? "open",
    due_on: input.due ?? null,
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

export async function updateTension(tensionId: string, patch: Partial<{ status: Tension["status"]; resolutionProposedBy: string | null; latestNote: string | null }>) {
  const values: Record<string, unknown> = {};
  if (patch.status !== undefined) values.status = patch.status;
  if (patch.resolutionProposedBy !== undefined) values.resolution_proposed_by = patch.resolutionProposedBy;
  if (patch.latestNote !== undefined) values.latest_note = patch.latestNote;
  if (patch.status === "resolved") values.resolved_at = new Date().toISOString();
  const { error } = await supabase.from("tensions").update(values).eq("id", tensionId);
  if (error) throw error;
}

export async function createGovernanceProposal(input: { tensionId: string; title: string; proposal: string; proposerId: string }) {
  const { error } = await supabase.from("governance_proposals").insert({
    tension_id: input.tensionId,
    title: input.title.trim(),
    proposal: input.proposal.trim(),
    proposer_id: input.proposerId,
    stage: "prepared",
    meeting_notes: {},
  });
  if (error) throw error;
}

export async function saveGovernanceProposal(proposal: GovernanceProposal) {
  const { error } = await supabase.from("governance_proposals").update({
    proposal: proposal.proposal,
    stage: proposal.stage,
    meeting_notes: proposal.meetingNotes,
    accepted_at: proposal.stage === "accepted" ? (proposal.acceptedAt ? `${proposal.acceptedAt}T12:00:00Z` : new Date().toISOString()) : null,
    updated_at: new Date().toISOString(),
  }).eq("id", proposal.id);
  if (error) throw error;
}

export async function acceptGovernanceProposal(proposal: GovernanceProposal) {
  await saveGovernanceProposal({ ...proposal, stage: "accepted", acceptedAt: todayISO() });
  await updateTension(proposal.tensionId, {
    status: "resolved",
    resolutionProposedBy: null,
    latestNote: `Governance proposal accepted: “${proposal.title}”.`,
  });
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
