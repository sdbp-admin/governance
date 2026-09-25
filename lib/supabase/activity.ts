import { supabase } from "@/lib/supabase/client";

export type ActivityEntry = {
  id: string;
  actorId?: string;
  actorName: string;
  eventType: string;
  subjectType: string;
  subjectId?: string;
  summary: string;
  createdAt: string;
};

type ActivityRow = {
  id: string;
  actor_id: string | null;
  actor_name: string;
  event_type: string;
  subject_type: string;
  subject_id: string | null;
  summary: string;
  created_at: string;
};

export async function loadActivity(limit = 40): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from("activity_log")
    .select("id,actor_id,actor_name,event_type,subject_type,subject_id,summary,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return ((data ?? []) as ActivityRow[]).map((row) => ({
    id: row.id,
    actorId: row.actor_id ?? undefined,
    actorName: row.actor_name,
    eventType: row.event_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id ?? undefined,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}
