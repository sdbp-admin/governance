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
  if (error && !isOptionalFunctionError(error)) throw error;

  await acknowledgeCommentAttention(threadType, threadId);
  window.dispatchEvent(new CustomEvent("comment-thread-seen", { detail: { threadType, threadId } }));
  window.dispatchEvent(new Event("focus"));
  return error ? null : (data as string | null) ?? null;
}

export function announceCommentThreadChange(threadType: CommentThreadType, threadId: string) {
  window.dispatchEvent(new CustomEvent("comment-thread-changed", { detail: { threadType, threadId } }));
}

async function acknowledgeCommentAttention(threadType: CommentThreadType, threadId: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) return;

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (personError) throw personError;
  if (!person) return;

  const signalType = threadType === "project" ? "project_comment" : "tension_comment";
  const query = supabase
    .from("attention_signals")
    .select("id")
    .eq("recipient_id", person.id)
    .eq("signal_type", signalType)
    .is("acknowledged_at", null);
  const { data: signals, error: signalError } = threadType === "project"
    ? await query.eq("project_id", threadId)
    : await query.eq("tension_id", threadId);
  if (signalError) throw signalError;

  for (const signal of signals ?? []) {
    const { error: acknowledgeError } = await supabase.rpc("acknowledge_attention_signal", {
      target_signal_id: signal.id,
    });
    if (acknowledgeError && !/Attention item not found/i.test(acknowledgeError.message ?? "")) {
      throw acknowledgeError;
    }
  }
}

function isOptionalFunctionError(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || /load_comment_thread_summary|mark_comment_thread_seen|schema cache|does not exist/i.test(error.message ?? "");
}
