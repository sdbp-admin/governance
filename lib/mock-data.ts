import type { Action, AttentionItem, Person, Project, Tension } from "./domain";

export const people: Person[] = [
  { id: "ingmar", name: "Ingmar", email: "ingmar@sdbp.si", legalPosition: "President", roles: ["Process Steward", "General Assembly Chair"] },
  { id: "edo", name: "Edo", email: "edo@sdbp.si", roles: ["Membership Administration"] },
  { id: "luka", name: "Luka", email: "luka@sdbp.si", roles: ["Member Communications"] },
  { id: "jasmina", name: "Jasmina", email: "jasmina@sdbp.si", roles: [] },
  { id: "marko", name: "Marko", email: "marko@sdbp.si", roles: [] },
];

export const projects: Project[] = [
  {
    id: "general-assembly",
    title: "General Assembly",
    ownerId: "ingmar",
    role: "General Assembly Chair",
    status: "active",
    lastUpdate: "2026-08-08",
    nextPrompt: "2026-08-14",
    summary: "Prepare and chair the upcoming General Assembly.",
  },
  {
    id: "membership",
    title: "Membership administration",
    ownerId: "edo",
    role: "Membership Administration",
    status: "active",
    lastUpdate: "2026-07-31",
    nextPrompt: "2026-08-11",
    summary: "Keep membership records current and usable for board work.",
  },
  {
    id: "trade-mission",
    title: "Trade Mission",
    ownerId: "ingmar",
    status: "active",
    lastUpdate: "2026-08-07",
    nextPrompt: "2026-08-14",
    summary: "Develop the sustainable construction trade mission and partner offer.",
  },
];

export const actions: Action[] = [
  {
    id: "send-membership-list",
    title: "Send current membership list to Luka",
    ownerId: "edo",
    status: "proposed",
    due: "2026-08-14",
    source: "Membership list tension",
  },
  {
    id: "send-ga-mails",
    title: "Send General Assembly mails to paying members",
    ownerId: "luka",
    status: "open",
    due: "2026-08-18",
    source: "General Assembly",
  },
];

export const tensions: Tension[] = [
  {
    id: "membership-list",
    title: "Membership list still not received",
    raiserId: "luka",
    linkedProjectId: "general-assembly",
    status: "open",
    waitingFor: "edo",
    createdAt: "2026-08-10",
  },
];

export const myAttention: AttentionItem[] = [
  {
    id: "membership-update",
    kind: "project_update",
    title: "Membership administration",
    reason: "Weekly update is due. Last update was 11 days ago.",
    primaryAction: "Update project",
    status: "needs_action",
    staleDays: 11,
  },
  {
    id: "membership-action",
    kind: "action",
    title: "Send current membership list to Luka",
    reason: "Luka needs this for the General Assembly.",
    primaryAction: "Accept action",
    status: "needs_action",
    due: "2026-08-14",
  },
  {
    id: "tension-response",
    kind: "tension",
    title: "Membership list still not received",
    reason: "Luka is waiting for your response.",
    primaryAction: "Respond",
    status: "needs_action",
    staleDays: 1,
  },
];
