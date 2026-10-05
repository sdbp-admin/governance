"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { WorkspaceData } from '@/lib/supabase/workspace';
import { searchWorkspace, type SearchTarget, type WorkspaceSearchResult } from '@/lib/supabase/workspace-search';
import styles from './workspace-search.module.css';

export function WorkspaceSearch({workspace,userId,onOpen}:{workspace:WorkspaceData;userId:string;onOpen:(target:SearchTarget)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<WorkspaceSearchResult|null>(null);
  const sequence=useRef(0);
  useEffect(()=>()=>{sequence.current++;},[]);
  async function search(event:FormEvent) {
    event.preventDefault();
    if(query.trim().length<2 || busy)return;
    const current=++sequence.current;
    setBusy(true);setResult(null);
    try { const next=await searchWorkspace(query,workspace,userId); if(current===sequence.current)setResult(next); }
    catch {if(current===sequence.current)setResult({hits:[],warnings:['Search could not finish. Please try again.']});}
    finally {if(current===sequence.current)setBusy(false);}
  }
  return <>
    <button type="button" onClick={()=>dialog.current?.showModal()}>Search</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="workspace-search-title" onClose={()=>{sequence.current++;setBusy(false);}}>
      <header><div><h2 id="workspace-search-title">Search Workspace</h2><p>Find text, conversations, links and records stored here.</p></div><button type="button" onClick={()=>dialog.current?.close()}>Close ×</button></header>
      <form onSubmit={search}><label className={styles.label}>Words or phrase<input autoFocus type="search" maxLength={200} value={query} placeholder="What are you looking for?" onChange={event=>{sequence.current++;setBusy(false);setQuery(event.target.value);setResult(null);}} /></label><button type="submit" disabled={busy||query.trim().length<2}>{busy?'Searching…':'Search'}</button></form>
      <div aria-live="polite">{result&&<p>{result.hits.length} {result.hits.length===1?'result':'results'}{!result.hits.length?' — try another word or phrase.':'.'}</p>}{result?.warnings.map(warning=><p className={styles.warning} key={warning}>{warning}</p>)}</div>
      <div className={styles.results}>{result?.hits.map(hit=><button type="button" key={hit.key} onClick={()=>{dialog.current?.close();onOpen(hit.target);}}><small>{hit.context}</small><strong>{hit.title}</strong><span>{hit.excerpt}</span><small>Open ↗</small></button>)}</div>
      <p className={styles.note}>Search uses your existing access. File contents are included only where Records supports searching them. No external services are searched.</p>
    </dialog>
  </>;
}
