"use client";

import { useEffect, useRef, useState } from "react";
import { canReplaceConstitution, loadConstitutionVersions, replaceConstitution, type ConstitutionVersion } from "@/lib/supabase/constitution";

export function ConstitutionRecord({ request, profileId, onCurrentBody, onReplaced }: {
  request: { article: string } | null; profileId?: string;
  onCurrentBody: (body: string | null) => void; onReplaced: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [versions, setVersions] = useState<ConstitutionVersion[]>([]);
  const [allowed, setAllowed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const current = versions.find(version => version.status === 'current');
  const displayed = versions.find(version => version.id === selected) ?? current;
  const blocks = (displayed?.constitution_body ?? '').split(/\n\s*\n/);
  useEffect(() => {
    let cancelled = false;
    onCurrentBody(null);
    if (!profileId) return;
    Promise.all([loadConstitutionVersions(), canReplaceConstitution()]).then(([loaded, permission]) => {
      if (cancelled) return;
      setVersions(loaded); setAllowed(permission);
      onCurrentBody(loaded.find(version => version.status === 'current')?.constitution_body ?? null);
      if (!loaded.length) setError('No Constitution version is stored yet.');
    }).catch(failure => { if (!cancelled) setError(message(failure)); });
    return () => { cancelled = true; };
  }, [profileId, onCurrentBody]);
  async function save() {
    if (!current || busy) return;
    if (!window.confirm('Replace the current draft? Your name, time and explanation will be recorded. The previous version will remain available.')) return;
    setBusy(true); setError('');
    try {
      await replaceConstitution(body, reason, current.id);
      const loaded = await loadConstitutionVersions();
      setVersions(loaded); setSelected(null); setEditing(false);
      onCurrentBody(loaded.find(version => version.status === 'current')?.constitution_body ?? null);
      onReplaced();
    } catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (!request || !dialog.current) return;
    const reader = dialog.current;
    setSelected(null);
    if (!reader.open) reader.showModal();
    reader.scrollTop = 0;
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
    <p className="constitution-status">{current?.effective_on ? 'Adopted Constitution' : 'Draft for Board review'}{current ? ` · Version ${current.version_label}` : ''}</p>
    <button type="button" className="primary" disabled={!current} onClick={() => { setSelected(null); dialog.current?.showModal(); if (dialog.current) dialog.current.scrollTop = 0; }}>Read Constitution</button>
    <small className="constitution-note">{current?.effective_on ? 'Amendments require governance approval; draft replacement is unavailable.' : 'Not yet adopted. Changes are considered through governance.'}</small>
    {error && <p className="records-status error" role="alert">{error}</p>}
    {allowed && current && !current.effective_on && <details className="constitution-replace" open={editing} onToggle={event => {
      const open = event.currentTarget.open;
      if (open && !editing) { setBody(current.constitution_body); setReason(''); }
      setEditing(open);
    }}>
      <summary>Replace draft</summary>
      <p>Paste the revised text, or choose a Markdown/text file. This replaces the draft, not an adopted agreement.</p>
      <input type="file" accept=".md,.txt,text/markdown,text/plain" disabled={busy} aria-label="Choose revised Constitution" onChange={async event => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 300000) { setError('The text file must be smaller than 300 KB.'); return; }
        try { setBody(await file.text()); } catch (failure) { setError(message(failure)); }
      }} />
      <label>Revised Constitution<textarea value={body} onChange={event => setBody(event.target.value)} rows={12} maxLength={300000} disabled={busy} /></label>
      <label>What changed and why?<textarea value={reason} onChange={event => setReason(event.target.value)} rows={3} maxLength={2000} disabled={busy} /></label>
      <button type="button" className="secondary" disabled={busy || body.trim().length < 20 || reason.trim().length < 5 || body === current.constitution_body} onClick={() => void save()}>{busy ? 'Saving…' : 'Save replacement draft'}</button>
    </details>}
    {versions.length > 0 && <details className="constitution-history"><summary>Version history · {versions.length}</summary>{versions.map(version => <div className="constitution-version" key={version.id}>
      <strong>Version {version.version_label}{version.status === 'current' ? ' · Current' : ' · Previous'}</strong>
      <small>{version.author_name} · {new Date(version.created_at).toLocaleString()}</small>
      <p>{version.change_reason}</p>
      <button type="button" className="quiet" onClick={() => { setSelected(version.id); dialog.current?.showModal(); if (dialog.current) dialog.current.scrollTop = 0; }}>Read this version</button>
    </div>)}</details>}

    <dialog ref={dialog} className="constitution-dialog" aria-labelledby="constitution-reader-title" onClose={() => setSelected(null)} onClick={event => {
      if (event.target === event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
      }
    }}>
      <header className="constitution-reader-head">
        <div><span className="section-kicker">Records</span><h2 id="constitution-reader-title">SDBP Constitution</h2><small>Version {displayed?.version_label} · {displayed?.status === 'current' ? 'Current' : 'Previous'} · {displayed?.effective_on ? 'Adopted' : 'Draft — not adopted'}</small></div>
        <button type="button" className="quiet" onClick={() => dialog.current?.close()} aria-label="Close Constitution">Close ×</button>
      </header>
      <div className="constitution-text">
        {blocks.map((block, index) => {
          if (block.startsWith("# ")) return <h1 key={index} data-article={block.slice(2)}>{block.slice(2)}</h1>;
          if (block.startsWith("## ")) return <h2 key={index} data-article={block.slice(3)}>{block.slice(3)}</h2>;
          if (block.startsWith("- ")) return <ul key={index}>{block.split("\n").map((line, item) => <li key={item}>{line.slice(2)}</li>)}</ul>;
          if (block.startsWith("**") && block.endsWith("**")) return <p key={index}><strong>{block.slice(2, -2)}</strong></p>;
          return <p key={index}>{block}</p>;
        })}
      </div>
    </dialog>
  </article>;
}

function message(failure: unknown) {
  return failure && typeof failure === 'object' && 'message' in failure ? String(failure.message) : 'Could not load or replace the Constitution.';
}
