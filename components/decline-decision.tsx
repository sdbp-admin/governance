"use client";

import { useState, type FormEvent } from "react";
import type { RoleDefinition } from "@/lib/domain";

export function DeclineDecision({ roles, busy, onCancel, onDecline }: {
  roles: RoleDefinition[];
  busy: boolean;
  onCancel: () => void;
  onDecline: (reason: "outside_scope" | "other", explanation: string, suggestedRoleId?: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<"outside_scope" | "other">("outside_scope");
  const [explanation, setExplanation] = useState("");
  const [suggestedRoleId, setSuggestedRoleId] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || (reason === "other" && !explanation.trim())) return;
    void onDecline(reason, explanation, reason === "outside_scope" ? suggestedRoleId || undefined : undefined);
  }
  return <form className="decline-decision" onSubmit={submit}>
    <label>Reason<select value={reason} onChange={event => setReason(event.target.value as "outside_scope" | "other")}>
      <option value="outside_scope">Outside my role or scope</option><option value="other">Other</option>
    </select></label>
    {reason === "outside_scope" && <label>Suggested role (optional)<select value={suggestedRoleId} onChange={event => setSuggestedRoleId(event.target.value)}>
      <option value="">No suggestion</option>{roles.filter(role => !role.isCircle).map(role => <option key={role.id} value={role.id}>{role.title}</option>)}
    </select></label>}
    {reason === "other" && <label>Explanation<textarea required value={explanation} onChange={event => setExplanation(event.target.value)} rows={3} /></label>}
    <div><button type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" disabled={busy || (reason === "other" && !explanation.trim())}>{busy ? "Recording…" : "Record decline"}</button></div>
  </form>;
}
