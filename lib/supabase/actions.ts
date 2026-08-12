import type { Action } from "@/lib/domain";
import { supabase } from "@/lib/supabase/client";

type ActionRow = {
  id: string;
  title: string;
  status: Action["status"];
  due_on: string | null;
  source_label: string | null;
  source_tension_id: string | null;
};

const ACTION_COLUMNS = "id,title,status,due_on,source_label,source_tension_id";

export function toPrototypeAction(row: ActionRow, uiOwnerId: string): Action {
  return {
    id: row.id,
    title: row.title,
    ownerId: uiOwnerId,
    status: row.status,
    due: row.due_on ?? undefined,
    source: row.source_label ?? undefined,
    sourceTensionId: row.source_tension_id ?? undefined,
  };
}

export async function loadOwnActions(ownerId: string | undefined, uiOwnerId: string) {
  if (!ownerId) return [];

  const { data, error } = await supabase
    .from("actions")
    .select(ACTION_COLUMNS)
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data as ActionRow[]).map((row) => toPrototypeAction(row, uiOwnerId));
}

export async function createOwnAction(ownerId: string, uiOwnerId: string, title: string) {
  const { data, error } = await supabase
    .from("actions")
    .insert({
      title: title.trim(),
      owner_id: ownerId,
      status: "open",
    })
    .select(ACTION_COLUMNS)
    .single();

  if (error) throw error;
  return toPrototypeAction(data as ActionRow, uiOwnerId);
}

export async function setPersistedActionStatus(actionId: string, status: Action["status"]) {
  const patch: Record<string, string | null> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "done") patch.completed_at = new Date().toISOString();
  if (status === "open") patch.completed_at = null;

  const { error } = await supabase.from("actions").update(patch).eq("id", actionId);
  if (error) throw error;
}
