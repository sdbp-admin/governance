import { supabase } from "@/lib/supabase/client";
import { notifyAttention } from "@/lib/supabase/attention-notifications";

export type TensionCommentEntry = {
  id: string;
  tensionId: string;
  authorId: string;
  body: string;
  mentionedIds: string[];
  createdAt: string;
  updatedAt: string | null;
};

export async function loadTensionComments(tensionId: string): Promise<TensionCommentEntry[]> {
  const rich = await supabase
    .from("tension_comments")
    .select("id,tension_id,author_id,body,mentioned_ids,created_at,updated_at")
    .eq("tension_id", tensionId)
    .order("created_at", { ascending: true });

  if (!rich.error) {
    return (rich.data ?? []).map((row) => ({
      id: row.id as string,
      tensionId: row.tension_id as string,
      authorId: row.author_id as string,
      body: row.body as string,
      mentionedIds: (row.mentioned_ids as string[] | null) ?? [],
      createdAt: row.created_at as string,
      updatedAt: (row.updated_at as string | null) ?? null,
    }));
  }

  if (!isOptionalSchemaError(rich.error)) throw rich.error;

  const current = await supabase
    .from("tension_comments")
    .select("id,tension_id,author_id,body,mentioned_ids,created_at")
    .eq("tension_id", tensionId)
    .order("created_at", { ascending: true });
  if (!current.error) {
    return (current.data ?? []).map((row) => ({
      id: row.id as string,
      tensionId: row.tension_id as string,
      authorId: row.author_id as string,
      body: row.body as string,
      mentionedIds: (row.mentioned_ids as string[] | null) ?? [],
      createdAt: row.created_at as string,
      updatedAt: null,
    }));
  }
  if (!isOptionalSchemaError(current.error)) throw current.error;

  const legacy = await supabase
    .from("tension_comments")
    .select("id,tension_id,author_id,body,created_at")
    .eq("tension_id", tensionId)
    .order("created_at", { ascending: true });
  if (legacy.error) throw legacy.error;

  return (legacy.data ?? []).map((row) => ({
    id: row.id as string,
    tensionId: row.tension_id as string,
    authorId: row.author_id as string,
    body: row.body as string,
    mentionedIds: [],
    createdAt: row.created_at as string,
    updatedAt: null,
  }));
}

export async function addTensionComment(tensionId: string, body: string, mentionedIds: string[] = []) {
  const result = await supabase.rpc("add_tension_comment", {
    target_tension_id: tensionId,
    comment_body: body.trim(),
    mention_ids: mentionedIds,
  });
  if (!result.error) {
    if (result.data) await notifyAttention({ kind: "tension_comment", commentId: String(result.data) });
    return;
  }

  // Before migration 0015, non-mentioned comments can still use the existing RPC.
  if (!mentionedIds.length && isMissingRpcSignature(result.error)) {
    const legacy = await supabase.rpc("add_tension_comment", {
      target_tension_id: tensionId,
      comment_body: body.trim(),
    });
    if (legacy.error) throw legacy.error;
    if (legacy.data) await notifyAttention({ kind: "tension_comment", commentId: String(legacy.data) });
    return;
  }

  throw result.error;
}

export async function editTensionComment(commentId: string, body: string, mentionedIds: string[] = []) {
  const { data, error } = await supabase.rpc("edit_tension_comment", {
    target_comment_id: commentId,
    comment_body: body.trim(),
    mention_ids: mentionedIds,
  });
  if (error) throw error;
  const recipientIds = (data ?? []) as string[];
  if (recipientIds.length) await notifyAttention({ kind: "tension_comment", commentId, recipientIds });
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.code === "PGRST204" || /mentioned_ids|does not exist|schema cache/i.test(error.message ?? "");
}

function isMissingRpcSignature(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || /add_tension_comment|function.*does not exist|schema cache/i.test(error.message ?? "");
}
