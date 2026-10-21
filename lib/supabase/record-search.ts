import { extractRecordText } from '@/lib/record-text';
import { supabase } from './client';
import { RECORDS_BUCKET, type RecordSummary } from './records';

export type RecordSearchScope = 'both' | 'statutes' | 'board_minutes';
export type RecordSearchHit = {
  record_id: string; version_id: string; title: string; record_type: string;
  document_date: string | null; page_number: number; excerpt: string;
};
export type RecordIndexState = {
  id: string; search_indexed_at: string | null;
  search_index_status: 'indexed' | 'partial' | 'unsearchable' | null;
  search_index_note: string | null;
};

export async function loadRecordIndexStates(ids: string[]): Promise<RecordIndexState[]> {
  const states: RecordIndexState[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from('record_versions')
      .select('id,search_indexed_at,search_index_status,search_index_note').in('id', ids.slice(offset, offset + 100));
    if (error) throw error;
    states.push(...data as RecordIndexState[]);
  }
  return states;
}

// An interrupted visit simply resumes with the remaining versions next time.
export async function indexRecordDocument(record: RecordSummary): Promise<void> {
  const version = record.currentVersion;
  if (!version?.storagePath) return;
  const { data: file, error } = await supabase.storage.from(RECORDS_BUCKET).download(version.storagePath);
  if (error) throw error;
  const text = await extractRecordText(file, version.storagePath);
  const { error: indexError } = await supabase.rpc('index_record_search_text', {
    target_version_id: version.id, page_texts: text.pages, problem: text.problem ?? null,
  });
  if (indexError) throw indexError;
}

export async function searchRecordDocuments(query: string, scope: RecordSearchScope): Promise<RecordSearchHit[]> {
  const { data, error } = await supabase.rpc('search_record_documents', { search_text: query.trim(), search_scope: scope });
  if (error) throw error;
  return data as RecordSearchHit[];
}
