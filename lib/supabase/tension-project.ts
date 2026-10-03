import { supabase } from "@/lib/supabase/client";

export async function setTensionProject(tensionId: string, projectId?: string | null) {
  const { error } = await supabase.rpc("set_tension_project", {
    target_tension_id: tensionId,
    target_project_id: projectId || null,
  });

  if (!error) return;

  // Keep project labelling usable during the short window before migration 0015 is
  // applied. The migration replaces this fallback with an attributable RPC.
  if (isMissingRpc(error)) {
    const { error: fallbackError } = await supabase
      .from("tensions")
      .update({ project_id: projectId || null })
      .eq("id", tensionId);
    if (fallbackError) throw fallbackError;
    return;
  }

  throw error;
}

function isMissingRpc(error: { code?: string; message?: string }) {
  return error.code === "PGRST202" || /set_tension_project|function.*does not exist|schema cache/i.test(error.message ?? "");
}
