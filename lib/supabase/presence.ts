"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type WorkspacePresenceSnapshot = {
  onlineIds: ReadonlySet<string>;
  lastSeenById: ReadonlyMap<string, string>;
  lastSeenSupported: boolean;
};

type LastSeenRow = { id: string; last_seen_at: string | null };
type PresenceMeta = { personId?: string };

export function useWorkspacePresence(currentPersonId: string): WorkspacePresenceSnapshot {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [lastSeenById, setLastSeenById] = useState<Map<string, string>>(new Map());
  const [lastSeenSupported, setLastSeenSupported] = useState(true);

  useEffect(() => {
    if (!currentPersonId) return;

    let alive = true;
    let heartbeat: number | undefined;
    const channel = supabase.channel("sdbp-workspace-presence");

    function syncOnline() {
      if (!alive) return;
      const state = channel.presenceState() as Record<string, PresenceMeta[]>;
      const people = new Set<string>();
      for (const presences of Object.values(state)) {
        for (const presence of presences) {
          if (presence.personId) people.add(presence.personId);
        }
      }
      setOnlineIds(people);
    }

    async function loadLastSeen() {
      const result = await supabase
        .from("people")
        .select("id,last_seen_at")
        .eq("active", true);
      if (!alive) return;
      if (result.error) {
        if (isLastSeenSchemaMissing(result.error)) {
          setLastSeenSupported(false);
          return;
        }
        console.warn("Could not load workspace last-seen timestamps", result.error);
        return;
      }
      setLastSeenSupported(true);
      setLastSeenById(new Map(((result.data ?? []) as LastSeenRow[])
        .filter((row) => Boolean(row.last_seen_at))
        .map((row) => [row.id, row.last_seen_at as string] as const)));
    }

    async function touchLastSeen() {
      const result = await supabase.rpc("touch_my_last_seen");
      if (!alive) return;
      if (result.error) {
        if (isLastSeenSchemaMissing(result.error)) {
          setLastSeenSupported(false);
          return;
        }
        console.warn("Could not update workspace last-seen timestamp", result.error);
        return;
      }
      if (typeof result.data === "string") {
        setLastSeenSupported(true);
        setLastSeenById((current) => new Map(current).set(currentPersonId, result.data as string));
      }
    }

    channel
      .on("presence", { event: "sync" }, syncOnline)
      .on("presence", { event: "join" }, syncOnline)
      .on("presence", { event: "leave" }, syncOnline)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ personId: currentPersonId, onlineAt: new Date().toISOString() });
          void touchLastSeen();
        }
      });

    void loadLastSeen();
    heartbeat = window.setInterval(() => {
      void touchLastSeen();
      void loadLastSeen();
    }, 60_000);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void touchLastSeen();
        void loadLastSeen();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      if (heartbeat !== undefined) window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibility);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [currentPersonId]);

  return { onlineIds, lastSeenById, lastSeenSupported };
}

function isLastSeenSchemaMissing(error: { code?: string; message?: string }) {
  return error.code === "42703"
    || error.code === "PGRST202"
    || error.code === "PGRST204"
    || /last_seen_at|touch_my_last_seen|schema cache|does not exist/i.test(error.message ?? "");
}
