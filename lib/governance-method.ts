import type { GovernanceStage } from "@/lib/domain";

export const GOVERNANCE_STEPS: { id: GovernanceStage; name: string; description: string }[] = [
  { id: "clarifying_questions", name: "Clarifying Questions", description: "Board members ask factual questions to understand the tension and proposal. The proposer answers; reactions and debate wait." },
  { id: "reaction_round", name: "Reaction Round", description: "Each board member gives a reaction or explicitly passes. The proposer listens." },
  { id: "clarify", name: "Option to Clarify", description: "The proposer may explain or amend the proposal after hearing reactions." },
  { id: "objection_round", name: "Objection Round", description: "Each board member either raises a concern for the objection test or explicitly records no objection." },
  { id: "integration", name: "Integration", description: "Valid objections are integrated into an amended proposal, which then returns to another Objection Round." },
  { id: "accepted", name: "Proposal Accepted", description: "When everyone has responded and no unresolved valid objections remain, the governance change is adopted." },
];

export const OBJECTION_TESTS = [
  "The proposal would reduce SDBP's capacity to fulfil the purpose or ongoing accountabilities concerned.",
  "It would limit my capacity to fulfil the purpose or an accountability of a role I represent.",
  "The concern is created by adopting this proposal; the same problem does not already exist without it.",
  "The harmful impact would necessarily occur, or there would not be enough opportunity to adapt before significant harm could result.",
];
