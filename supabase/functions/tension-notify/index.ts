import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PersonRow = {
  id: string;
  name: string;
  email: string;
  governance_available?: boolean;
};

type TensionRow = {
  id: string;
  title: string;
  raiser_id: string;
  status: "open" | "awaiting_confirmation" | "resolved" | "needs_sync" | "governance";
  resolution_proposed_by: string | null;
  latest_note: string | null;
};

type Delivery = {
  recipient: PersonRow;
  subject: string;
  body: string;
};

type NotificationPayload = {
  tensionId?: string;
  kind?:
    | "board_post"
    | "board_post_comment"
    | "project_comment"
    | "tension_comment"
    | "action_proposed"
    | "tension_poll"
    | "meeting_poll"
    | "governance_consent";
  postId?: string;
  commentId?: string;
  recipientId?: string;
  title?: string;
  context?: string;
  pollId?: string;
  proposalId?: string;
};

type SupabaseClient = ReturnType<typeof createClient>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required." }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
    const smtpUser = requiredEnv("SMTP_USER");
    const smtpPassword = requiredEnv("SMTP_APP_PASSWORD");
    const smtpFromName = Deno.env.get("SMTP_FROM_NAME")?.trim() || "SDBP Workspace";
    const appUrl = Deno.env.get("APP_URL")?.trim() || "https://sdbp-admin.github.io/governance/";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required." }, 401);

    const { data: actor, error: actorError } = await supabase
      .from("people")
      .select("id,name,email")
      .eq("auth_user_id", userData.user.id)
      .eq("active", true)
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actor) return json({ error: "Active workspace membership required." }, 403);

    const payload = await req.json().catch(() => ({})) as NotificationPayload;
    let deliveries: Delivery[];

    if (payload.kind) {
      deliveries = await buildAttentionDeliveries(supabase, actor as PersonRow, payload, appUrl);
    } else if (payload.tensionId) {
      deliveries = await buildLegacyTensionDeliveries(supabase, actor as PersonRow, payload.tensionId, appUrl);
    } else {
      return json({ error: "A notification kind or tensionId is required." }, 400);
    }

    const unique = dedupeDeliveries(deliveries).filter((delivery) => delivery.recipient.id !== actor.id);
    for (const delivery of unique) {
      await sendMail({
        smtpUser,
        smtpPassword,
        fromName: smtpFromName,
        to: delivery.recipient.email,
        subject: delivery.subject,
        body: delivery.body,
      });
    }

    return json({ sent: unique.length });
  } catch (error) {
    console.error("attention notification failed", error);
    return json({ error: error instanceof Error ? error.message : "Notification failed." }, 500);
  }
});

async function buildAttentionDeliveries(
  supabase: SupabaseClient,
  actor: PersonRow,
  payload: NotificationPayload,
  appUrl: string,
): Promise<Delivery[]> {
  if (payload.kind === "board_post") {
    if (!payload.postId) throw new Error("postId is required.");
    const { data: post, error } = await supabase.from("board_posts").select("id,author_id,mentioned_ids").eq("id", payload.postId).maybeSingle();
    if (error) throw error;
    if (!post || post.author_id !== actor.id) return [];
    const recipients = await peopleByIds(supabase, (post.mentioned_ids as string[] | null) ?? []);
    return attentionDeliveries(recipients, actor, "Board Feed mention", `${actor.name} mentioned you in the Board Feed.`, appUrl);
  }

  if (payload.kind === "board_post_comment") {
    if (!payload.commentId) throw new Error("commentId is required.");
    const { data: comment, error } = await supabase.from("board_post_comments").select("id,author_id,mentioned_ids").eq("id", payload.commentId).maybeSingle();
    if (error) throw error;
    if (!comment || comment.author_id !== actor.id) return [];
    const recipients = await peopleByIds(supabase, (comment.mentioned_ids as string[] | null) ?? []);
    return attentionDeliveries(recipients, actor, "Board Feed comment", `${actor.name} mentioned you in a Board Feed comment.`, appUrl);
  }

  if (payload.kind === "project_comment") {
    if (!payload.commentId) throw new Error("commentId is required.");
    const { data: comment, error } = await supabase.from("project_comments").select("id,project_id,author_id,mentioned_ids").eq("id", payload.commentId).maybeSingle();
    if (error) throw error;
    if (!comment || comment.author_id !== actor.id) return [];
    const { data: project, error: projectError } = await supabase.from("projects").select("id,title,owner_id").eq("id", comment.project_id).maybeSingle();
    if (projectError) throw projectError;
    if (!project) return [];
    const ids = uniqueIds([project.owner_id as string, ...(((comment.mentioned_ids as string[] | null) ?? []))]);
    const recipients = await peopleByIds(supabase, ids);
    return attentionDeliveries(recipients, actor, `Project · ${project.title}`, `${actor.name} added a comment that needs your attention.`, appUrl);
  }

  if (payload.kind === "tension_comment") {
    if (!payload.commentId) throw new Error("commentId is required.");
    const { data: comment, error } = await supabase.from("tension_comments").select("id,tension_id,author_id,mentioned_ids").eq("id", payload.commentId).maybeSingle();
    if (error) throw error;
    if (!comment || comment.author_id !== actor.id) return [];
    const { data: tension, error: tensionError } = await supabase.from("tensions").select("id,title,raiser_id").eq("id", comment.tension_id).maybeSingle();
    if (tensionError) throw tensionError;
    if (!tension) return [];
    const ids = uniqueIds([tension.raiser_id as string, ...(((comment.mentioned_ids as string[] | null) ?? []))]);
    const recipients = await peopleByIds(supabase, ids);
    return attentionDeliveries(recipients, actor, `Tension · ${tension.title}`, `${actor.name} added a comment that needs your attention.`, appUrl);
  }

  if (payload.kind === "action_proposed") {
    if (!payload.recipientId || !payload.title) throw new Error("recipientId and title are required.");
    const recipients = await peopleByIds(supabase, [payload.recipientId]);
    const context = payload.context?.trim() ? `${payload.context.trim()}\n\n` : "";
    return recipients.map((recipient) => ({
      recipient,
      subject: "SDBP Workspace - next step proposed",
      body: [
        `${recipient.name},`,
        "",
        `${actor.name} proposed a next step to you:`,
        "",
        payload.title!.trim(),
        "",
        context.trimEnd(),
        "Open My Attention to review or accept it:",
        appUrl,
      ].filter((line) => line !== "").join("\n"),
    }));
  }

  if (payload.kind === "tension_poll") {
    if (!payload.tensionId) throw new Error("tensionId is required.");
    const { data: poll, error } = await supabase.from("tension_polls").select("id,tension_id,created_by").eq("tension_id", payload.tensionId).maybeSingle();
    if (error) throw error;
    if (!poll || poll.created_by !== actor.id) return [];
    const { data: tension, error: tensionError } = await supabase.from("tensions").select("id,title").eq("id", payload.tensionId).maybeSingle();
    if (tensionError) throw tensionError;
    const { data: participantRows, error: participantError } = await supabase.from("tension_poll_participants").select("person_id").eq("poll_id", poll.id);
    if (participantError) throw participantError;
    const recipients = await peopleByIds(supabase, (participantRows ?? []).map((row) => row.person_id as string));
    return attentionDeliveries(recipients, actor, `Availability needed · ${tension?.title ?? "Conversation"}`, `${actor.name} created an availability poll for a conversation that needs you.`, appUrl);
  }

  if (payload.kind === "meeting_poll") {
    if (!payload.pollId) throw new Error("pollId is required.");
    const { data: poll, error } = await supabase.from("meeting_polls").select("id,title,created_by").eq("id", payload.pollId).maybeSingle();
    if (error) throw error;
    if (!poll || poll.created_by !== actor.id) return [];
    const { data: participantRows, error: participantError } = await supabase.from("meeting_poll_participants").select("person_id").eq("poll_id", payload.pollId);
    if (participantError) throw participantError;
    const recipients = await peopleByIds(supabase, (participantRows ?? []).map((row) => row.person_id as string));
    return attentionDeliveries(recipients, actor, `Availability needed · ${poll.title}`, `${actor.name} asked for your availability for a board meeting.`, appUrl);
  }

  if (payload.kind === "governance_consent") {
    if (!payload.proposalId) throw new Error("proposalId is required.");
    const { data: round, error } = await supabase.from("governance_consent_rounds").select("proposal_id,started_by,status").eq("proposal_id", payload.proposalId).maybeSingle();
    if (error) throw error;
    if (!round || round.started_by !== actor.id || round.status !== "open") return [];
    const { data: proposal, error: proposalError } = await supabase.from("governance_proposals").select("id,title").eq("id", payload.proposalId).maybeSingle();
    if (proposalError) throw proposalError;
    const recipients = await activeGovernancePeople(supabase);
    return attentionDeliveries(recipients, actor, `Governance response needed · ${proposal?.title ?? "Proposal"}`, `${actor.name} started quick consent. Your explicit response is required.`, appUrl);
  }

  throw new Error("Unknown notification kind.");
}

async function buildLegacyTensionDeliveries(
  supabase: SupabaseClient,
  actor: PersonRow,
  tensionId: string,
  appUrl: string,
): Promise<Delivery[]> {
  const { data: tension, error: tensionError } = await supabase
    .from("tensions")
    .select("id,title,raiser_id,status,resolution_proposed_by,latest_note")
    .eq("id", tensionId)
    .maybeSingle();
  if (tensionError) throw tensionError;
  if (!tension) return [];
  const item = tension as TensionRow;

  if (item.status === "awaiting_confirmation" && item.resolution_proposed_by === actor.id && item.raiser_id !== actor.id) {
    const recipients = await peopleByIds(supabase, [item.raiser_id]);
    return recipients.map((recipient) => ({
      recipient,
      subject: "SDBP Workspace - resolution check",
      body: [
        `${recipient.name},`,
        "",
        `${actor.name} believes a tension you raised is resolved:`,
        "",
        item.title,
        "",
        "Please check the current situation and confirm whether you got what you needed.",
        "",
        `Open My Attention: ${appUrl}`,
      ].join("\n"),
    }));
  }

  if ((item.status === "open" || item.status === "needs_sync") && item.raiser_id === actor.id) {
    const { data: signals, error: signalError } = await supabase
      .from("attention_signals")
      .select("recipient_id")
      .eq("tension_id", tensionId)
      .eq("signal_type", "tension_need")
      .eq("created_by", actor.id)
      .is("acknowledged_at", null);
    if (signalError) throw signalError;

    let recipients = await peopleByIds(supabase, (signals ?? []).map((signal) => signal.recipient_id as string));
    if (!recipients.length) {
      const parsed = parseNeed(item.latest_note);
      if (!parsed) return [];
      const { data: people, error: peopleError } = await supabase.from("people").select("id,name,email").eq("active", true).in("name", parsed.names);
      if (peopleError) throw peopleError;
      recipients = (people ?? []) as PersonRow[];
    }

    const conversation = item.status === "needs_sync";
    return recipients.map((recipient) => ({
      recipient,
      subject: conversation ? "SDBP Workspace - conversation needed" : "SDBP Workspace - input needed",
      body: [
        `${recipient.name},`,
        "",
        "A tension needs your attention:",
        "",
        item.title,
        "",
        conversation
          ? `${actor.name} indicated that a real conversation with you is needed.`
          : `${actor.name} indicated that your input or help is needed.`,
        "",
        `Open My Attention: ${appUrl}`,
      ].join("\n"),
    }));
  }

  return [];
}

function attentionDeliveries(recipients: PersonRow[], actor: PersonRow, subjectContext: string, message: string, appUrl: string): Delivery[] {
  return recipients.map((recipient) => ({
    recipient,
    subject: `SDBP Workspace - ${subjectContext}`,
    body: [
      `${recipient.name},`,
      "",
      message,
      "",
      "Open My Attention to see the context and respond:",
      appUrl,
    ].join("\n"),
  }));
}

async function peopleByIds(supabase: SupabaseClient, ids: string[]) {
  const clean = uniqueIds(ids);
  if (!clean.length) return [] as PersonRow[];
  const { data, error } = await supabase.from("people").select("id,name,email").eq("active", true).in("id", clean);
  if (error) throw error;
  return (data ?? []) as PersonRow[];
}

async function activeGovernancePeople(supabase: SupabaseClient) {
  const rich = await supabase.from("people").select("id,name,email,governance_available").eq("active", true);
  if (!rich.error) return ((rich.data ?? []) as PersonRow[]).filter((person) => person.governance_available !== false);
  if (!/governance_available|does not exist|schema cache/i.test(rich.error.message ?? "")) throw rich.error;
  const legacy = await supabase.from("people").select("id,name,email").eq("active", true);
  if (legacy.error) throw legacy.error;
  return (legacy.data ?? []) as PersonRow[];
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

function dedupeDeliveries(deliveries: Delivery[]) {
  const byRecipient = new Map<string, Delivery>();
  for (const delivery of deliveries) byRecipient.set(delivery.recipient.id, delivery);
  return [...byRecipient.values()];
}

function parseNeed(note: string | null) {
  if (!note) return null;
  const inputPrefix = "Needs input or help from ";
  const conversationPrefix = "Needs a real conversation with ";
  let rest: string;
  if (note.startsWith(inputPrefix)) rest = note.slice(inputPrefix.length);
  else if (note.startsWith(conversationPrefix)) rest = note.slice(conversationPrefix.length);
  else return null;
  const namesPart = rest.split(" — ", 1)[0].replace(/\.$/, "").trim();
  const names = namesPart.split(",").map((name) => name.trim()).filter(Boolean);
  return { names };
}

async function sendMail(input: {
  smtpUser: string;
  smtpPassword: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
}) {
  const conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });
  const smtp = new SmtpConnection(conn);

  try {
    await smtp.expect(220);
    await smtp.command("EHLO sdbp-workspace", 250);
    await smtp.command("AUTH LOGIN", 334);
    await smtp.command(btoa(input.smtpUser), 334);
    await smtp.command(btoa(input.smtpPassword), 235);
    await smtp.command(`MAIL FROM:<${input.smtpUser}>`, 250);
    await smtp.command(`RCPT TO:<${input.to}>`, [250, 251]);
    await smtp.command("DATA", 354);

    const body = input.body.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
    const message = [
      `From: ${sanitizeHeader(input.fromName)} <${input.smtpUser}>`,
      `To: <${input.to}>`,
      `Subject: ${sanitizeHeader(input.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      body,
      ".",
      "",
    ].join("\r\n");

    await smtp.write(message);
    await smtp.expect(250);
    await smtp.command("QUIT", 221);
  } finally {
    conn.close();
  }
}

class SmtpConnection {
  private buffer = "";
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();

  constructor(private readonly conn: Deno.TlsConn) {}

  async command(command: string, expected: number | number[]) {
    await this.write(`${command}\r\n`);
    await this.expect(expected);
  }

  async write(value: string) {
    const data = this.encoder.encode(value);
    let offset = 0;
    while (offset < data.length) offset += await this.conn.write(data.subarray(offset));
  }

  async expect(expected: number | number[]) {
    const reply = await this.readReply();
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(reply.code)) throw new Error(`SMTP ${reply.code}: ${reply.text}`);
  }

  private async readReply() {
    const lines: string[] = [];
    let code: string | null = null;
    while (true) {
      const line = await this.readLine();
      lines.push(line);
      const match = line.match(/^(\d{3})([ -])/);
      if (!match) continue;
      if (!code) code = match[1];
      if (match[1] === code && match[2] === " ") return { code: Number(code), text: lines.join("\n") };
    }
  }

  private async readLine(): Promise<string> {
    while (true) {
      const newline = this.buffer.indexOf("\n");
      if (newline >= 0) {
        const line = this.buffer.slice(0, newline).replace(/\r$/, "");
        this.buffer = this.buffer.slice(newline + 1);
        return line;
      }
      const chunk = new Uint8Array(4096);
      const read = await this.conn.read(chunk);
      if (read === null) throw new Error("SMTP connection closed unexpectedly.");
      this.buffer += this.decoder.decode(chunk.subarray(0, read), { stream: true });
    }
  }
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
