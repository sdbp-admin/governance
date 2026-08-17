import { supabase } from "@/lib/supabase/client";

export type BoardFeedComment = {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  mentionedIds: string[];
  createdAt: string;
  editedAt?: string;
};

export type BoardFeedPost = {
  id: string;
  authorId: string;
  body: string;
  mentionedIds: string[];
  pinned: boolean;
  pinnedBy?: string;
  pinnedAt?: string;
  createdAt: string;
  editedAt?: string;
  comments: BoardFeedComment[];
};

export type CommunicationAttentionSignal = {
  id: string;
  recipientId: string;
  tensionId?: string;
  boardPostId?: string;
  signalType: "tension_comment" | "board_feed_mention";
  message: string;
  createdBy?: string;
  createdAt: string;
};

type PostRow = {
  id: string;
  author_id: string;
  body: string;
  mentioned_ids: string[] | null;
  is_pinned: boolean;
  pinned_by: string | null;
  pinned_at: string | null;
  created_at: string;
  edited_at: string | null;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  mentioned_ids: string[] | null;
  created_at: string;
  edited_at: string | null;
};

export async function loadBoardFeed(): Promise<BoardFeedPost[]> {
  const [postsResult, commentsResult] = await Promise.all([
    supabase.from("board_posts").select("id,author_id,body,mentioned_ids,is_pinned,pinned_by,pinned_at,created_at,edited_at").order("is_pinned", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("board_post_comments").select("id,post_id,author_id,body,mentioned_ids,created_at,edited_at").order("created_at", { ascending: true }),
  ]);
  const error = postsResult.error || commentsResult.error;
  if (error) throw error;
  const comments = (commentsResult.data ?? []) as CommentRow[];
  return ((postsResult.data ?? []) as PostRow[]).map((row) => ({
    id: row.id,
    authorId: row.author_id,
    body: row.body,
    mentionedIds: row.mentioned_ids ?? [],
    pinned: row.is_pinned,
    pinnedBy: row.pinned_by ?? undefined,
    pinnedAt: row.pinned_at ?? undefined,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? undefined,
    comments: comments.filter((comment) => comment.post_id === row.id).map((comment) => ({
      id: comment.id,
      postId: comment.post_id,
      authorId: comment.author_id,
      body: comment.body,
      mentionedIds: comment.mentioned_ids ?? [],
      createdAt: comment.created_at,
      editedAt: comment.edited_at ?? undefined,
    })),
  }));
}

export async function createBoardPost(body: string, mentionIds: string[]) {
  const { error } = await supabase.rpc("create_board_post", { post_body: body.trim(), mention_ids: mentionIds });
  if (error) throw error;
}

export async function editBoardPost(postId: string, body: string) {
  const { error } = await supabase.rpc("edit_board_post", { target_post_id: postId, post_body: body.trim() });
  if (error) throw error;
}

export async function addBoardPostComment(postId: string, body: string, mentionIds: string[]) {
  const { error } = await supabase.rpc("add_board_post_comment", { target_post_id: postId, comment_body: body.trim(), mention_ids: mentionIds });
  if (error) throw error;
}

export async function editBoardPostComment(commentId: string, body: string) {
  const { error } = await supabase.rpc("edit_board_post_comment", { target_comment_id: commentId, comment_body: body.trim() });
  if (error) throw error;
}

export async function setBoardPostPinned(postId: string, pinned: boolean) {
  const { error } = await supabase.rpc("set_board_post_pinned", { target_post_id: postId, pinned });
  if (error) throw error;
}

export async function loadCommunicationAttentionSignals(): Promise<CommunicationAttentionSignal[]> {
  const { data, error } = await supabase
    .from("attention_signals")
    .select("id,recipient_id,tension_id,board_post_id,signal_type,message,created_by,created_at")
    .in("signal_type", ["tension_comment", "board_feed_mention"])
    .is("acknowledged_at", null)
    .order("created_at", { ascending: false });
  if (error) {
    if (isOptionalSchemaError(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    recipientId: row.recipient_id as string,
    tensionId: (row.tension_id as string | null) ?? undefined,
    boardPostId: (row.board_post_id as string | null) ?? undefined,
    signalType: row.signal_type as CommunicationAttentionSignal["signalType"],
    message: row.message as string,
    createdBy: (row.created_by as string | null) ?? undefined,
    createdAt: row.created_at as string,
  }));
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "42703" || error.code === "PGRST204" || /board_post|tension_comment|schema cache|does not exist/i.test(error.message ?? "");
}
