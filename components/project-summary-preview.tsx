"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

export function ProjectSummaryPreview({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 260 || text.split(/\r?\n/).length > 4;

  return <>
    <div className={long ? "project-summary project-summary-preview" : "project-summary"}>
      <LinkifiedText text={text} />
      {long && <button className="project-summary-open" type="button" onClick={() => setOpen(true)}>View full current state</button>}
    </div>
    {open && typeof document !== "undefined" && createPortal(
      <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
        <section className="workflow-editor compact-modal project-context-modal project-summary-modal" role="dialog" aria-modal="true">
          <div className="editor-head"><div><span className="section-kicker">Current state</span><h2>{title}</h2></div><button className="quiet editor-close" type="button" onClick={() => setOpen(false)}>×</button></div>
          <div className="project-summary-full"><LinkifiedText text={text} /></div>
          <div className="editor-actions"><div /><button className="secondary" type="button" onClick={() => setOpen(false)}>Close</button></div>
        </section>
      </div>,
      document.body,
    )}
  </>;
}

function LinkifiedText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <p>{parts.map((part, index) => /^https?:\/\//.test(part) ? <a href={part} target="_blank" rel="noreferrer" key={`${part}-${index}`}>{part}</a> : <span key={index}>{part}</span>)}</p>;
}
