"use client";

import { useCallback, useEffect, useState } from "react";
import { loadCommentThreadSummary, type CommentThreadType } from "@/lib/supabase/comment-thread-state";

export function CommentThreadButton({ threadType, threadId, onOpen }: {
  threadType: CommentThreadType;
  threadId: string;
  onOpen: () => void;
}) {
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const summary = await loadCommentThreadSummary(threadType, threadId);
      setTotal(summary.totalCount);
      setUnread(summary.unreadCount);
    } catch {
      // Comment access itself should keep working even if the summary cannot load.
    }
  }, [threadId, threadType]);

  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    const onThreadEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ threadType?: CommentThreadType; threadId?: string }>).detail;
      if (!detail || (detail.threadType === threadType && detail.threadId === threadId)) void refresh();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("comment-thread-seen", onThreadEvent);
    window.addEventListener("comment-thread-changed", onThreadEvent);
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("comment-thread-seen", onThreadEvent);
      window.removeEventListener("comment-thread-changed", onThreadEvent);
      window.clearInterval(timer);
    };
  }, [refresh, threadId, threadType]);

  return <button className={`quiet small comment-thread-button${unread > 0 ? " has-unread" : ""}`} type="button" onClick={onOpen}>
    <span>Comments{total > 0 ? ` ${total}` : ""}</span>
    {unread > 0 && <span className="comment-unread-badge"><i aria-hidden="true" />{unread} new</span>}
  </button>;
}
