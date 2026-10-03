"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./organisation-governance.module.css";

export function GovernanceFocus({ title, onClose, children, focusTargetId }: { title: string; onClose: () => void; children: ReactNode; focusTargetId?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  useEffect(() => { if (!focusTargetId) return; const timer = window.setTimeout(() => { const target = document.getElementById(focusTargetId); target?.scrollIntoView({ block: "start" }); target?.focus({ preventScroll: true }); }, 100); return () => window.clearTimeout(timer); }, [focusTargetId]);
  return <dialog ref={ref} className={styles.dialog} aria-label={title} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <div className={styles.dialogHead}><span className="section-kicker">{title}</span><button type="button" onClick={onClose} aria-label="Close proposal details">Back to overview ×</button></div>
    {children}
  </dialog>;
}
