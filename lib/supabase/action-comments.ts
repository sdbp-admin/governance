import { supabase } from "@/lib/supabase/client";
import { notifyAttention } from "@/lib/supabase/attention-notifications";

export type ActionCommentEntry = {
  id: string;
  actionId: string;
  authorId: string;
  body: string;
  mentionedIds: string[];
  createdAt: string;
  updatedAt: string | null;
};

export type ActionCommentAttentionSignal = {
  id: string;
  recipientId: string;
  actionId: string;
};

type ActionCommentRow = {
  id: string;
  action_id: string;
  author_id: string;
  body: string;
  mentioned_ids: string[] | null;
  created_at: string;
  updated_at?: string | null;
};

export async function loadActionComments(actionId: string): Promise<ActionCommentEntry[]> {
  const rich = await supabase
    .from("action_comments")
    .select("id,action_id,author_id,body,mentioned_ids,created_at,updated_at")
    .eq("action_id", actionId)
    .order("created_at", { ascending: true });
  let rows: ActionCommentRow[];
  if (!rich.error) rows = (rich.data ?? []) as ActionCommentRow[];
  else {
    if (rich.error.code !== "42703" && rich.error.code !== "PGRST204" && !/updated_at|schema cache/i.test(rich.error.message ?? "")) throw rich.error;
    const legacy = await supabase.from("action_comments").select("id,action_id,author_id,body,mentioned_ids,created_at").eq("action_id", actionId).order("created_at", { ascending: true });
    if (legacy.error) throw legacy.error;
    rows = (legacy.data ?? []) as ActionCommentRow[];
  }
  return rows.map((row) => ({
    id: row.id,
    actionId: row.action_id,
    authorId: row.author_id,
    body: row.body,
    mentionedIds: row.mentioned_ids ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  }));
}

export async function addActionComment(actionId: string, body: string, mentionedIds: string[] = []) {
  const { data, error } = await supabase.rpc("add_action_comment", {
    target_action_id: actionId,
    comment_body: body.trim(),
    mention_ids: mentionedIds,
  });
  if (error) throw error;
  if (data) await notifyAttention({ kind: "action_comment", commentId: String(data) });
}

export async function editActionComment(commentId: string, body: string, mentionedIds: string[] = []) {
  const { data, error } = await supabase.rpc("edit_action_comment", {
    target_comment_id: commentId,
    comment_body: body.trim(),
    mention_ids: mentionedIds,
  });
  if (error) throw error;
  const recipientIds = (data ?? []) as string[];
  if (recipientIds.length) await notifyAttention({ kind: "action_comment", commentId, recipientIds });
}

export async function loadActionCommentAttentionSignals(userId: string): Promise<ActionCommentAttentionSignal[]> {
  const { data, error } = await supabase
    .from("attention_signals")
    .select("id,recipient_id,action_id")
    .eq("recipient_id", userId)
    .eq("signal_type", "action_comment")
    .is("acknowledged_at", null);
  if (error) throw error;
  return (data ?? []).filter((row) => Boolean(row.action_id)).map((row) => ({
    id: row.id as string,
    recipientId: row.recipient_id as string,
    actionId: row.action_id as string,
  }));
}
