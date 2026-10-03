"use client";

import { useEffect, useRef } from "react";
import { CONSTITUTION_DRAFT } from "@/lib/constitution";

export function ConstitutionRecord({ request }: { request: { article: string } | null }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const blocks = CONSTITUTION_DRAFT.split(/\n\s*\n/);
  useEffect(() => {
    if (!request || !dialog.current) return;
    const reader = dialog.current;
    if (!reader.open) reader.showModal();
    const article = Array.from(reader.querySelectorAll<HTMLElement>('[data-article]')).find(element => element.dataset.article === request.article);
    if (article) {
      const header = reader.querySelector('header')?.getBoundingClientRect().height ?? 0;
      reader.scrollTop += article.getBoundingClientRect().top - reader.getBoundingClientRect().top - header - 16;
    }
  }, [request]);

  return <article className="record-card records-drop-card constitution-record">
    <div className="record-mark">C</div>
    <span className="kind">Our way of working</span>
    <h2>Constitution</h2>
    <p>Responsibilities, authority and how we work together in SDBP.</p>
    <p className="constitution-status">Draft for Board review · 2 October 2026</p>
    <button type="button" className="primary" onClick={() => { dialog.current?.showModal(); if (dialog.current) dialog.current.scrollTop = 0; }}>Read Constitution</button>
    <small className="constitution-note">Not yet adopted. Changes are considered through governance.</small>

    <dialog ref={dialog} className="constitution-dialog" aria-labelledby="constitution-reader-title" onClick={event => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
      }
    }}>
      <header className="constitution-reader-head">
        <div><span className="section-kicker">Records</span><h2 id="constitution-reader-title">SDBP Constitution</h2><small>Draft for Board review · not adopted</small></div>
        <button type="button" className="quiet" onClick={() => dialog.current?.close()} aria-label="Close Constitution">Close ×</button>
      </header>
      <div className="constitution-text">
        {blocks.map((block, index) => {
          if (block.startsWith("# ")) return <h1 key={index}>{block.slice(2)}</h1>;
          if (block.startsWith("## ")) return <h2 key={index} data-article={block.slice(3)}>{block.slice(3)}</h2>;
          if (block.startsWith("- ")) return <ul key={index}>{block.split("\n").map((line, item) => <li key={item}>{line.slice(2)}</li>)}</ul>;
          if (block.startsWith("**") && block.endsWith("**")) return <p key={index}><strong>{block.slice(2, -2)}</strong></p>;
          return <p key={index}>{block}</p>;
        })}
      </div>
    </dialog>
  </article>;
}
