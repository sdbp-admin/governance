"use client";

import styles from "./spatial.module.css";

/** Pause presentation only. The recorded item, unread count and obligation stay intact. */
export function SpatialPulsePause({ until, onPause }: { until?: number; onPause: (hours: 0 | 24 | 48 | 72 | 168) => void }) {
  return <details className={styles.pulsePause}>
    <summary>{until && until > Date.now() ? `Pulse paused until ${new Date(until).toLocaleString()}` : "Pause pulse"}</summary>
    <div>{([24, 48, 72, 168] as const).map(hours => <button type="button" key={hours} onClick={() => onPause(hours)}>{hours === 168 ? "1 week" : `${hours} hours`}</button>)}
      {until && until > Date.now() && <button type="button" onClick={() => onPause(0)}>Resume now</button>}
    </div>
    <small>The item stays open. A new signal can still draw your attention.</small>
  </details>;
}
