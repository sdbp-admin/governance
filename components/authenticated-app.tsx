"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Prototype } from "@/components/prototype";
import { supabase } from "@/lib/supabase/client";

type Profile = {
  id: string;
  name: string;
  email: string;
};

type AuthStatus = "loading" | "signed_out" | "signed_in" | "not_board_member" | "error";

export function AuthenticatedApp() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [meetingMode, setMeetingMode] = useState(false);

  const resolveUser = useCallback(async () => {
    setError("");

    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;

    if (userError || !user) {
      setProfile(null);
      setStatus("signed_out");
      return;
    }

    const { data: person, error: profileError } = await supabase
      .from("people")
      .select("id,name,email")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setStatus("error");
      return;
    }

    if (!person) {
      setProfile(null);
      setStatus("not_board_member");
      return;
    }

    setProfile(person as Profile);
    setStatus("signed_in");
  }, []);

  useEffect(() => {
    setMeetingMode(new URLSearchParams(window.location.search).has("meeting"));

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = hash.get("error_description");
    if (authError) setError(authError);

    void resolveUser();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setProfile(null);
        setStatus("signed_out");
        return;
      }

      window.setTimeout(() => void resolveUser(), 0);
    });

    return () => data.subscription.unsubscribe();
  }, [resolveUser]);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;

    setSending(true);
    setError("");
    setMessage("");

    const redirectTo = `${window.location.origin}/governance/`;
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });

    if (signInError) setError(signInError.message);
    else setMessage("Check your email for the secure sign-in link.");

    setSending(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setStatus("signed_out");
  }

  if (status === "loading") {
    return <AuthShell><div className="auth-state"><span className="auth-spinner" aria-hidden="true" /><h1>Connecting to SDBP Governance</h1><p>Checking your board access.</p></div></AuthShell>;
  }

  if (status === "signed_out") {
    return <AuthShell>
      <div className="auth-card">
        <span className="section-kicker">Board workspace</span>
        <h1>Sign in to SDBP Governance</h1>
        <p>Use the email address that was invited to the board workspace. We will send you a secure sign-in link.</p>
        <form onSubmit={sendMagicLink} className="auth-form">
          <label htmlFor="board-email">Email address</label>
          <input id="board-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          <button type="submit" className="primary" disabled={sending}>{sending ? "Sending…" : "Send sign-in link"}</button>
        </form>
        {message && <div className="auth-message success">{message}</div>}
        {error && <div className="auth-message error">{error}</div>}
        <small className="auth-footnote">Access is invitation-only. Entering an uninvited email does not create an account.</small>
      </div>
    </AuthShell>;
  }

  if (status === "not_board_member") {
    return <AuthShell>
      <div className="auth-card">
        <span className="section-kicker">Access check</span>
        <h1>Your login worked, but no active board profile is linked.</h1>
        <p>This normally means the invitation/profile link has not finished provisioning yet.</p>
        <div className="auth-actions"><button className="primary" onClick={() => void resolveUser()}>Check again</button><button className="secondary" onClick={() => void signOut()}>Sign out</button></div>
      </div>
    </AuthShell>;
  }

  if (status === "error") {
    return <AuthShell>
      <div className="auth-card">
        <span className="section-kicker">Connection problem</span>
        <h1>We could not verify board access.</h1>
        <p>{error || "The Supabase connection returned an unexpected error."}</p>
        <div className="auth-actions"><button className="primary" onClick={() => void resolveUser()}>Try again</button><button className="secondary" onClick={() => void signOut()}>Sign out</button></div>
      </div>
    </AuthShell>;
  }

  return <>
    {!meetingMode && profile && <div className="auth-session-chip" role="status">
      <div><strong>Signed in as {profile.name}</strong><small>Database access is live · standalone Actions are now persisted for the signed-in user</small></div>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>}
    {profile && <Prototype liveProfile={profile} />}
  </>;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell">
    <div className="auth-brand"><div className="brand-mark" aria-hidden="true"><span /><span /></div><div><strong>SDBP Governance</strong><small>Structure · rhythm · memory</small></div></div>
    {children}
  </main>;
}
