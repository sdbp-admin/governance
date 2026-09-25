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
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [meetingMode, setMeetingMode] = useState(false);
  const [passwordEditor, setPasswordEditor] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);

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
    setEmail(person.email);
    setStatus("signed_in");
  }, []);

  useEffect(() => {
    setMeetingMode(new URLSearchParams(window.location.search).has("meeting"));

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = hash.get("error_description");
    if (authError) setError(authError);

    void resolveUser();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setPasswordEditor(true);
      }

      if (!session?.user) {
        setProfile(null);
        setStatus("signed_out");
        return;
      }

      window.setTimeout(() => void resolveUser(), 0);
    });

    return () => data.subscription.unsubscribe();
  }, [resolveUser]);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) return;

    setSending(true);
    setError("");
    setMessage("");

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });

    if (signInError) setError(signInError.message);
    else setPassword("");

    setSending(false);
  }

  async function sendMagicLink() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Enter your invited email address first.");
      return;
    }

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
    else setMessage("Sign-in link sent. Use this only when you cannot use your password.");

    setSending(false);
  }

  async function sendPasswordReset() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Enter your invited email address first.");
      return;
    }

    setSending(true);
    setError("");
    setMessage("");

    const redirectTo = `${window.location.origin}/governance/`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo,
    });

    if (resetError) setError(resetError.message);
    else setMessage("Password reset email sent. Open the link to choose a new password.");

    setSending(false);
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two passwords do not match.");
      return;
    }

    setSending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setError(updateError.message);
      setSending(false);
      return;
    }

    setNewPassword("");
    setConfirmPassword("");
    setPasswordEditor(false);
    setRecoveryMode(false);
    setMessage("Password saved. New browsers can now sign in without an email round-trip.");
    setSending(false);
    await resolveUser();
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setPassword("");
    setMessage("");
    setError("");
    setStatus("signed_out");
  }

  if (status === "loading") {
    return <AuthShell><div className="auth-state"><span className="auth-spinner" aria-hidden="true" /><h1>Connecting to SDBP Governance</h1><p>Checking your board access.</p></div></AuthShell>;
  }

  if (passwordEditor && status === "signed_in") {
    return <AuthShell>
      <div className="auth-card">
        <span className="section-kicker">{recoveryMode ? "Password recovery" : "Board account"}</span>
        <h1>{recoveryMode ? "Choose a new password" : "Set or change your password"}</h1>
        <p>Use this password for normal sign-in on a new browser or device. Your existing browser session can remain signed in.</p>
        <form onSubmit={savePassword} className="auth-form">
          <label htmlFor="new-password">New password</label>
          <input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
          <label htmlFor="confirm-password">Confirm password</label>
          <input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required />
          <button type="submit" className="primary" disabled={sending}>{sending ? "Saving…" : "Save password"}</button>
        </form>
        {error && <div className="auth-message error">{error}</div>}
        {!recoveryMode && <div className="auth-actions"><button className="quiet" type="button" onClick={() => { setPasswordEditor(false); setError(""); }}>Cancel</button></div>}
      </div>
    </AuthShell>;
  }

  if (status === "signed_out") {
    return <AuthShell>
      <div className="auth-card">
        <span className="section-kicker">Board workspace</span>
        <h1>Sign in to SDBP Governance</h1>
        <p>Use the email address invited to the board workspace and your password.</p>
        <form onSubmit={signInWithPassword} className="auth-form">
          <label htmlFor="board-email">Email address</label>
          <input id="board-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
          <label htmlFor="board-password">Password</label>
          <input id="board-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button type="submit" className="primary" disabled={sending}>{sending ? "Signing in…" : "Sign in"}</button>
        </form>
        <div className="auth-login-options">
          <button type="button" onClick={() => void sendPasswordReset()} disabled={sending}>Forgot password?</button>
          <button type="button" onClick={() => void sendMagicLink()} disabled={sending}>Email me a sign-in link instead</button>
        </div>
        {message && <div className="auth-message success">{message}</div>}
        {error && <div className="auth-message error">{error}</div>}
        <small className="auth-footnote">Access remains invitation-only. Password and email-link sign-in work only for existing invited users.</small>
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
      <div><strong>Signed in as {profile.name}</strong><small>{message || "Database access is live · standalone Actions are persisted"}</small></div>
      <div className="auth-session-actions"><button onClick={() => { setError(""); setMessage(""); setPasswordEditor(true); }}>Password</button><button onClick={() => void signOut()}>Sign out</button></div>
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
