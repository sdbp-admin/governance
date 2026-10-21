"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { cleanupTemporaryWorkFiles } from "@/lib/supabase/work-attachments";

export function TemporaryWorkFileCleanup() {
  useEffect(() => {
    let alive = true;
    let running = false;

    async function sweep() {
      if (!alive || running || document.hidden) return;
      running = true;
      try {
        // Only investigate parents with an actual remaining file. The old
        // implementation scanned every completed project and resolved tension.
        const pending = await supabase.from("work_attachments")
          .select("project_id,tension_id").eq("attachment_kind", "file").is("removed_at", null);
        if (pending.error) throw pending.error;
        const projectIds = [...new Set((pending.data ?? []).flatMap(row => row.project_id ? [row.project_id] : []))];
        const tensionIds = [...new Set((pending.data ?? []).flatMap(row => row.tension_id ? [row.tension_id] : []))];
        if (!projectIds.length && !tensionIds.length) return;

        const [projects, tensions] = await Promise.all([
          projectIds.length ? supabase.from("projects").select("id").eq("status", "complete").in("id", projectIds) : Promise.resolve({ data: [], error: null }),
          tensionIds.length ? supabase.from("tensions").select("id").eq("status", "resolved").in("id", tensionIds) : Promise.resolve({ data: [], error: null }),
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

    // Recovery sweep for files left by earlier versions. Normal cleanup now runs
    // directly when a project is completed or a tension is resolved.
    // Limit the recovery scan to once per browser per day.
    const recoveryKey = "sdbp:temporary-files:last-recovery-sweep";
    const now = Date.now();
    const previous = Number(window.localStorage.getItem(recoveryKey) ?? 0);
    if (!previous || now - previous > 24 * 60 * 60_000) {
      window.localStorage.setItem(recoveryKey, String(now));
      void sweep();
    }

    return () => {
      alive = false;
    };
  }, []);

  return null;
}
