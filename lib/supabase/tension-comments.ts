import { supabase } from "@/lib/supabase/client";

export type TensionCommentEntry = {
  id: string;
  tensionId: string;
  authorId: string;
  body: string;
  createdAt: string;
};

export async function loadTensionComments(tensionId: string): Promise<TensionCommentEntry[]> {
  const { data, error } = await supabase
    .from("tension_comments")
    .select("id,tension_id,author_id,body,created_at")
    .eq("tension_id", tensionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    tensionId: row.tension_id as string,
    authorId: row.author_id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
  }));
}

export async function addTensionComment(tensionId: string, body: string) {
  const { error } = await supabase.rpc("add_tension_comment", { target_tension_id: tensionId, comment_body: body.trim() });
  if (error) throw error;
}
