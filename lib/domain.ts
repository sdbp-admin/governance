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

export type TensionWaitingKind = "response" | "action" | "project" | "confirmation";

export type Tension = {
  id: string;
  title: string;
  raiserId: string;
  linkedProjectId?: string;
  status: "open" | "resolved" | "needs_sync" | "governance";
  waitingFor?: string;
  waitingKind?: TensionWaitingKind;
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
  | "clarifying_questions"
  | "reaction_round"
  | "clarify"
  | "objection_round"
  | "integration"
  | "accepted";

export type GovernanceQuestion = {
  id: string;
  authorId: string;
  text: string;
  answer?: string;
};

export type GovernanceReaction = {
  id: string;
  authorId: string;
  text: string;
};

export type GovernanceObjection = {
  id: string;
  authorId: string;
  concern: string;
  criteria: [boolean, boolean, boolean, boolean];
  status: "candidate" | "valid" | "invalid" | "integrated";
  facilitatorNote?: string;
};

export type GovernanceProposal = {
  id: string;
  tensionId: string;
  title: string;
  proposal: string;
  proposerId: string;
  stage: GovernanceStage;
  questions: GovernanceQuestion[];
  clarificationDoneIds: string[];
  reactions: GovernanceReaction[];
  reactionPassIds: string[];
  objections: GovernanceObjection[];
  objectionPassIds: string[];
  integrationNote?: string;
  createdAt: string;
  acceptedAt?: string;
};