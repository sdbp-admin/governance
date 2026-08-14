import { supabase } from "@/lib/supabase/client";

export async function setTensionProject(tensionId: string, projectId?: string | null) {
  const { error } = await supabase
    .from("tensions")
    .update({ project_id: projectId || null })
    .eq("id", tensionId);
  if (error) throw error;
}
