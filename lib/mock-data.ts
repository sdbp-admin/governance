import type { Action, AttentionItem, Person, Project, RoleDefinition, Tension } from "./domain";

export const people: Person[] = [
  { id: "ingmar", name: "Ingmar", email: "ingmar@sdbp.si" },
  { id: "edo", name: "Edo", email: "edo@sdbp.si" },
  { id: "luka", name: "Luka", email: "luka@sdbp.si" },
  { id: "jasmina", name: "Jasmina", email: "jasmina@sdbp.si" },
  { id: "marko", name: "Marko", email: "marko@sdbp.si" },
];

export const roleDefinitions: RoleDefinition[] = [
  {
    id: "president",
    title: "President",
    category: "board",
    holderIds: ["ingmar"],
    purpose: "Definition to be completed from the SDBP Statutes and applicable law.",
    scope: "Formal board role. Its exact authority and duties should be taken from the governing sources, not inferred by the app.",
    responsibilities: ["To be confirmed from the SDBP Statutes and applicable law."],
    accountabilities: ["To be confirmed from the SDBP Statutes and applicable law."],
    source: "SDBP Statutes / applicable law",
    status: "draft",
  },
  {
    id: "process-steward",
    title: "Process Steward",
    category: "operating",
    holderIds: ["ingmar"],
    purpose: "Keep SDBP's operating processes current, visible and functional.",
    scope: "Organisation-wide process health and facilitation. This role does not approve other people's work or replace their authority.",
    responsibilities: ["Process health", "Weekly organisational rhythm", "Governance and record capture"],
    accountabilities: [
      "Monitor whether commitments, tensions and governance items are moving.",
      "Initiate synchronous discussion when asynchronous processing is insufficient.",
      "Ensure governance decisions and relevant organisational records are captured.",
    ],
    source: "SDBP operating governance",
    status: "defined",
  },
  {
    id: "general-assembly-chair",
    title: "General Assembly Chair",
    category: "operating",
    holderIds: ["ingmar"],
    purpose: "Prepare and chair the General Assembly so the meeting can produce clear decisions and follow-up.",
    scope: "The preparation, chairing and organisational follow-up of the General Assembly.",
    responsibilities: ["Meeting preparation", "Chairing", "Capturing resulting decisions and actions"],
    accountabilities: ["Keep the General Assembly project current and ensure required preparation is visible."],
    source: "SDBP operating governance · draft",
    status: "draft",
  },
  {
    id: "membership-administration",
    title: "Membership Administration",
    category: "operating",
    holderIds: ["edo"],
    purpose: "Keep membership records current and usable for SDBP board work.",
    scope: "Membership records and the operational information derived from them.",
    responsibilities: ["Membership records", "Current member-status information"],
    accountabilities: ["Maintain a current membership list and provide accurate membership information when SDBP work depends on it."],
    source: "SDBP operating governance · draft",
    status: "draft",
  },
  {
    id: "member-communications",
    title: "Member Communications",
    category: "operating",
    holderIds: ["luka"],
    purpose: "Ensure members receive the operational communications SDBP needs to send.",
    scope: "Member-facing operational communication linked to SDBP activities and governance.",
    responsibilities: ["Member communications", "Communication follow-up"],
    accountabilities: ["Prepare and send member communications using current membership information."],
    source: "SDBP operating governance · draft",
    status: "draft",
  },
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
    sourceTensionId: "membership-list",
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
    targetId: "membership",
    title: "Membership administration",
    reason: "Weekly update is due. Last update was 11 days ago.",
    primaryAction: "Update project",
    status: "needs_action",
    staleDays: 11,
  },
  {
    id: "membership-action",
    kind: "action",
    targetId: "send-membership-list",
    title: "Send current membership list to Luka",
    reason: "Luka needs this for the General Assembly.",
    primaryAction: "Accept action",
    status: "needs_action",
    due: "2026-08-14",
  },
  {
    id: "tension-response",
    kind: "tension",
    targetId: "membership-list",
    title: "Membership list still not received",
    reason: "Luka is waiting for your response.",
    primaryAction: "Respond",
    status: "needs_action",
    staleDays: 1,
  },
];
