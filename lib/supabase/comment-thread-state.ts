import { supabase } from "@/lib/supabase/client";

export type CommentThreadType = "project" | "tension";

export type CommentThreadSummary = {
  totalCount: number;
  unreadCount: number;
  lastSeenAt: string | null;
};

export async function loadCommentThreadSummary(threadType: CommentThreadType, threadId: string): Promise<CommentThreadSummary> {
  const { data, error } = await supabase.rpc("load_comment_thread_summary", {
    target_thread_type: threadType,
    target_thread_id: threadId,
  });

  if (error) {
    if (isOptionalFunctionError(error)) return { totalCount: 0, unreadCount: 0, lastSeenAt: null };
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    totalCount: Number(row?.total_count ?? 0),
    unreadCount: Number(row?.unread_count ?? 0),
    lastSeenAt: (row?.last_seen_at as string | null | undefined) ?? null,
  };
}

export async function markCommentThreadSeen(threadType: CommentThreadType, threadId: string) {
  const { data, error } = await supabase.rpc("mark_comment_thread_seen", {
    target_thread_type: threadType,
    target_thread_id: threadId,
  });
  if (error) {
    if (isOptionalFunctionError(error)) return null;
    throw error;
  }
  window.dispatchEvent(new CustomEvent("comment-thread-seen", { detail: { threadType, threadId } }));
  return (data as string | null) ?? null;
}

export function announceCommentThreadChange(threadType: CommentThreadType, threadId: string) {
  window.dispatchEvent(new CustomEvent("comment-thread-changed", { detail: { threadType, threadId } }));
}

function isOptionalFunctionError(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || /load_comment_thread_summary|mark_comment_thread_seen|schema cache|does not exist/i.test(error.message ?? "");
}
