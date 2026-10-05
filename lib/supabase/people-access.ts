import { supabase } from "@/lib/supabase/client";
import type { WorkspacePerson } from "@/lib/supabase/workspace";

function redirectToWorkspace() {
  return `${window.location.origin}/governance/`;
}

async function sendAccessEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectToWorkspace() },
  });
  if (error) throw error;
}

export async function inviteWorkspacePerson(name: string, email: string) {
  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanName || !cleanEmail) throw new Error("Name and email are required.");

  const { data: existing, error: existingError } = await supabase
    .from("people")
    .select("id,active")
    .ilike("email", cleanEmail)
    .maybeSingle();
  if (existingError) throw existingError;

  if (!existing) {
    const { error: insertError } = await supabase.from("people").insert({ name: cleanName, email: cleanEmail, active: true });
    if (insertError) throw insertError;
  } else if (!existing.active) {
    const { error: reactivateError } = await supabase.rpc("reactivate_workspace_person", {
      target_email: cleanEmail,
      target_name: cleanName,
    });
    if (reactivateError) throw reactivateError;
  }

  await sendAccessEmail(cleanEmail);
}

export async function resendWorkspaceInvitation(person: WorkspacePerson) {
  if (person.linked) throw new Error("This person already has an active account.");
  await sendAccessEmail(person.email.trim().toLowerCase());
}

export async function deactivateWorkspacePerson(personId: string) {
  const { error } = await supabase.rpc("deactivate_workspace_person", { target_person_id: personId });
  if (error) throw error;
}

export async function isCurrentPresident() {
  const { data, error } = await supabase.rpc("is_current_president");
  if (error) throw error;
  return Boolean(data);
}

export async function transferPresidency(personId: string) {
  const { error } = await supabase.rpc("transfer_presidency", { target_person_id: personId });
  if (error) throw error;
}
