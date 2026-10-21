import { supabase } from "@/lib/supabase/client";

export type CommentThreadType = "project" | "tension" | "action";

export type CommentThreadSummary = {
  totalCount: number;
  unreadCount: number;
  lastSeenAt: string | null;
};


export type CommentThreadDescriptor = { kind: CommentThreadType; sourceId: string };

// One authenticated request per snapshot instead of one request per thread.
// Uses the same author exclusion and last-seen cursor as load_comment_thread_summary.
export async function loadCommentThreadSummaries(threads: CommentThreadDescriptor[]): Promise<Map<string, CommentThreadSummary>> {
  const selected = {
    project: new Set<string>(),
    tension: new Set<string>(),
    action: new Set<string>(),
  };
  for (const thread of threads) selected[thread.kind].add(thread.sourceId);
  if (!selected.project.size && !selected.tension.size && !selected.action.size) return new Map();

  const { data, error } = await supabase.rpc("load_comment_thread_summaries", {
    project_ids: [...selected.project],
    tension_ids: [...selected.tension],
    action_ids: [...selected.action],
  });
  if (error) throw error;

  const summaries = new Map<string, CommentThreadSummary>();
  for (const row of data ?? []) {
    const threadType = row.thread_type as CommentThreadType;
    const threadId = row.thread_id as string;
    summaries.set(`${threadType}:${threadId}`, {
      totalCount: Number(row.total_count ?? 0),
      unreadCount: Number(row.unread_count ?? 0),
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
    });
  }
  return summaries;
}

// Concurrent widgets requesting the same thread share one network request.
const pendingSummaries = new Map<string, Promise<CommentThreadSummary>>();

export function loadCommentThreadSummary(threadType: CommentThreadType, threadId: string): Promise<CommentThreadSummary> {
  const key = `${threadType}:${threadId}`;
  const existing = pendingSummaries.get(key);
  if (existing) return existing;
  const request = fetchCommentThreadSummary(threadType, threadId).finally(() => pendingSummaries.delete(key));
  pendingSummaries.set(key, request);
  return request;
}

async function fetchCommentThreadSummary(threadType: CommentThreadType, threadId: string): Promise<CommentThreadSummary> {
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
