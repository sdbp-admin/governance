export type AttentionKind = "project_update" | "action" | "tension" | "governance" | "comment" | "tension_comment" | "feed";
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
  projectId?: string;
  source?: string;
  sourceTensionId?: string;
};

export type TensionStatus = "open" | "awaiting_confirmation" | "resolved" | "needs_sync" | "governance";

export type AvailabilityVote = {
  personId: string;
  available: boolean;
};

export type AvailabilityOption = {
  id: string;
  startsAt: string;
  votes: AvailabilityVote[];
};

export type TensionPoll = {
  id: string;
  tensionId: string;
  participantIds: string[];
  options: AvailabilityOption[];
  chosenOptionId?: string;
};

export type Tension = {
  id: string;
  title: string;
  raiserId: string;
  linkedProjectId?: string;
  status: TensionStatus;
  resolutionProposedBy?: string;
  latestNote?: string;
  createdAt: string;
  poll?: TensionPoll;
};

export type AttentionItem = {
  id: string;
  ownerId: string;
  kind: AttentionKind;
  targetId?: string;
  signalId?: any;
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

export type StandingAgreementCategory =
  | "organisation_authority"
  | "finance"
  | "membership"
  | "external_relations"
  | "events_programmes"
  | "ways_of_working"
  | "other";

export type StandingAgreement = {
  id: string;
  category: StandingAgreementCategory;
  title: string;
  body: string;
  status: "current" | "repealed";
  sourceProposalId?: string;
  updatedAt: string;
};

export type GovernanceRoleSnapshot = {
  title: string;
  category: RoleCategory;
  purpose: string;
  scope: string;
  responsibilities: string[];
  accountabilities: string[];
};

export type GovernanceEffect =
  | {
      kind: "role";
      operation: "create" | "amend" | "remove";
      targetId?: string;
      role?: GovernanceRoleSnapshot;
    }
  | {
      kind: "standing_agreement";
      operation: "create" | "amend" | "repeal";
      targetId?: string;
      agreement?: {
        category: StandingAgreementCategory;
        title: string;
        body: string;
      };
    };

export type GovernanceProposal = {
  id: string;
  tensionId: string;
  title: string;
  proposal: string;
  proposerId: string;
  stage: GovernanceStage;
  meetingNotes: Partial<Record<GovernanceStage, string>>;
  governanceEffect?: GovernanceEffect;
  createdAt: string;
  acceptedAt?: string;
};
