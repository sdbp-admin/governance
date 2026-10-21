export const OBJECTION_QUESTIONS = [
  "Would adopting this proposal reduce SDBP's capacity to fulfil the relevant purpose or ongoing accountability?",
  "Would adopting this proposal limit your ability to fulfil the purpose or an accountability of a role you hold?",
  "Is this harm caused or materially worsened by adopting the proposal, rather than being a problem that already exists?",
  "Would the harm necessarily occur, or would there be insufficient time to adapt before significant harm could result?",
] as const;

export type ObjectionAnswer = { answer: "yes" | "no" | null; explanation: string };
export type ObjectionDraft = { answers: ObjectionAnswer[]; conflict: string };
export const EMPTY_OBJECTION_DRAFT: ObjectionDraft = {
  answers: OBJECTION_QUESTIONS.map(() => ({ answer: null, explanation: "" })),
  conflict: "",
};

// Completeness only. These answers never establish objection validity.
export function objectionDraftIsComplete(draft: ObjectionDraft): boolean {
  return Array.isArray(draft?.answers) && draft.answers.length === OBJECTION_QUESTIONS.length &&
    draft.answers.every((entry) => entry && (entry.answer === "no" ||
      (entry.answer === "yes" && typeof entry.explanation === "string" && Boolean(entry.explanation.trim()))));
}

// Keep the questions, answers and explanations in the existing objection record.
// This preserves existing review, history, withdrawal and deadline behaviour.
export function formatObjectionConcern(draft: ObjectionDraft): string {
  if (!objectionDraftIsComplete(draft)) throw new Error("Answer all four questions and explain every Yes answer.");
  return ["Concern / potential objection — awaiting human review", ...OBJECTION_QUESTIONS.map((question, index) => {
    const entry = draft.answers[index];
    return `${index + 1}. ${question}\nAnswer: ${entry.answer === "yes" ? "Yes" : "No"}${entry.answer === "yes" ? `\nExplanation: ${entry.explanation.trim()}` : ""}`;
  }), ...(draft.conflict.trim() ? [`Separate constitutional, statutory, legal or reserved-authority conflict:\n${draft.conflict.trim()}`] : [])].join("\n\n");
}
