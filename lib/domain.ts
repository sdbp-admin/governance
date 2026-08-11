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

// `needs_sync` and `governance` are practical routing states in the prototype.
// They do not imply a dependency engine or automatic lifecycle choreography.
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

// Prototype/UI projection only. Production My Attention is composed from
// canonical object state plus small persisted event-driven attention signals.
// It must not become a second source of truth for Action/Project/Tension status.
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

// In v1 an accepted GovernanceProposal is the governance decision/agreement.
// Records displays accepted proposals directly rather than duplicating them into
// separate Decision and GovernanceAgreement objects.
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
