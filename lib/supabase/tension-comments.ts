import { supabase } from "@/lib/supabase/client";

export type TensionCommentEntry = {
  id: string;
  tensionId: string;
  authorId: string;
  body: string;
  mentionedIds: string[];
  createdAt: string;
};

export async function loadTensionComments(tensionId: string): Promise<TensionCommentEntry[]> {
  const rich = await supabase
    .from("tension_comments")
    .select("id,tension_id,author_id,body,mentioned_ids,created_at")
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
    }));
  }

  if (!isOptionalSchemaError(rich.error)) throw rich.error;

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
  }));
}

export async function addTensionComment(tensionId: string, body: string, mentionedIds: string[] = []) {
  const { error } = await supabase.rpc("add_tension_comment", {
    target_tension_id: tensionId,
    comment_body: body.trim(),
    mention_ids: mentionedIds,
  });
  if (!error) return;

  // Before migration 0015, non-mentioned comments can still use the existing RPC.
  if (!mentionedIds.length && isMissingRpcSignature(error)) {
    const { error: legacyError } = await supabase.rpc("add_tension_comment", {
      target_tension_id: tensionId,
      comment_body: body.trim(),
    });
    if (legacyError) throw legacyError;
    return;
  }

  throw error;
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.code === "PGRST204" || /mentioned_ids|does not exist|schema cache/i.test(error.message ?? "");
}

function isMissingRpcSignature(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || /add_tension_comment|function.*does not exist|schema cache/i.test(error.message ?? "");
}
