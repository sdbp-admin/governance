"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Prototype } from "@/components/prototype";
import { supabase } from "@/lib/supabase/client";

type Profile = { id: string; name: string; email: string };
type AuthStatus = "loading" | "signed_out" | "signed_in" | "not_invited" | "error";

export function AuthenticatedLaunch() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordEditor, setPasswordEditor] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const resolveUser = useCallback(async () => {
    setError("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      setProfile(null);
      setStatus("signed_out");
      return;
    }

    let { data: person, error: profileError } = await supabase
      .from("people")
      .select("id,name,email")
      .eq("auth_user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!person && !profileError) {
      const { error: claimError } = await supabase.rpc("claim_workspace_profile");
      if (!claimError) {
        const retry = await supabase
          .from("people")
          .select("id,name,email")
          .eq("auth_user_id", user.id)
          .eq("active", true)
          .maybeSingle();
        person = retry.data;
        profileError = retry.error;
      }
    }

    if (profileError) {
      setError(profileError.message);
      setStatus("error");
      return;
    }

    if (!person) {
      setProfile(null);
      setStatus("not_invited");
      return;
    }

    const next = person as Profile;
    setProfile(next);
    setEmail(next.email);
    setStatus("signed_in");
  }, []);

  useEffect(() => {
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

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) return;
    setSending(true); setError(""); setMessage("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError(signInError.message);
    else setPassword("");
    setSending(false);
  }

  async function sendSignInLink() {
    if (!email.trim()) { setError("Enter your invited email address first."); return; }
    setSending(true); setError(""); setMessage("");
    const { error: linkError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/governance/` },
    });
    if (linkError) setError(linkError.message);
    else setMessage("Sign-in link sent.");
    setSending(false);
  }

  async function sendPasswordReset() {
    if (!email.trim()) { setError("Enter your invited email address first."); return; }
    setSending(true); setError(""); setMessage("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/governance/` });
    if (resetError) setError(resetError.message);
    else setMessage("Password reset email sent.");
    setSending(false);
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    if (newPassword.length < 8) { setError("Use at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("The two passwords do not match."); return; }
    setSending(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) setError(updateError.message);
    else {
      setNewPassword(""); setConfirmPassword(""); setPasswordEditor(false); setRecoveryMode(false); setMessage("Password saved.");
      await resolveUser();
    }
    setSending(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null); setPassword(""); setMessage(""); setError(""); setStatus("signed_out");
  }

  if (status === "loading") return <AuthShell><div className="auth-state"><span className="auth-spinner" /><h1>Opening SDBP</h1><p>Checking your access.</p></div></AuthShell>;

  if (passwordEditor && status === "signed_in") return <AuthShell><div className="auth-card"><span className="section-kicker">{recoveryMode ? "Password recovery" : "Your account"}</span><h1>{recoveryMode ? "Choose a new password" : "Change password"}</h1><form onSubmit={savePassword} className="auth-form"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><button type="submit" className="primary" disabled={sending}>{sending ? "Saving…" : "Save password"}</button></form>{error && <div className="auth-message error">{error}</div>}{!recoveryMode && <div className="auth-actions"><button className="quiet" onClick={() => setPasswordEditor(false)}>Cancel</button></div>}</div></AuthShell>;

  if (status === "signed_out") return <AuthShell><div className="auth-card"><span className="section-kicker">SDBP workspace</span><h1>Sign in</h1><p>Use the email address you were invited with.</p><form onSubmit={signIn} className="auth-form"><label htmlFor="board-email">Email</label><input id="board-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="board-password">Password</label><input id="board-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="submit" className="primary" disabled={sending}>{sending ? "Signing in…" : "Sign in"}</button></form><div className="auth-login-options"><button type="button" onClick={() => void sendPasswordReset()} disabled={sending}>Forgot password?</button><button type="button" onClick={() => void sendSignInLink()} disabled={sending}>Email me a sign-in link</button></div>{message && <div className="auth-message success">{message}</div>}{error && <div className="auth-message error">{error}</div>}<small className="auth-footnote">Access is by invitation only.</small></div></AuthShell>;

  if (status === "not_invited") return <AuthShell><div className="auth-card"><span className="section-kicker">Access</span><h1>This email is not in the SDBP workspace.</h1><p>Ask the President to invite this email address from Organisation.</p><div className="auth-actions"><button className="secondary" onClick={() => void signOut()}>Sign out</button></div></div></AuthShell>;

  if (status === "error") return <AuthShell><div className="auth-card"><span className="section-kicker">Connection</span><h1>We could not open the workspace.</h1><p>{error}</p><div className="auth-actions"><button className="primary" onClick={() => void resolveUser()}>Try again</button><button className="secondary" onClick={() => void signOut()}>Sign out</button></div></div></AuthShell>;

  return <>{profile && <div className="auth-session-chip"><div><strong>{profile.name}</strong><small>{message || "Shared SDBP workspace"}</small></div><div className="auth-session-actions"><button onClick={() => { setMessage(""); setError(""); setPasswordEditor(true); }}>Password</button><button onClick={() => void signOut()}>Sign out</button></div></div>}{profile && <Prototype liveProfile={profile} />}</>;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell"><div className="auth-brand"><div className="brand-mark" aria-hidden="true"><span /><span /></div><div><strong>SDBP Governance</strong><small>Structure · rhythm · memory</small></div></div>{children}</main>;
}
