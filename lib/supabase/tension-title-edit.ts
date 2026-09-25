import { supabase } from "@/lib/supabase/client";

const EDITABLE_STATUSES = ["open", "needs_sync", "awaiting_confirmation"] as const;

export async function updateTensionTitle(tensionId: string, currentUserId: string, nextTitle: string) {
  const title = nextTitle.trim();
  if (!title) throw new Error("A tension needs a description.");

  const { data: current, error: loadError } = await supabase
    .from("tensions")
    .select("title,raiser_id,status")
    .eq("id", tensionId)
    .single();
  if (loadError) throw loadError;

  if (!current || current.raiser_id !== currentUserId || !EDITABLE_STATUSES.includes(current.status)) {
    throw new Error("This tension can no longer be edited here.");
  }

  const previousTitle = current.title as string;
  if (title === previousTitle) return;

  const { data: updated, error: tensionError } = await supabase
    .from("tensions")
    .update({ title })
    .eq("id", tensionId)
    .eq("raiser_id", currentUserId)
    .in("status", [...EDITABLE_STATUSES])
    .select("id")
    .maybeSingle();
  if (tensionError) throw tensionError;
  if (!updated) throw new Error("This tension changed before the edit could be saved.");

  const { error: actionError } = await supabase
    .from("actions")
    .update({ source_label: `Tension · ${title}` })
    .eq("source_tension_id", tensionId)
    .eq("source_label", `Tension · ${previousTitle}`);

  if (!actionError) return;

  const { error: rollbackError } = await supabase
    .from("tensions")
    .update({ title: previousTitle })
    .eq("id", tensionId)
    .eq("raiser_id", currentUserId);

  if (rollbackError) {
    throw new Error(`${actionError.message} The tension title may already have changed; linked next-step labels were not updated.`);
  }
  throw actionError;
}
