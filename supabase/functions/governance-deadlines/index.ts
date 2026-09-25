import { createClient } from "npm:@supabase/supabase-js@2.111.0";

type Round = { proposal_id: string; deadline_at: string; deadline_notice_needed: boolean };
type Person = { id: string; name: string; email: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = req.headers.get("x-sdbp-cron-token");
  if (!token) return new Response("Forbidden", { status: 403 });
  try {
    const db = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = await db.rpc("validate_governance_deadline_cron_token", { candidate: token });
    if (auth.error || auth.data !== true) return new Response("Forbidden", { status: 403 });

    const now = Date.now();
    const { data: rounds, error: roundError } = await db.from("governance_consent_rounds")
      .select("proposal_id,deadline_at,deadline_notice_needed").eq("status", "open").gt("deadline_at", new Date(now).toISOString());
    if (roundError) throw roundError;
    if (!rounds?.length) return new Response(JSON.stringify({ sent: 0 }));
    const ids = (rounds as Round[]).map(round => round.proposal_id);
    const [peopleResult, proposalsResult, responsesResult, sentResult] = await Promise.all([
      db.from("people").select("id,name,email").eq("active", true).eq("governance_available", true),
      db.from("governance_proposals").select("id,title").in("id", ids),
      db.from("governance_consent_responses").select("proposal_id,person_id").in("proposal_id", ids),
      db.from("governance_consent_deadline_notifications").select("proposal_id,person_id,kind").in("proposal_id", ids),
    ]);
    const failure = peopleResult.error ?? proposalsResult.error ?? responsesResult.error ?? sentResult.error;
    if (failure) throw failure;
    const appUrl = new URL(Deno.env.get("APP_URL")?.trim() || "https://sdbp-admin.github.io/governance/");
    appUrl.pathname = `${appUrl.pathname.replace(/\/(?:redesign|spatial)\/?$/, "").replace(/\/$/, "")}/spatial/`;
    const smtpUser = requiredEnv("SMTP_USER");
    const smtpPassword = requiredEnv("SMTP_APP_PASSWORD");
    let sent = 0;
    for (const round of rounds as Round[]) {
      const deadline = new Date(round.deadline_at);
      const deadlineText = `${deadline.toLocaleString("en-GB", { timeZone: "Europe/Budapest", dateStyle: "full", timeStyle: "short" })} (Budapest time)`;
      const remaining = deadline.getTime() - now;
      const title = proposalsResult.data?.find(proposal => proposal.id === round.proposal_id)?.title ?? "Governance proposal";
      for (const person of (peopleResult.data ?? []) as Person[]) {
        if (responsesResult.data?.some(response => response.proposal_id === round.proposal_id && response.person_id === person.id)) continue;
        const kinds = ([round.deadline_notice_needed && "deadline_notice", remaining <= 24 * 60 * 60 * 1000 && "24_hour_reminder"] as const).filter(Boolean);
        for (const kind of kinds) {
          if (sentResult.data?.some(row => row.proposal_id === round.proposal_id && row.person_id === person.id && row.kind === kind)) continue;
          await sendMail({ smtpUser, smtpPassword, fromName: Deno.env.get("SMTP_FROM_NAME")?.trim() || "SDBP Workspace",
            to: person.email, subject: `${kind === "deadline_notice" ? "Response deadline set" : "Response deadline approaching"} · ${title}`,
            body: [`${person.name},`, "", kind === "deadline_notice" ? "A 72-hour response window has been set for a Quick Consent proposal:" : "Less than 24 hours remain to respond to this Quick Consent proposal:",
              "", title, "", `Deadline: ${deadlineText}`, "", "Please choose ‘No objection’ or submit an objection for validation. If the deadline passes with unanswered responses, the proposal will require a governance meeting. Silence will not be counted as consent or an objection.",
              "", `Open Spatial Workspace: ${appUrl}`].join("\n") });
          const save = await db.from("governance_consent_deadline_notifications").insert({ proposal_id: round.proposal_id, person_id: person.id, kind });
          if (save.error && save.error.code !== "23505") throw save.error;
          sent++;
        }
      }
    }
    return new Response(JSON.stringify({ sent }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Governance deadline notification failed", error);
    return new Response(JSON.stringify({ error: "Notifications could not be completed." }), { status: 500 });
  }
});

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
