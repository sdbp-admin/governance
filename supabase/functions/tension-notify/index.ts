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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required." }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const supabaseAnonKey = requiredEnv("SUPABASE_ANON_KEY");
    const smtpUser = requiredEnv("SMTP_USER");
    const smtpPassword = requiredEnv("SMTP_APP_PASSWORD");
    const smtpFromName = Deno.env.get("SMTP_FROM_NAME")?.trim() || "SDBP Governance";
    const appUrl = Deno.env.get("APP_URL")?.trim() || "https://sdbp-admin.github.io/governance/";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Authentication required." }, 401);

    const payload = await req.json().catch(() => ({})) as { tensionId?: string };
    if (!payload.tensionId) return json({ error: "tensionId is required." }, 400);

    const { data: actor, error: actorError } = await supabase
      .from("people")
      .select("id,name,email")
      .eq("auth_user_id", userData.user.id)
      .eq("active", true)
      .maybeSingle();

    if (actorError) throw actorError;
    if (!actor) return json({ error: "Active workspace membership required." }, 403);

    const { data: tension, error: tensionError } = await supabase
      .from("tensions")
      .select("id,title,raiser_id,status,resolution_proposed_by,latest_note")
      .eq("id", payload.tensionId)
      .maybeSingle();

    if (tensionError) throw tensionError;
    if (!tension) return json({ error: "Tension not found." }, 404);

    const deliveries = await buildDeliveries(supabase, actor as PersonRow, tension as TensionRow, appUrl);

    for (const delivery of deliveries) {
      await sendMail({
        smtpUser,
        smtpPassword,
        fromName: smtpFromName,
        to: delivery.recipient.email,
        subject: delivery.subject,
        body: delivery.body,
      });
    }

    return json({ sent: deliveries.length });
  } catch (error) {
    console.error("tension-notify failed", error);
    return json({ error: error instanceof Error ? error.message : "Notification failed." }, 500);
  }
});

async function buildDeliveries(
  supabase: ReturnType<typeof createClient>,
  actor: PersonRow,
  tension: TensionRow,
  appUrl: string,
): Promise<Delivery[]> {
  if (
    tension.status === "awaiting_confirmation" &&
    tension.resolution_proposed_by === actor.id &&
    tension.raiser_id !== actor.id
  ) {
    const { data: recipient, error } = await supabase
      .from("people")
      .select("id,name,email")
      .eq("id", tension.raiser_id)
      .eq("active", true)
      .maybeSingle();

    if (error) throw error;
    if (!recipient) return [];

    return [{
      recipient: recipient as PersonRow,
      subject: "SDBP Governance - resolution check",
      body: [
        `${recipient.name},`,
        "",
        `${actor.name} believes a tension you raised is resolved:`,
        "",
        tension.title,
        "",
        "Please check the current situation and confirm whether you got what you needed.",
        "",
        `Open SDBP Governance: ${appUrl}`,
      ].join("\n"),
    }];
  }

  if ((tension.status === "open" || tension.status === "needs_sync") && tension.raiser_id === actor.id) {
    const need = parseNeed(tension.latest_note);
    if (!need || !need.names.length) return [];

    const { data: people, error } = await supabase
      .from("people")
      .select("id,name,email")
      .eq("active", true)
      .in("name", need.names);

    if (error) throw error;

    return ((people ?? []) as PersonRow[])
      .filter((person) => person.id !== actor.id)
      .map((recipient) => ({
        recipient,
        subject: need.kind === "conversation"
          ? "SDBP Governance - conversation needed"
          : "SDBP Governance - input needed",
        body: [
          `${recipient.name},`,
          "",
          "A tension needs your attention:",
          "",
          tension.title,
          "",
          need.kind === "conversation"
            ? `${actor.name} indicated that a real conversation with you is needed.`
            : `${actor.name} indicated that your input or help is needed.`,
          "",
          `Open SDBP Governance to see the current context: ${appUrl}`,
          "",
          "Handle the actual conversation however is easiest; the app keeps the shared context visible.",
        ].join("\n"),
      }));
  }

  return [];
}

function parseNeed(note: string | null) {
  if (!note) return null;

  const inputPrefix = "Needs input or help from ";
  const conversationPrefix = "Needs a real conversation with ";

  let kind: "input" | "conversation";
  let rest: string;

  if (note.startsWith(inputPrefix)) {
    kind = "input";
    rest = note.slice(inputPrefix.length);
  } else if (note.startsWith(conversationPrefix)) {
    kind = "conversation";
    rest = note.slice(conversationPrefix.length);
  } else {
    return null;
  }

  const namesPart = rest.split(" — ", 1)[0].replace(/\.$/, "").trim();
  const names = namesPart.split(",").map((name) => name.trim()).filter(Boolean);
  return { kind, names };
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
    await smtp.command("EHLO sdbp-governance", 250);
    await smtp.command("AUTH LOGIN", 334);
    await smtp.command(btoa(input.smtpUser), 334);
    await smtp.command(btoa(input.smtpPassword), 235);
    await smtp.command(`MAIL FROM:<${input.smtpUser}>`, 250);
    await smtp.command(`RCPT TO:<${input.to}>`, [250, 251]);
    await smtp.command("DATA", 354);

    const body = input.body
      .replace(/\r?\n/g, "\r\n")
      .replace(/^\./gm, "..");

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
    while (offset < data.length) {
      offset += await this.conn.write(data.subarray(offset));
    }
  }

  async expect(expected: number | number[]) {
    const reply = await this.readReply();
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!allowed.includes(reply.code)) {
      throw new Error(`SMTP ${reply.code}: ${reply.text}`);
    }
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
      if (match[1] === code && match[2] === " ") {
        return { code: Number(code), text: lines.join("\n") };
      }
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
