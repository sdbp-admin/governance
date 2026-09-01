import { supabase } from "@/lib/supabase/client";

export type AttentionNotificationRequest =
  | { tensionId: string }
  | { kind: "board_post"; postId: string }
  | { kind: "board_post_comment"; commentId: string }
  | { kind: "project_comment"; commentId: string }
  | { kind: "tension_comment"; commentId: string }
  | { kind: "action_proposed"; recipientId: string; title: string; context?: string }
  | { kind: "tension_poll"; tensionId: string }
  | { kind: "meeting_poll"; pollId: string }
  | { kind: "governance_consent"; proposalId: string };

export async function notifyAttention(request: AttentionNotificationRequest) {
  try {
    const { data, error } = await supabase.functions.invoke("tension-notify", { body: request });
    if (error) throw error;
    if (data && typeof data === "object" && "error" in data && data.error) {
      throw new Error(String(data.error));
    }
    return true;
  } catch (error) {
    console.warn("Attention email notification failed", error);
    showNotificationWarning();
    return false;
  }
}

function showNotificationWarning() {
  if (typeof document === "undefined") return;
  const id = "sdbp-email-notification-warning";
  document.getElementById(id)?.remove();
  const warning = document.createElement("div");
  warning.id = id;
  warning.className = "save-toast";
  warning.setAttribute("role", "status");
  warning.textContent = "Saved, but the email notification could not be sent.";
  document.body.appendChild(warning);
  window.setTimeout(() => warning.remove(), 6000);
}
