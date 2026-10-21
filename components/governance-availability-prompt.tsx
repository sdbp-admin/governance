"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type LiveProfile = { id: string; name: string; email: string };
type AvailabilityRow = {
  id: string;
  governance_available: boolean;
  governance_leave_expected_return_on?: string | null;
};

export function GovernanceAvailabilityPrompt({ liveProfile }: { liveProfile?: LiveProfile }) {
  const [row, setRow] = useState<AvailabilityRow | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!liveProfile) return;
    const key = `governance-leave-prompt-dismissed:${liveProfile.id}`;
    setDismissed(window.sessionStorage.getItem(key) === "1");
    let alive = true;
    void supabase
      .from("people")
      .select("id,governance_available,governance_leave_expected_return_on")
      .eq("id", liveProfile.id)
      .maybeSingle()
      .then((result) => {
        if (!alive) return;
        if (!result.error) setRow(result.data as AvailabilityRow | null);
        else if (!isAvailabilitySchemaError(result.error)) setError(result.error.message);
      });
    return () => { alive = false; };
  }, [liveProfile]);

  if (!liveProfile || !row || row.governance_available || dismissed) return null;

  const profileId = liveProfile.id;

  function stayOnLeave() {
    window.sessionStorage.setItem(`governance-leave-prompt-dismissed:${profileId}`, "1");
    setDismissed(true);
  }

  async function resume() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await supabase.rpc("set_governance_availability", {
        target_person_id: profileId,
        available: true,
        expected_return_on: null,
      });
      if (result.error) throw result.error;
      setRow((current) => current ? {
        ...current,
        governance_available: true,
        governance_leave_expected_return_on: null,
      } : current);
      window.sessionStorage.removeItem(`governance-leave-prompt-dismissed:${profileId}`);
      window.dispatchEvent(new Event("focus"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Governance availability could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="modal-backdrop">
    <section className="workflow-editor compact-modal" role="dialog" aria-modal="true" aria-label="Governance availability">
      <div className="editor-head"><div><span className="section-kicker">Governance availability</span><h2>You are currently marked on leave</h2></div></div>
      <p className="editor-note">You can still look through the workspace without becoming an active governance participant. If you are participating again, mark yourself available.</p>
      {row.governance_leave_expected_return_on && <p className="editor-note">Expected return recorded: {formatDate(row.governance_leave_expected_return_on)}.</p>}
      {error && <div className="auth-message error">{error}</div>}
      <div className="editor-actions"><div/><div className="editor-actions-right"><button className="secondary" type="button" disabled={busy} onClick={stayOnLeave}>Stay on leave</button><button className="primary" type="button" disabled={busy} onClick={() => void resume()}>{busy ? "Saving…" : "Mark me available"}</button></div></div>
    </section>
  </div>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function isAvailabilitySchemaError(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.code === "PGRST204" || /governance_available|schema cache|does not exist/i.test(error.message ?? "");
}