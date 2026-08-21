import { supabase } from "@/lib/supabase/client";

const NEED_PREFIXES = ["Needs input or help from ", "Needs a real conversation with "];

export async function updateTensionNeedNote(tensionId: string, nextNote: string) {
  const note = nextNote.trim();
  if (!isNeedNote(note)) throw new Error("This request can no longer be edited here.");

  const { data: current, error: loadError } = await supabase
    .from("tensions")
    .select("latest_note,status")
    .eq("id", tensionId)
    .single();
  if (loadError) throw loadError;

  if (!current || !isNeedNote(current.latest_note) || (current.status !== "open" && current.status !== "needs_sync")) {
    throw new Error("This request has changed and can no longer be edited here.");
  }

  const previousNote = current.latest_note as string;
  const { data: updated, error: tensionError } = await supabase
    .from("tensions")
    .update({ latest_note: note })
    .eq("id", tensionId)
    .in("status", ["open", "needs_sync"])
    .select("id")
    .maybeSingle();
  if (tensionError) throw tensionError;
  if (!updated) throw new Error("This request changed before the edit could be saved.");

  const { error: attentionError } = await supabase
    .from("attention_signals")
    .update({ message: note })
    .eq("tension_id", tensionId)
    .eq("signal_type", "tension_need")
    .is("acknowledged_at", null);

  if (!attentionError) return;

  const { error: rollbackError } = await supabase
    .from("tensions")
    .update({ latest_note: previousNote })
    .eq("id", tensionId);

  if (rollbackError) {
    throw new Error(`${attentionError.message} The visible tension note may already have changed; recipient Attention messages were not updated.`);
  }
  throw attentionError;
}

function isNeedNote(note: string | null) {
  return Boolean(note && NEED_PREFIXES.some((prefix) => note.startsWith(prefix)));
}
