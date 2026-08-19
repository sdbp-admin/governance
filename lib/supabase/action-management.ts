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

export async function removeAction(actionId: string) {
  const { error } = await supabase.from("actions").update({
    status: "cancelled",
    completed_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", actionId);

  if (error) throw error;
}
