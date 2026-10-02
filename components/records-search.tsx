"use client";

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { RecordSummary } from '@/lib/supabase/records';
import { indexRecordDocument, loadRecordIndexStates, searchRecordDocuments, type RecordIndexState, type RecordSearchHit, type RecordSearchScope } from '@/lib/supabase/record-search';

export function RecordsSearch({ records, onOpen }: { records: RecordSummary[]; onOpen: (record: RecordSummary, page?: number) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<RecordSearchScope>('board_minutes');
  const [states, setStates] = useState<RecordIndexState[]>([]);
  const [pending, setPending] = useState(0);
  const [preparing, setPreparing] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [hits, setHits] = useState<RecordSearchHit[]>([]);
  const [error, setError] = useState('');
  const [indexError, setIndexError] = useState('');
  const searchGeneration = useRef(0);
  const documents = records.filter(record => (record.recordType === 'statutes' || record.recordType === 'board_minutes') && record.currentVersion?.storagePath);
  const versionsKey = documents.map(record => record.currentVersion!.id).sort().join(',');
  const recordsRef = useRef(documents);
  recordsRef.current = documents;

  useEffect(() => {
    let cancelled = false;
    const current = recordsRef.current;
    const ids = current.map(record => record.currentVersion!.id);
    searchGeneration.current++;
    setHits([]); setSearched(false); setSearching(false); setError(''); setIndexError(''); setPreparing(true); setPending(0);
    async function prepare() {
      try {
        const existing = await loadRecordIndexStates(ids);
        if (cancelled) return;
        setStates(existing);
        const missing = current.filter(record => !existing.find(state => state.id === record.currentVersion!.id)?.search_indexed_at);
        setPending(missing.length);
        let failures = 0;
        for (const record of missing) {
          if (cancelled) return;
          try { await indexRecordDocument(record); }
          catch { failures++; }
          if (cancelled) return;
          setPending(count => Math.max(0, count - 1));
        }
        const refreshed = await loadRecordIndexStates(ids);
        if (!cancelled) {
          setStates(refreshed);
          if (failures) setIndexError(`${failures} ${failures === 1 ? 'document could' : 'documents could'} not be prepared. Results may be incomplete. Reopen Records to retry.`);
        }
      } catch (failure) {
        if (!cancelled) setIndexError(message(failure));
      } finally {
        if (!cancelled) setPreparing(false);
      }
    }
    void prepare();
    return () => { cancelled = true; };
  }, [versionsKey]);

  function invalidate() { searchGeneration.current++; setHits([]); setSearched(false); setSearching(false); }
  async function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2 || preparing || searching) return;
    const generation = ++searchGeneration.current;
    setSearching(true); setError('');
    try {
      const result = await searchRecordDocuments(query, scope);
      if (generation === searchGeneration.current) { setHits(result); setSearched(true); }
    } catch (failure) { if (generation === searchGeneration.current) setError(message(failure)); }
    finally { if (generation === searchGeneration.current) setSearching(false); }
  }
  const incomplete = documents.filter(record => (scope === 'both' || record.recordType === scope)
    && states.some(state => state.id === record.currentVersion!.id && (state.search_index_status === 'partial' || state.search_index_status === 'unsearchable')));

  return <section className="records-search" aria-label="Search document contents">
    <form onSubmit={search} className="records-search-form">
      <label><span>Find a recorded agreement or passage</span><input type="search" value={query} maxLength={200} placeholder="Search inside documents…" onChange={event => { setQuery(event.target.value); invalidate(); }} /></label>
      <label><span>Search in</span><select value={scope} onChange={event => { setScope(event.target.value as RecordSearchScope); invalidate(); }}><option value="board_minutes">Minutes</option><option value="statutes">Statutes</option><option value="both">Both</option></select></label>
      <button type="submit" className="secondary" disabled={preparing || searching || query.trim().length < 2}>{searching ? 'Searching…' : 'Search'}</button>
    </form>
    <div aria-live="polite">
      {preparing && <p className="records-search-note">{pending ? `Preparing ${pending} remaining ${pending === 1 ? 'document' : 'documents'} for search…` : 'Checking searchable documents…'} This is needed only once per document version.</p>}
      {error && <p className="records-status error" role="alert">{error}</p>}
      {indexError && <p className="records-status warning" role="alert">{indexError}</p>}
      {searched && <p className="records-search-note">{hits.length ? `${hits.length}${hits.length === 50 ? '+' : ''} matching ${hits.length === 1 ? 'passage' : 'passages'}. Open the document to read the original context.` : 'No matching passages found. Try fewer words or another phrase.'}</p>}
    </div>
    {hits.length > 0 && <div className="records-search-results">{hits.map(hit => {
      const record = documents.find(item => item.id === hit.record_id && item.currentVersion?.id === hit.version_id);
      if (!record) return null;
      return <button key={`${hit.version_id}-${hit.page_number}`} type="button" className="records-search-result" onClick={() => void onOpen(record, hit.page_number)}>
        <strong>{hit.title}</strong><small>{hit.record_type === 'statutes' ? 'Statutes' : 'Minutes'}{hit.document_date ? ` · ${new Date(`${hit.document_date}T12:00:00`).toLocaleDateString()}` : ''}{/\.pdf$/i.test(record.currentVersion?.storagePath ?? '') || record.currentVersion?.mimeType === 'application/pdf' ? ` · Page ${hit.page_number}` : ''}</small>
        <p>{hit.excerpt}</p><span>Open document ↗</span>
      </button>;
    })}</div>}
    {incomplete.length > 0 && <details className="records-search-coverage"><summary>{incomplete.length} {incomplete.length === 1 ? 'document has' : 'documents have'} content that cannot be searched</summary>{incomplete.map(record => <p key={record.id}><strong>{record.title}</strong> · {states.find(state => state.id === record.currentVersion!.id)?.search_index_note} <button className="quiet small" onClick={() => void onOpen(record)}>Open</button></p>)}</details>}
  </section>;
}

function message(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Could not prepare or search the documents. Please reopen Records to try again.';
}
