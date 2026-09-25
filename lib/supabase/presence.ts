"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const ACTIVE_WINDOW_MS = 5 * 60_000;
const PRESENCE_TRACK_THROTTLE_MS = 15_000;
const LAST_ACTIVE_WRITE_THROTTLE_MS = 60_000;

export type WorkspacePresenceSnapshot = {
  onlineIds: ReadonlySet<string>;
  activeIds: ReadonlySet<string>;
  lastSeenById: ReadonlyMap<string, string>;
  lastSeenSupported: boolean;
};

type LastSeenRow = { id: string; last_seen_at: string | null };
type PresenceMeta = {
  personId?: string;
  onlineAt?: string;
  lastActiveAt?: string;
  visible?: boolean;
};

export function useWorkspacePresence(currentPersonId: string): WorkspacePresenceSnapshot {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const [lastSeenById, setLastSeenById] = useState<Map<string, string>>(new Map());
  const [lastSeenSupported, setLastSeenSupported] = useState(true);

  useEffect(() => {
    if (!currentPersonId) return;

    let alive = true;
    let subscribed = false;
    let statusTimer: number | undefined;
    let lastSeenTimer: number | undefined;
    let lastTrackAt = 0;
    let lastPersistAt = 0;
    let visible = document.visibilityState === "visible";
    let lastActiveAt = new Date().toISOString();
    const onlineAt = lastActiveAt;
    const channel = supabase.channel("sdbp-workspace-presence");

    function syncPresence() {
      if (!alive) return;
      const state = channel.presenceState() as Record<string, PresenceMeta[]>;
      const online = new Set<string>();
      const active = new Set<string>();
      const now = Date.now();

      for (const presences of Object.values(state)) {
        for (const presence of presences) {
          if (!presence.personId) continue;
          online.add(presence.personId);
          const activityTime = new Date(presence.lastActiveAt ?? presence.onlineAt ?? "").getTime();
          const recentlyActive = Number.isFinite(activityTime) && now - activityTime < ACTIVE_WINDOW_MS;
          if (presence.visible !== false && recentlyActive) active.add(presence.personId);
        }
      }

      setOnlineIds(online);
      setActiveIds(active);
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

    async function touchLastSeen(force = false) {
      const now = Date.now();
      if (!force && now - lastPersistAt < LAST_ACTIVE_WRITE_THROTTLE_MS) return;
      lastPersistAt = now;
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

    function trackPresence(force = false) {
      if (!alive || !subscribed) return;
      const now = Date.now();
      if (!force && now - lastTrackAt < PRESENCE_TRACK_THROTTLE_MS) return;
      lastTrackAt = now;
      void channel.track({ personId: currentPersonId, onlineAt, lastActiveAt, visible });
    }

    function recordActivity() {
      if (document.visibilityState !== "visible") return;
      visible = true;
      lastActiveAt = new Date().toISOString();
      trackPresence();
      void touchLastSeen();
    }

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible) {
        lastActiveAt = new Date().toISOString();
        trackPresence(true);
        void touchLastSeen(true);
        void loadLastSeen();
      } else {
        trackPresence(true);
        void touchLastSeen(true);
      }
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribed = true;
          trackPresence(true);
          void touchLastSeen(true);
        }
      });

    void loadLastSeen();
    statusTimer = window.setInterval(syncPresence, 30_000);
    lastSeenTimer = window.setInterval(() => void loadLastSeen(), 60_000);

    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pointerdown", recordActivity, { passive: true });
    document.addEventListener("keydown", recordActivity);
    document.addEventListener("touchstart", recordActivity, { passive: true });

    return () => {
      alive = false;
      subscribed = false;
      if (statusTimer !== undefined) window.clearInterval(statusTimer);
      if (lastSeenTimer !== undefined) window.clearInterval(lastSeenTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pointerdown", recordActivity);
      document.removeEventListener("keydown", recordActivity);
      document.removeEventListener("touchstart", recordActivity);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [currentPersonId]);

  return { onlineIds, activeIds, lastSeenById, lastSeenSupported };
}

function isLastSeenSchemaMissing(error: { code?: string; message?: string }) {
  return error.code === "42703"
    || error.code === "PGRST202"
    || error.code === "PGRST204"
    || /last_seen_at|touch_my_last_seen|schema cache|does not exist/i.test(error.message ?? "");
}
