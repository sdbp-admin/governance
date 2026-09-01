import { supabase } from "@/lib/supabase/client";
import { notifyAttention } from "@/lib/supabase/attention-notifications";

export type ProjectCommentEntry = {
  id: string;
  projectId: string;
  authorId: string;
  body: string;
  mentionedIds: string[];
  createdAt: string;
};

type ProjectCommentRow = {
  id: string;
  project_id: string;
  author_id: string;
  body: string;
  mentioned_ids?: string[] | null;
  created_at: string;
};

export async function loadProjectComments(projectId: string): Promise<ProjectCommentEntry[]> {
  const result = await supabase
    .from("project_comments")
    .select("id,project_id,author_id,body,mentioned_ids,created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (result.error) {
    if (!isOptionalSchemaError(result.error)) throw result.error;
    const legacy = await supabase
      .from("project_comments")
      .select("id,project_id,author_id,body,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (legacy.error) throw legacy.error;
    return ((legacy.data ?? []) as ProjectCommentRow[]).map(mapComment);
  }

  return ((result.data ?? []) as ProjectCommentRow[]).map(mapComment);
}

export async function addProjectComment(projectId: string, body: string, mentionedIds: string[] = []) {
  const result = await supabase.rpc("add_project_comment", {
    target_project_id: projectId,
    comment_body: body.trim(),
    mention_ids: mentionedIds,
  });

  if (!result.error) {
    if (result.data) await notifyAttention({ kind: "project_comment", commentId: String(result.data) });
    return;
  }

  if (mentionedIds.length === 0 && isOptionalFunctionError(result.error)) {
    const legacy = await supabase.rpc("add_project_comment", {
      target_project_id: projectId,
      comment_body: body.trim(),
    });
    if (!legacy.error) {
      if (legacy.data) await notifyAttention({ kind: "project_comment", commentId: String(legacy.data) });
      return;
    }
    throw legacy.error;
  }

  throw result.error;
}

function mapComment(row: ProjectCommentRow): ProjectCommentEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    authorId: row.author_id,
    body: row.body,
    mentionedIds: row.mentioned_ids ?? [],
    createdAt: row.created_at,
  };
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || /does not exist|schema cache/i.test(error.message ?? "");
}

function isOptionalFunctionError(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || /function .*add_project_comment|schema cache/i.test(error.message ?? "");
}
