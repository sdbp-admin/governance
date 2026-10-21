import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { rawPayload, sendPushNotification } from "npm:@mmmike/web-push@1.3.0/send";

type Client = ReturnType<typeof createClient>;
type Actor = { id: string; name: string };
type Notification = {
  tensionId?: string;
  kind?: string;
  postId?: string;
  commentId?: string;
  recipientId?: string;
  recipientIds?: string[];
  title?: string;
  pollId?: string;
  proposalId?: string;
};
type Recipient = { id: string };
type Intent = { recipientIds: string[]; title: string; body: string; url: string; eventKey?: string };

export async function sendBoardPush(actorClient: Client, actor: Actor, payload: Notification, emailRecipients: Recipient[]) {
  const publicKey = Deno.env.get("BOARD_VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("BOARD_VAPID_PRIVATE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!publicKey || !privateKey || !serviceKey || !url) return { delivered: 0, configured: false };
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const intent = await pushIntent(actorClient, actor, payload, emailRecipients);
  if (!intent || !intent.recipientIds.length) return { delivered: 0, configured: true };

  const { data: subscriptions, error } = await admin.from("board_push_subscriptions")
    .select("endpoint,person_id,p256dh,auth_secret").in("person_id", intent.recipientIds);
  if (error) throw error;
  let delivered = 0;
  for (const row of subscriptions ?? []) {
    if (row.person_id === actor.id) continue;
    const counts = await admin.rpc("board_app_counts", { target_person_id: row.person_id });
    if (counts.error) throw counts.error;
    const value = Array.isArray(counts.data) ? counts.data[0] : counts.data;
    const badgeCount = Number(value?.chat_count ?? 0) + Number(value?.for_me_count ?? 0);
    // A repeated post-write invoke cannot send the same event twice to this device.
    if (intent.eventKey) {
      const claim = await admin.from("board_push_claims").insert({
        event_key: intent.eventKey, recipient_id: row.person_id, endpoint: row.endpoint,
      });
      if (claim.error?.code === "23505") continue;
      if (claim.error) throw claim.error;
    }
    try {
      const sent = await sendPushNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_secret } },
        rawPayload(JSON.stringify({
          title: intent.title, body: intent.body, url: intent.url,
          tag: intent.eventKey || undefined, badgeCount,
        })),
        { publicKey, privateKey, subject: "https://sdbp-admin.github.io" },
      );
      if (sent) delivered++;
      else await admin.from("board_push_subscriptions").delete().eq("endpoint", row.endpoint);
    } catch (reason) {
      console.error("Board push failed", reason instanceof Error ? reason.message : reason);
      if (intent.eventKey) await admin.from("board_push_claims").delete()
        .eq("event_key", intent.eventKey).eq("recipient_id", row.person_id).eq("endpoint", row.endpoint);
    }
  }
  return { delivered, configured: true };
}

async function pushIntent(client: Client, actor: Actor, payload: Notification, emailRecipients: Recipient[]): Promise<Intent | null> {
  const boardUrl = "https://sdbp-admin.github.io/governance/board/";
  if (payload.kind === "board_post" && payload.postId) {
    const { data, error } = await client.from("board_posts").select("id,author_id,body").eq("id", payload.postId).single();
    if (error) throw error;
    if (data.author_id !== actor.id) return null;
    return {
      recipientIds: await activePeopleExcept(client, actor.id), title: "SDBP Chat",
      body: `${actor.name}: ${short(data.body)}`, url: `${boardUrl}?post=${data.id}`,
      eventKey: `board-post:${data.id}`,
    };
  }
  if (payload.kind === "board_post_comment" && payload.commentId) {
    const { data, error } = await client.from("board_post_comments").select("id,post_id,author_id,body").eq("id", payload.commentId).single();
    if (error) throw error;
    if (data.author_id !== actor.id) return null;
    return {
      recipientIds: await activePeopleExcept(client, actor.id), title: "SDBP Chat",
      body: `${actor.name}: ${short(data.body)}`, url: `${boardUrl}?post=${data.post_id}`,
      eventKey: `board-comment:${data.id}`,
    };
  }

  let ids = emailRecipients.map(person => person.id).filter(id => id !== actor.id);
  let eventKey: string | undefined;
  if (payload.commentId && ["project_comment", "tension_comment", "action_comment"].includes(payload.kind ?? "")) {
    const table = payload.kind === "project_comment" ? "project_comments" : payload.kind === "tension_comment" ? "tension_comments" : "action_comments";
    const result = await client.from(table).select("author_id,mentioned_ids").eq("id", payload.commentId).single();
    if (result.error) throw result.error;
    if (result.data.author_id !== actor.id) return null;
    ids = ids.filter(id => (result.data.mentioned_ids ?? []).includes(id));
    eventKey = `${payload.kind}:${payload.commentId}`;
  } else if (payload.kind === "tension_poll" && payload.tensionId) eventKey = `tension-poll:${payload.tensionId}`;
  else if (payload.kind === "meeting_poll" && payload.pollId) eventKey = `meeting-poll:${payload.pollId}`;
  else if (payload.kind === "governance_consent" && payload.proposalId) eventKey = `governance-consent:${payload.proposalId}`;
  else if (payload.kind === "action_proposed" && payload.recipientId) {
    const result = await client.from("actions").select("id").eq("owner_id", payload.recipientId)
      .eq("status", "proposed").eq("title", payload.title ?? "").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return null;
    eventKey = `action-proposed:${result.data.id}`;
  }
  if (!ids.length) return null;
  return {
    recipientIds: [...new Set(ids)], title: "SDBP · For me",
    body: payload.kind === "action_proposed" ? `${actor.name} proposed a commitment for you.`
      : payload.kind === "governance_consent" ? `${actor.name} needs your governance response.`
      : payload.kind === "tension_poll" || payload.kind === "meeting_poll" ? `${actor.name} asked for your availability.`
      : payload.tensionId ? `${actor.name} needs your response on a tension.`
      : `${actor.name} mentioned you in the Workspace.`,
    url: `${boardUrl}?tab=attention`, eventKey,
  };
}

async function activePeopleExcept(client: Client, actorId: string) {
  const { data, error } = await client.from("people").select("id").eq("active", true).neq("id", actorId);
  if (error) throw error;
  return (data ?? []).map(row => row.id as string);
}

function short(text: string) { return text.replace(/\s+/g, " ").trim().slice(0, 120); }
