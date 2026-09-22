import { supabase } from "./client";

export type OperationalAttentionSnooze = {
  attentionKind: string;
  sourceId: string;
  snoozedUntil: string;
};

export async function loadOperationalAttentionSnoozes(): Promise<OperationalAttentionSnooze[]> {
  const result = await supabase
    .from("operational_attention_snoozes")
    .select("attention_kind,source_id,snoozed_until");
  if (result.error) throw result.error;
  return (result.data ?? []).map(row => ({
    attentionKind: row.attention_kind as string,
    sourceId: row.source_id as string,
    snoozedUntil: row.snoozed_until as string,
  }));
}

export async function snoozeOperationalAttention(attentionKind: string, sourceId: string): Promise<void> {
  const result = await supabase.rpc("snooze_operational_attention", {
    target_kind: attentionKind,
    target_source_id: sourceId,
  });
  if (result.error) throw result.error;
}
