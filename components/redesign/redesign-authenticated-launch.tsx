"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { RedesignPrototype } from "@/components/redesign/redesign-prototype";
import { supabase } from "@/lib/supabase/client";
import { canInvitePeople, loadWorkspace, type WorkspacePerson } from "@/lib/supabase/workspace";
import { deactivateWorkspacePerson, isCurrentPresident, resendWorkspaceInvitation, transferPresidency } from "@/lib/supabase/people-access";

type Profile = { id: string; name: string; email: string };
type AuthStatus = "loading" | "signed_out" | "signed_in" | "not_invited" | "error";
type AmrEntry = { method?: string };

const ACCESS_CHECK_TIMEOUT_MS = 12_000;
const SIGN_OUT_TIMEOUT_MS = 5_000;

export function RedesignAuthenticatedLaunch() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordEditor, setPasswordEditor] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [canManageAccess, setCanManageAccess] = useState(false);
  const [canTransferPresidency, setCanTransferPresidency] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessPeople, setAccessPeople] = useState<WorkspacePerson[]>([]);
  const [accessPresidentId, setAccessPresidentId] = useState<string | null>(null);
  const [transferTargetId, setTransferTargetId] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessBusyId, setAccessBusyId] = useState<string | null>(null);
  const [accessError, setAccessError] = useState("");
  const accessCheckAttempt = useRef(0);

  const resolveUser = useCallback(async (showLoading = false) => {
    const attempt = ++accessCheckAttempt.current;
    if (showLoading) setStatus("loading");
    setError("");

    let timedOut = false;
    const timeout = window.setTimeout(() => {
      if (accessCheckAttempt.current !== attempt) return;
      timedOut = true;
      accessCheckAttempt.current += 1;
      setProfile(null);
      setPasswordRequired(false);
      setCanManageAccess(false);
      setCanTransferPresidency(false);
      setError("We couldn't finish checking your access. The connection may have stalled or this browser may have an expired session.");
      setStatus("error");
    }, ACCESS_CHECK_TIMEOUT_MS);

    const active = () => !timedOut && accessCheckAttempt.current === attempt;

    try {
      const [{ data: userData, error: userError }, { data: sessionData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.auth.getSession(),
      ]);
      if (!active()) return;

      const user = userData.user;
      if (userError) {
        setProfile(null);
        setPasswordRequired(false);
        setCanManageAccess(false);
        setCanTransferPresidency(false);
        setError(userError.message);
        setStatus("error");
        return;
      }
      if (!user) {
        setProfile(null);
        setPasswordRequired(false);
        setCanManageAccess(false);
        setCanTransferPresidency(false);
        setStatus("signed_out");
        return;
      }

      let { data: person, error: profileError } = await supabase
        .from("people")
        .select("id,name,email")
        .eq("auth_user_id", user.id)
        .eq("active", true)
        .maybeSingle();
      if (!active()) return;

      if (!person && !profileError) {
        const { error: claimError } = await supabase.rpc("claim_workspace_profile");
        if (!active()) return;
        if (!claimError) {
          const retry = await supabase
            .from("people")
            .select("id,name,email")
            .eq("auth_user_id", user.id)
            .eq("active", true)
            .maybeSingle();
          if (!active()) return;
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
        setPasswordRequired(false);
        setCanManageAccess(false);
        setCanTransferPresidency(false);
        setStatus("not_invited");
        return;
      }

      const next = person as Profile;
      setProfile(next);
      setEmail(next.email);
      setStatus("signed_in");

      try {
        const [manageAccess, currentPresident] = await Promise.all([canInvitePeople(), isCurrentPresident()]);
        if (!active()) return;
        setCanManageAccess(manageAccess);
        setCanTransferPresidency(currentPresident);
      } catch {
        if (!active()) return;
        setCanManageAccess(false);
        setCanTransferPresidency(false);
      }

      const passwordMarked = user.user_metadata?.sdbp_password_set === true;
      const methods = readAuthenticationMethods(sessionData.session?.access_token);
      const signedInWithPassword = methods.includes("password");

      if (!passwordMarked && signedInWithPassword) {
        const { error: markError } = await supabase.auth.updateUser({
          data: { ...user.user_metadata, sdbp_password_set: true },
        });
        if (!active()) return;
        if (!markError) setPasswordRequired(false);
        return;
      }

      if (!passwordMarked) {
        setPasswordRequired(true);
        setPasswordEditor(true);
      } else {
        setPasswordRequired(false);
      }
    } catch (accessError) {
      if (!active()) return;
      setProfile(null);
      setPasswordRequired(false);
      setCanManageAccess(false);
      setCanTransferPresidency(false);
      setError(readError(accessError));
      setStatus("error");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const authError = hash.get("error_description");
    if (authError) setError(authError);

    void resolveUser(true);
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setPasswordRequired(false);
        setPasswordEditor(true);
      }
      if (!session?.user) {
        accessCheckAttempt.current += 1;
        setProfile(null);
        setPasswordRequired(false);
        setCanManageAccess(false);
        setCanTransferPresidency(false);
        setStatus("signed_out");
        return;
      }
      window.setTimeout(() => void resolveUser(false), 0);
    });
    return () => {
      accessCheckAttempt.current += 1;
      data.subscription.unsubscribe();
    };
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

    const { data: userData } = await supabase.auth.getUser();
    const metadata = userData.user?.user_metadata ?? {};
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      data: { ...metadata, sdbp_password_set: true },
    });

    if (updateError) setError(updateError.message);
    else {
      setNewPassword("");
      setConfirmPassword("");
      setPasswordEditor(false);
      setPasswordRequired(false);
      setRecoveryMode(false);
      setMessage(passwordRequired ? "Password created. Your account is ready." : "Password saved.");
      await resolveUser(false);
    }
    setSending(false);
  }

  async function signOut() {
    accessCheckAttempt.current += 1;
    await Promise.race([supabase.auth.signOut({ scope: "local" }), wait(SIGN_OUT_TIMEOUT_MS)]);
    setProfile(null); setPassword(""); setMessage(""); setError(""); setPasswordRequired(false); setPasswordEditor(false); setCanManageAccess(false); setCanTransferPresidency(false); setAccessOpen(false); setStatus("signed_out");
  }

  async function resetSignIn() {
    accessCheckAttempt.current += 1;
    setSending(true);
    try {
      await Promise.race([supabase.auth.signOut({ scope: "local" }), wait(SIGN_OUT_TIMEOUT_MS)]);
    } catch {
      // The local UI reset below still gives the user a fresh sign-in path.
    }
    setProfile(null);
    setPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordRequired(false);
    setPasswordEditor(false);
    setRecoveryMode(false);
    setCanManageAccess(false);
    setCanTransferPresidency(false);
    setAccessOpen(false);
    setError("");
    setMessage("Sign-in reset. Please sign in again.");
    setStatus("signed_out");
    setSending(false);
  }

  async function openAccessManager() {
    setAccessOpen(true);
    setAccessLoading(true);
    setAccessError("");
    setTransferTargetId("");
    try {
      const workspace = await loadWorkspace();
      setAccessPeople(workspace.people);
      const presidentRole = workspace.roles.find((role) => role.category === "board" && role.title.trim().toLowerCase() === "president");
      setAccessPresidentId(presidentRole?.holderIds[0] ?? null);
    } catch (accessLoadError) {
      setAccessError(readError(accessLoadError));
    } finally {
      setAccessLoading(false);
    }
  }

  async function resendInvitation(person: WorkspacePerson) {
    setAccessBusyId(person.id);
    setAccessError("");
    try {
      await resendWorkspaceInvitation(person);
      setMessage(`Invitation resent to ${person.email}.`);
    } catch (resendError) {
      setAccessError(readError(resendError));
    } finally {
      setAccessBusyId(null);
    }
  }

  async function removeAccess(person: WorkspacePerson) {
    if (!profile || person.id === profile.id || person.id === accessPresidentId) return;
    const explanation = person.linked
      ? `Remove ${person.name} from the SDBP workspace? Their organisational history will remain, but they will lose access.`
      : `Remove the invitation for ${person.name}? The invitation link will no longer grant workspace access.`;
    if (!window.confirm(explanation)) return;

    setAccessBusyId(person.id);
    setAccessError("");
    try {
      await deactivateWorkspacePerson(person.id);
      setAccessPeople((people) => people.filter((item) => item.id !== person.id));
      setMessage(person.linked ? `${person.name} removed from the workspace.` : `Invitation for ${person.name} removed.`);
      window.dispatchEvent(new Event("focus"));
    } catch (removeError) {
      setAccessError(readError(removeError));
    } finally {
      setAccessBusyId(null);
    }
  }

  async function transferPresident() {
    if (!profile || !transferTargetId || !canTransferPresidency) return;
    const target = accessPeople.find((person) => person.id === transferTargetId);
    if (!target) return;
    if (!window.confirm(`Transfer the SDBP presidency to ${target.name}? Organisational admin rights will move with the President role.`)) return;

    setAccessBusyId(target.id);
    setAccessError("");
    try {
      await transferPresidency(target.id);
      setAccessPresidentId(target.id);
      setTransferTargetId("");
      setMessage(`${target.name} is now President.`);
      await resolveUser(false);
      window.dispatchEvent(new Event("focus"));
      setAccessOpen(false);
    } catch (transferError) {
      setAccessError(readError(transferError));
    } finally {
      setAccessBusyId(null);
    }
  }

  if (status === "loading") return <AuthShell><div className="auth-state"><span className="auth-spinner" /><h1>Opening SDBP</h1><p>Checking your access. This should take only a few seconds.</p></div></AuthShell>;

  if (passwordEditor && status === "signed_in") {
    const firstPassword = passwordRequired && !recoveryMode;
    return <AuthShell><div className="auth-card"><span className="section-kicker">{recoveryMode ? "Password recovery" : firstPassword ? "Welcome to SDBP" : "Your account"}</span><h1>{recoveryMode ? "Choose a new password" : firstPassword ? "Create your password" : "Change password"}</h1>{firstPassword && <p>Your email is confirmed. Create a password before entering the SDBP workspace.</p>}<form onSubmit={savePassword} className="auth-form"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><button type="submit" className="primary" disabled={sending}>{sending ? "Saving…" : firstPassword ? "Create password & enter SDBP" : "Save password"}</button></form>{error && <div className="auth-message error">{error}</div>}{!recoveryMode && !firstPassword && <div className="auth-actions"><button className="quiet" onClick={() => setPasswordEditor(false)}>Cancel</button></div>}</div></AuthShell>;
  }

  if (status === "signed_out") return <AuthShell><div className="auth-card"><span className="section-kicker">SDBP workspace</span><h1>Sign in</h1><p>Use the email address you were invited with.</p><form onSubmit={signIn} className="auth-form"><label htmlFor="board-email">Email</label><input id="board-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><label htmlFor="board-password">Password</label><input id="board-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="submit" className="primary" disabled={sending}>{sending ? "Signing in…" : "Sign in"}</button></form><div className="auth-login-options"><button type="button" onClick={() => void sendPasswordReset()} disabled={sending}>Forgot password?</button><button type="button" onClick={() => void sendSignInLink()} disabled={sending}>Email me a sign-in link</button></div>{message && <div className="auth-message success">{message}</div>}{error && <div className="auth-message error">{error}</div>}<small className="auth-footnote">Access is by invitation only.</small></div></AuthShell>;

  if (status === "not_invited") return <AuthShell><div className="auth-card"><span className="section-kicker">Access</span><h1>This email is not in the SDBP workspace.</h1><p>Ask the President to invite this email address from Organisation.</p><div className="auth-actions"><button className="secondary" onClick={() => void signOut()}>Sign out</button></div></div></AuthShell>;

  if (status === "error") return <AuthShell><div className="auth-card"><span className="section-kicker">Connection</span><h1>We could not finish checking your access.</h1><p>{error}</p><div className="auth-actions"><button className="primary" disabled={sending} onClick={() => void resolveUser(true)}>Try again</button><button className="secondary" disabled={sending} onClick={() => void resetSignIn()}>{sending ? "Resetting…" : "Reset sign-in"}</button></div><small className="auth-footnote">Reset sign-in clears only this browser session. It does not remove your SDBP Workspace access.</small></div></AuthShell>;

  return <>{profile && <div className="auth-session-chip"><div><strong>{profile.name}</strong><small>{message || "Shared SDBP workspace"}</small></div><div className="auth-session-actions">{canManageAccess && <button onClick={() => void openAccessManager()}>People access</button>}<button onClick={() => { setMessage(""); setError(""); setPasswordEditor(true); }}>Password</button><button onClick={() => void signOut()}>Sign out</button></div></div>}{profile && <RedesignPrototype liveProfile={profile} />}{profile && accessOpen && <AccessManager people={accessPeople} currentProfileId={profile.id} presidentId={accessPresidentId} canTransferPresidency={canTransferPresidency} transferTargetId={transferTargetId} setTransferTargetId={setTransferTargetId} loading={accessLoading} busyId={accessBusyId} error={accessError} onTransfer={transferPresident} onResend={resendInvitation} onRemove={removeAccess} onClose={() => setAccessOpen(false)} />}</>;
}

function AccessManager({ people, currentProfileId, presidentId, canTransferPresidency, transferTargetId, setTransferTargetId, loading, busyId, error, onTransfer, onResend, onRemove, onClose }: {
  people: WorkspacePerson[];
  currentProfileId: string;
  presidentId: string | null;
  canTransferPresidency: boolean;
  transferTargetId: string;
  setTransferTargetId: (id: string) => void;
  loading: boolean;
  busyId: string | null;
  error: string;
  onTransfer: () => Promise<void>;
  onResend: (person: WorkspacePerson) => Promise<void>;
  onRemove: (person: WorkspacePerson) => Promise<void>;
  onClose: () => void;
}) {
  const president = people.find((person) => person.id === presidentId);
  const transferOptions = people.filter((person) => person.linked && person.id !== presidentId);

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="workflow-editor compact-modal" role="dialog" aria-modal="true"><div className="editor-head"><div><span className="section-kicker">People access</span><h2>Invitations and members</h2></div><button className="quiet editor-close" onClick={onClose}>×</button></div><p className="editor-note">The President manages organisational access. Removing a member revokes workspace access but keeps their past organisational work and records intact.</p>{loading ? <div className="auth-state"><span className="auth-spinner" /><p>Loading people…</p></div> : <><div className="presidency-panel"><div><span className="kind">President</span><strong>{president?.name ?? "Not assigned"}</strong><small>Organisational admin rights follow this role.</small></div>{canTransferPresidency && transferOptions.length > 0 && <div className="presidency-transfer"><select value={transferTargetId} onChange={(event) => setTransferTargetId(event.target.value)}><option value="">Select new President</option>{transferOptions.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select><button className="secondary small" disabled={!transferTargetId || Boolean(busyId)} onClick={() => void onTransfer()}>Transfer presidency</button></div>}</div><div className="access-people-list">{people.map((person) => <article className="access-person-row" key={person.id}><div><strong>{person.name}</strong><small>{person.email}</small><span>{person.linked ? "Active member" : "Invitation pending"}{person.id === presidentId ? " · President" : ""}</span></div><div className="auth-actions">{!person.linked && <button className="secondary small" disabled={busyId === person.id} onClick={() => void onResend(person)}>{busyId === person.id ? "Sending…" : "Resend invitation"}</button>}{person.id !== currentProfileId && person.id !== presidentId && <button className="danger small" disabled={busyId === person.id} onClick={() => void onRemove(person)}>{person.linked ? "Remove member" : "Remove invitation"}</button>}</div></article>)}</div></>}{error && <div className="auth-message error">{error}</div>}<div className="editor-actions"><div /><button className="secondary" onClick={onClose}>Close</button></div></section></div>;
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell"><div className="auth-brand"><div className="brand-mark" aria-hidden="true"><span /><span /></div><div><strong>SDBP Governance</strong><small>Structure · rhythm · memory</small></div></div>{children}</main>;
}

function readAuthenticationMethods(accessToken?: string) {
  if (!accessToken) return [] as string[];
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return [] as string[];
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const claims = JSON.parse(window.atob(padded)) as { amr?: AmrEntry[] };
    return (claims.amr ?? []).map((entry) => entry.method).filter((method): method is string => Boolean(method));
  } catch {
    return [] as string[];
  }
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function readError(error: unknown) {
  return error instanceof Error ? error.message : "Something could not be saved.";
}
