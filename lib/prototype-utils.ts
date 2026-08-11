import { people } from "@/lib/mock-data";
import type { AttentionItem, GovernanceStage, Tension } from "@/lib/domain";
import { GOVERNANCE_STEPS } from "@/lib/governance-method";

export const PROTOTYPE_TODAY = "2026-08-11";
export const NEXT_WEEK = "2026-08-18";

export function splitLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function humanKind(kind: AttentionItem["kind"]) {
  return kind.replace("_", " ");
}

export function personName(id: string) {
  return people.find((person) => person.id === id)?.name ?? id;
}

export function personInitial(id: string) {
  return personName(id).charAt(0);
}

export function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function humanGovernanceStage(stage: GovernanceStage) {
  return GOVERNANCE_STEPS.find((step) => step.id === stage)?.name ?? stage;
}

export function formatTensionStatus(tension: Tension) {
  if (tension.status === "needs_sync") return "Needs sync";
  if (tension.status === "governance") return "Moved to governance";
  if (tension.waitingFor && tension.waitingKind === "action") return `Action with ${personName(tension.waitingFor)}`;
  if (tension.waitingFor && tension.waitingKind === "project") return `Project with ${personName(tension.waitingFor)}`;
  if (tension.waitingFor && tension.waitingKind === "confirmation") return `Confirmation from ${personName(tension.waitingFor)}`;
  if (tension.waitingFor) return `Waiting for ${personName(tension.waitingFor)}`;
  return "Open";
}