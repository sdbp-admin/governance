"use client";

import { useRef } from "react";
import styles from "./spatial.module.css";

/** Pause presentation only. The recorded item, unread count and obligation stay intact. */
export function SpatialPulsePause({ until, onPause }: { until?: number; onPause: (hours: 0 | 24 | 48 | 72 | 168) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  function choose(hours: 0 | 24 | 48 | 72 | 168) {
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    }
    onPause(hours);
  }
  return <details ref={menu} className={styles.pulsePause}>
    <summary>{until && until > Date.now() ? `Pulse paused until ${new Date(until).toLocaleString()}` : "Pause pulse"}</summary>
    <div>{([24, 48, 72, 168] as const).map(hours => <button type="button" key={hours} onClick={() => choose(hours)}>{hours === 168 ? "1 week" : `${hours} hours`}</button>)}
      {until && until > Date.now() && <button type="button" onClick={() => choose(0)}>Resume now</button>}
    </div>
    <small>The item stays open. A new signal can still draw your attention.</small>
  </details>;
}
