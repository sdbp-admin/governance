import { createClient } from "npm:@supabase/supabase-js@2.111.0";

type Person = { id: string; name: string; email: string };
type Pref = {
  person_id: string; daily_digest_enabled: boolean;
  include_work: boolean; include_conversations: boolean; include_governance: boolean;
};
type Item = { category: "work" | "conversations" | "governance"; title: string; detail: string; destination: string; created_at: string };
const APP = "https://sdbp-admin.github.io/governance/";
const ZONE = "Europe/Ljubljana";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("x-sdbp-cron-token");
  if (!token) return new Response("Forbidden", { status: 403 });
  try {
    const db = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } });
    const check = await db.rpc("validate_governance_deadline_cron_token", { candidate: token });
    if (check.error || check.data !== true) return new Response("Forbidden", { status: 403 });
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const [peopleResult, preferencesResult] = await Promise.all([
      db.from("people").select("id,name,email").eq("active", true),
      db.from("person_notification_preferences").select("person_id,daily_digest_enabled,include_work,include_conversations,include_governance"),
    ]);
    if (peopleResult.error) throw peopleResult.error;
    if (preferencesResult.error) throw preferencesResult.error;
    const prefs = new Map((preferencesResult.data ?? []).map((pref: Pref) => [pref.person_id, pref]));
    let sent = 0, empty = 0, disabled = 0, alreadySent = 0;
    const errors: string[] = [];
    for (const person of (peopleResult.data ?? []) as Person[]) {
      const pref = prefs.get(person.id);
      if (pref?.daily_digest_enabled === false) { disabled++; continue; }
      const response = await db.rpc("get_daily_attention_items", { target_person_id: person.id });
      if (response.error) { errors.push(person.id + ": unable to load attention"); continue; }
      const items = ((response.data ?? []) as Item[]).filter(item =>
        (item.category === "work" && pref?.include_work !== false) ||
        (item.category === "conversations" && pref?.include_conversations !== false) ||
        (item.category === "governance" && pref?.include_governance !== false));
      if (!items.length) { empty++; continue; }
      // Reserve before sending to enforce a one-email-per-person-per-day ceiling,
      // including when two scheduled invocations happen concurrently.
      const claim = await db.from("daily_digest_deliveries").insert({
        person_id: person.id, digest_date: date, state: "sending",
      });
      if (claim.error?.code === "23505") { alreadySent++; continue; }
      if (claim.error) { errors.push(person.id + ": unable to reserve delivery"); continue; }
      try {
        await sendMail({
          smtpUser: requiredEnv("SMTP_USER"),
          smtpPassword: requiredEnv("SMTP_APP_PASSWORD"),
          fromName: Deno.env.get("SMTP_FROM_NAME")?.trim() || "SDBP Workspace",
          to: person.email, subject: "SDBP · Your daily attention summary",
          body: buildDigest(person, items, date),
        });
        const done = await db.from("daily_digest_deliveries").update({
          state: "sent", sent_at: new Date().toISOString(),
        }).eq("person_id", person.id).eq("digest_date", date);
        if (done.error) throw done.error;
        sent++;
      } catch (error) {
        // Keep the claim: an uncertain SMTP outcome must never create a duplicate.
        errors.push(person.id + ": delivery failed: " + (error instanceof Error ? error.message : "unknown"));
      }
    }
    if (errors.length) console.error("Daily digest partial failure", errors);
    return Response.json({ sent, empty, disabled, alreadySent, failed: errors.length }, { status: errors.length ? 500 : 200 });
  } catch (error) {
    console.error("Daily attention digest failed", error);
    return Response.json({ error: "Daily digest failed." }, { status: 500 });
  }
});

function buildDigest(person: Person, items: Item[], date: string) {
  const categories: Array<[Item["category"], string]> = [
    ["governance", "Governance responses and meetings"],
    ["work", "Requests, commitments and updates"],
    ["conversations", "Messages for you"],
  ];
  const lines = [person.name + ",", "", "Here is what currently needs your attention (" + date + ").",
    "Outstanding items stay here until they are addressed; ordinary activity is not emailed.", ""];
  for (const [category, heading] of categories) {
    const group = items.filter(item => item.category === category);
    if (!group.length) continue;
    lines.push(heading + " (" + group.length + ")", "");
    for (const item of group.slice(0, 30)) {
      lines.push("• " + item.title + ": " + item.detail.replace(/\s+/g, " ").slice(0, 180));
      lines.push("  " + item.destination);
    }
    if (group.length > 30) lines.push("… and " + (group.length - 30) + " more in Workspace.");
    lines.push("");
  }
  lines.push("Open Board · For me: " + APP + "board/?tab=attention");
  lines.push("Open Spatial Workspace: " + APP + "spatial/");
  lines.push("", "Email preferences are available in Account settings.");
  return lines.join("\n");
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
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
