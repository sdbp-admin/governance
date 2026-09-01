import { supabase } from "@/lib/supabase/client";

export type ProjectConflict = {
  id: string;
  projectId: string;
  personId: string;
  reason: string;
  declaredBy: string;
  declaredAt: string;
};

type ProjectConflictRow = {
  id: string;
  project_id: string;
  person_id: string;
  reason: string;
  declared_by: string;
  declared_at: string;
};

export async function loadProjectConflicts(projectId: string): Promise<ProjectConflict[]> {
  const { data, error } = await supabase
    .from("project_conflicts")
    .select("id,project_id,person_id,reason,declared_by,declared_at")
    .eq("project_id", projectId)
    .is("ended_at", null)
    .order("declared_at", { ascending: true });

  if (error) {
    if (isOptionalSchemaError(error)) return [];
    throw error;
  }

  return ((data ?? []) as ProjectConflictRow[]).map((row) => ({
    id: row.id,
    projectId: row.project_id,
    personId: row.person_id,
    reason: row.reason,
    declaredBy: row.declared_by,
    declaredAt: row.declared_at,
  }));
}

export async function declareProjectConflict(projectId: string, personId: string, reason: string) {
  const { error } = await supabase.rpc("declare_project_conflict", {
    target_project_id: projectId,
    target_person_id: personId,
    conflict_reason: reason.trim(),
  });
  if (error) throw error;
}

export async function endProjectConflict(conflictId: string) {
  const { error } = await supabase.rpc("end_project_conflict", {
    target_conflict_id: conflictId,
  });
  if (error) throw error;
}

export function announceProjectConflictChange(projectId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("project-coi-changed", { detail: { projectId } }));
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || error.code === "PGRST204" || /project_conflicts|does not exist|schema cache/i.test(error.message ?? "");
}
