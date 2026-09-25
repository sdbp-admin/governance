"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { cleanupTemporaryWorkFiles } from "@/lib/supabase/work-attachments";

export function TemporaryWorkFileCleanup() {
  useEffect(() => {
    let alive = true;
    let running = false;

    async function sweep() {
      if (!alive || running) return;
      running = true;
      try {
        const [projects, tensions] = await Promise.all([
          supabase.from("projects").select("id").eq("status", "complete"),
          supabase.from("tensions").select("id").eq("status", "resolved"),
        ]);

        if (projects.error) throw projects.error;
        if (tensions.error) throw tensions.error;

        for (const row of projects.data ?? []) {
          if (!alive) return;
          await cleanupTemporaryWorkFiles("project", row.id as string);
        }
        for (const row of tensions.data ?? []) {
          if (!alive) return;
          await cleanupTemporaryWorkFiles("tension", row.id as string);
        }
      } catch {
        // Cleanup is deliberately quiet and retryable. A later pass or another
        // non-conflicted board member will try again if storage was unavailable.
      } finally {
        running = false;
      }
    }

    void sweep();
    const timer = window.setInterval(() => void sweep(), 10_000);
    const onFocus = () => void sweep();
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return null;
}
