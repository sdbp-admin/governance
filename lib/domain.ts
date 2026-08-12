export type AttentionKind = "project_update" | "action" | "tension" | "governance";
export type AttentionStatus = "needs_action" | "deferred" | "done";

export type Person = {
  id: string;
  name: string;
  email: string;
};

export type RoleCategory = "board" | "operating";

export type RoleDefinition = {
  id: string;
  title: string;
  category: RoleCategory;
  holderIds: string[];
  purpose: string;
  scope: string;
  responsibilities: string[];
  accountabilities: string[];
  source: string;
  status: "draft" | "defined";
};

export type Project = {
  id: string;
  title: string;
  ownerId: string;
  participantIds?: string[];
  role?: string;
  status: "active" | "paused" | "complete";
  lastUpdate: string;
  nextPrompt: string;
  summary: string;
  sourceTensionId?: string;
};

export type Action = {
  id: string;
  title: string;
  ownerId: string;
  status: "proposed" | "open" | "done" | "cancelled";
  due?: string;
  source?: string;
  sourceTensionId?: string;
};

export type TensionStatus = "open" | "awaiting_confirmation" | "resolved" | "needs_sync" | "governance";

export type Tension = {
  id: string;
  title: string;
  raiserId: string;
  linkedProjectId?: string;
  status: TensionStatus;
  resolutionProposedBy?: string;
  latestNote?: string;
  createdAt: string;
};

export type AttentionItem = {
  id: string;
  ownerId: string;
  kind: AttentionKind;
  targetId?: string;
  title: string;
  reason: string;
  primaryAction: string;
  status: AttentionStatus;
  due?: string;
  staleDays?: number;
};

export type GovernanceStage =
  | "prepared"
  | "present_proposal"
  | "clarifying_questions"
  | "reaction_round"
  | "clarify"
  | "objection_round"
  | "integration"
  | "accepted";

export type GovernanceProposal = {
  id: string;
  tensionId: string;
  title: string;
  proposal: string;
  proposerId: string;
  stage: GovernanceStage;
  meetingNotes: Partial<Record<GovernanceStage, string>>;
  createdAt: string;
  acceptedAt?: string;
};
