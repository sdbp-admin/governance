"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Preferences = {
  person_id: string;
  daily_digest_enabled: boolean;
  include_work: boolean;
  include_conversations: boolean;
  include_governance: boolean;
  urgent_email_enabled: boolean;
};
const defaults = (personId: string): Preferences => ({
  person_id: personId, daily_digest_enabled: true, include_work: true,
  include_conversations: true, include_governance: true, urgent_email_enabled: true,
});

export function NotificationSettings({ personId }: { personId: string }) {
  const [value, setValue] = useState<Preferences>(() => defaults(personId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let alive = true;
    setLoading(true);
    void supabase.from("person_notification_preferences").select("person_id,daily_digest_enabled,include_work,include_conversations,include_governance,urgent_email_enabled")
      .eq("person_id", personId).maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) setMessage(error.message);
        else setValue(data ? data as Preferences : defaults(personId));
        setLoading(false);
      });
    return () => { alive = false; };
  }, [personId]);
  const toggle = (key: keyof Omit<Preferences, "person_id">) =>
    setValue(current => ({ ...current, [key]: !current[key] }));
  async function save() {
    setSaving(true); setMessage("");
    const { error } = await supabase.from("person_notification_preferences").upsert(value, { onConflict: "person_id" });
    setMessage(error ? error.message : "Notification preferences saved.");
    setSaving(false);
  }
  const control = (key: keyof Omit<Preferences, "person_id">, label: string) =>
    <label style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0", fontSize: 13 }}>
      <input type="checkbox" disabled={saving || loading} checked={value[key]}
        onChange={() => toggle(key)} />{label}
    </label>;
  return <section aria-label="Email notification preferences" style={{ padding: "10px 0", maxWidth: 440 }}>
    <p style={{ margin: "0 0 8px", fontSize: 13 }}>At most one email digest per day, showing what still needs your attention. No email if there is nothing relevant.</p>
    {control("daily_digest_enabled", "Receive my daily email summary")}
    <fieldset disabled={!value.daily_digest_enabled || saving || loading} style={{ border: "1px solid #d7dde0", borderRadius: 6, padding: "8px 12px", margin: "6px 0" }}>
      <legend style={{ fontSize: 12 }}>Include in my daily email</legend>
      {control("include_work", "Requests, commitments and project updates")}
      {control("include_conversations", "Direct mentions and messages for me")}
      {control("include_governance", "Governance decisions and meeting availability")}
    </fieldset>
    {control("urgent_email_enabled", "Allow separate urgent emails")}
    <p style={{ fontSize: 12, margin: "6px 0" }}>Phone notifications in the Board app are managed separately. Your outstanding items remain visible in the apps regardless of email preferences.</p>
    <button type="button" disabled={loading || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save email preferences"}</button>
    {message && <p role="status" style={{ fontSize: 12, marginTop: 6 }}>{message}</p>}
  </section>;
}
