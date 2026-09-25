import { supabase } from "@/lib/supabase/client";

export async function saveProjectSettings(projectId: string, input: {
  title: string;
  ownerId: string;
  participantIds: string[];
  summary: string;
}) {
  const participants = [...new Set([input.ownerId, ...input.participantIds].filter(Boolean))];
  const { error } = await supabase.from("projects").update({
    title: input.title.trim(),
    owner_id: input.ownerId,
    participant_ids: participants,
    summary: input.summary.trim(),
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);
  if (error) throw error;
}

export async function reopenProject(projectId: string) {
  const today = todayISO();
  const { error } = await supabase.from("projects").update({
    status: "active",
    completed_at: null,
    next_prompt_on: addDays(today, 7),
    updated_at: new Date().toISOString(),
  }).eq("id", projectId);
  if (error) throw error;
}

function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
