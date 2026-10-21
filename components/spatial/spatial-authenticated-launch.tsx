"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { SPATIAL_INTERNAL_DEPTH_STATE, SpatialWorkspace } from "@/components/spatial/spatial-workspace";
import { SpatialGovernanceMeeting, SpatialTactical } from "./spatial-surfaces";
import styles from "@/components/spatial/spatial.module.css";

export type SpatialProfile = { id: string; name: string; email: string };
type AuthState = "loading" | "signed_out" | "signed_in" | "not_invited" | "error";

export function SpatialAuthenticatedLaunch() {
  const [state, setState] = useState<AuthState>("loading");
  const [profile, setProfile] = useState<SpatialProfile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [tactical, setTactical] = useState(false);
  const [governanceMeeting, setGovernanceMeeting] = useState<{ proposalId?: string } | null>(null);

  const resolveUser = useCallback(async () => {
    setError("");
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user) {
        setProfile(null);
        setState("signed_out");
        return;
      }

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) {
        setProfile(null);
        setState("signed_out");
        return;
      }

      const { data, error: profileError } = await supabase
        .from("people")
        .select("id,name,email")
        .eq("auth_user_id", userData.user.id)
        .eq("active", true)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!data) {
        setProfile(null);
        setState("not_invited");
        return;
      }

      setProfile(data as SpatialProfile);
      setEmail(String(data.email));
      setState("signed_in");
    } catch (reason) {
      setProfile(null);
      setError(readError(reason));
      setState("error");
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setTactical(params.has("tactical"));
      setGovernanceMeeting(params.has("governanceMeeting") ? { proposalId: params.get("proposal") ?? undefined } : null);
      void resolveUser();
    }, 0);
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => void resolveUser(), 0);
    });
    return () => {
      window.clearTimeout(initialCheck);
      data.subscription.unsubscribe();
    };
  }, [resolveUser]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password || sending) return;
    setSending(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError(signInError.message);
    else {
      const historyState = window.history.state as Record<string, unknown> | null;
      if (historyState?.[SPATIAL_INTERNAL_DEPTH_STATE] === true) {
        const url = new URL(window.location.href);
        url.searchParams.delete("project");
        url.searchParams.delete("tension");
        window.history.replaceState({ ...(historyState ?? {}), [SPATIAL_INTERNAL_DEPTH_STATE]: false }, "", url);
      }
      setPassword("");
    }
    setSending(false);
  }

  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    setProfile(null);
    setPassword("");
    setState("signed_out");
  }

  if (state === "loading") return <SpatialGate title="Opening the landscape" detail="Finding your place in the workspace." loading />;

  if (state === "signed_out") return <main className={styles.gate}>
    <div className={styles.gateMark} aria-hidden="true"><span /><span /></div>
    <form className={styles.gateForm} onSubmit={signIn}>
      <span className={styles.eyebrow}>SDBP · spatial prototype</span>
      <h1>Enter the workspace</h1>
      <p>Your existing SDBP account opens the same organisational reality in a different interface.</p>
      <label><span>Email</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
      <label><span>Password</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
      {error && <div className={styles.gateError}>{error}</div>}
      <button type="submit" disabled={sending}>{sending ? "Entering…" : "Enter spatial workspace"}</button>
    </form>
  </main>;

  if (state === "not_invited") return <SpatialGate title="No active workspace place" detail="This signed-in account is not linked to an active SDBP member." action="Sign out" onAction={() => void signOut()} />;
  if (state === "error") return <SpatialGate title="The workspace could not open" detail={error} action="Try again" onAction={() => { setState("loading"); void resolveUser(); }} />;

  return profile ? governanceMeeting ? <SpatialGovernanceMeeting profile={profile} initialProposalId={governanceMeeting.proposalId} /> : tactical ? <SpatialTactical profile={profile} /> : <SpatialWorkspace profile={profile} onSignOut={() => void signOut()} /> : null;
}

function SpatialGate({ title, detail, loading = false, action, onAction }: { title: string; detail: string; loading?: boolean; action?: string; onAction?: () => void }) {
  return <main className={styles.gate}><div className={styles.gateState}>{loading && <span className={styles.loader} />}<span className={styles.eyebrow}>SDBP · spatial prototype</span><h1>{title}</h1><p>{detail}</p>{action && <button type="button" onClick={onAction}>{action}</button>}</div></main>;
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "The workspace could not be opened.";
}
