"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { loadProjectConflicts, type ProjectConflict } from "@/lib/supabase/project-coi";

export function ProjectCoiBadge({ projectId, personName }: {
  projectId: string;
  personName: (id: string) => string;
}) {
  const [conflicts, setConflicts] = useState<ProjectConflict[]>([]);
  const [popover, setPopover] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConflicts(await loadProjectConflicts(projectId));
    } catch {
      setConflicts([]);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string }>).detail;
      if (!detail?.projectId || detail.projectId === projectId) void refresh();
    };
    window.addEventListener("project-coi-changed", onChange);
    return () => window.removeEventListener("project-coi-changed", onChange);
  }, [projectId, refresh]);

  if (!conflicts.length) return null;

  const names = conflicts.map((conflict) => personName(conflict.personId));

  function show() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 330;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    setPopover({ left, top: rect.bottom + 8 });
  }

  return <>
    <button
      ref={buttonRef}
      className="project-coi-badge"
      type="button"
      aria-label={`Conflict of interest: ${names.join(", ")}`}
      title={`Conflict of interest: ${names.join(", ")}`}
      onMouseEnter={show}
      onMouseLeave={() => setPopover(null)}
      onFocus={show}
      onBlur={() => setPopover(null)}
      onClick={show}
    >
      <span aria-hidden="true">⚠</span> COI · {names.join(", ")}
    </button>
    {popover && typeof document !== "undefined" ? createPortal(
      <div className="project-coi-popover" style={{ left: popover.left, top: popover.top }} role="tooltip">
        <strong>Conflict of interest</strong>
        {conflicts.map((conflict) => <div className="project-coi-popover-person" key={conflict.id}>
          <b>{personName(conflict.personId)}</b>
          <span>{conflict.reason}</span>
        </div>)}
        <p>The project remains visible. A conflicted person cannot open other people&apos;s project files or links. Visible comments and attachment titles must stay COI-safe. Contributions from the conflicted person are flagged before others read or open them.</p>
      </div>,
      document.body,
    ) : null}
  </>;
}
