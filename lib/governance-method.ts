import type { GovernanceStage } from "@/lib/domain";

export const GOVERNANCE_STEPS: { id: Exclude<GovernanceStage, "prepared">; name: string; description: string }[] = [
  { id: "present_proposal", name: "Present Proposal", description: "The proposer describes the tension and presents the governance change intended to address it." },
  { id: "clarifying_questions", name: "Clarifying Questions", description: "Participants ask factual questions to understand the tension and proposal. Reactions, opinions and debate wait." },
  { id: "reaction_round", name: "Reaction Round", description: "Each participant may react to the proposal. The proposer listens without responding during the round." },
  { id: "clarify", name: "Option to Clarify", description: "The proposer may clarify or amend the proposal after hearing the reactions." },
  { id: "objection_round", name: "Objection Round", description: "Participants may raise concerns about adopting the proposal. Concerns are tested against the objection criteria by the facilitator and participants, not by the software." },
  { id: "integration", name: "Integration", description: "If an objection remains, the proposal is amended to resolve it while still addressing the original tension. The meeting then returns to an Objection Round." },
  { id: "accepted", name: "Proposal Accepted", description: "When no objections remain, the proposal is adopted and the resulting governance change is recorded." },
];

export const OBJECTION_TESTS = [
  "The proposal would reduce SDBP's capacity to fulfil the purpose or ongoing accountabilities concerned.",
  "It would limit the objector's capacity to fulfil the purpose or an accountability of a role they represent.",
  "The concern is created by adopting this proposal; the same problem does not already exist without it.",
  "The harmful impact would necessarily occur, or there would not be enough opportunity to adapt before significant harm could result.",
];
