import { supabase } from "@/lib/supabase/client";

export async function loadUrgentTensionIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from("tensions").select("id,is_urgent").eq("is_urgent", true);
  if (error) {
    if (isOptionalSchemaError(error)) return new Set();
    throw error;
  }
  return new Set((data ?? []).map((row) => row.id as string));
}

export async function setTensionUrgency(tensionId: string, urgent: boolean) {
  const { error } = await supabase.rpc("set_tension_urgency", {
    target_tension_id: tensionId,
    urgent,
  });
  if (error) throw error;
}

function isOptionalSchemaError(error: { code?: string; message?: string }) {
  return error.code === "42703" || error.code === "PGRST204" || /is_urgent|schema cache|does not exist/i.test(error.message ?? "");
}
