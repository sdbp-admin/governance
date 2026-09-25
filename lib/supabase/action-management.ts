import type { Action } from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";
import { notifyAttention } from "@/lib/supabase/attention-notifications";

export type ActionEditInput = {
  title: string;
  ownerId: string;
  due?: string;
  currentUserId: string;
  currentOwnerId: string;
  currentStatus: Action["status"];
};

export async function updateActionDetails(actionId: string, input: ActionEditInput) {
  const title = input.title.trim();
  if (!title) throw new Error("A next step needs a description.");

  const ownerChanged = input.ownerId !== input.currentOwnerId;
  const nextStatus: Action["status"] = ownerChanged
    ? (input.ownerId === input.currentUserId ? "open" : "proposed")
    : input.currentStatus;

  const { error } = await supabase.from("actions").update({
    title,
    owner_id: input.ownerId,
    due_on: input.due || null,
    status: nextStatus,
    ...(ownerChanged ? { proposed_by: input.currentUserId, decline_reason: null, decline_note: null, suggested_role_id: null, declined_at: null } : {}),
    completed_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", actionId);

  if (error) throw error;
  if (ownerChanged && nextStatus === "proposed") {
    await notifyAttention({
      kind: "action_proposed",
      recipientId: input.ownerId,
      title,
      context: "Next step reassigned to you",
    });
  }
}

export async function declineProposedAction(actionId: string, reason: "outside_scope" | "other", explanation: string, suggestedRoleId?: string) {
  const { error } = await supabase.rpc("decline_proposed_action", {
    target_action_id: actionId,
    reason,
    explanation: explanation.trim() || null,
    suggested_role: suggestedRoleId || null,
  });
  if (error) throw error;
}

export async function removeAction(actionId: string) {
  const { error } = await supabase.from("actions").update({
    status: "cancelled",
    completed_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", actionId);

  if (error) throw error;
}
