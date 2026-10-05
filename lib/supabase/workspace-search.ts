import { supabase } from './client';
import type { WorkspaceData } from './workspace';
import { loadRecords, type RecordSummary } from './records';
import { loadRecordIndexStates, searchRecordDocuments } from './record-search';
import { loadConstitutionVersions } from './constitution';
import { searchConstitution } from '../constitution-search';
import { loadWorkAttachments, type WorkAttachment } from './work-attachments';

export type SearchTarget =
  | { kind: 'project' | 'tension' | 'action' | 'proposal' | 'role'; id: string; commentId?: string }
  | { kind: 'board'; id: string }
  | { kind: 'record'; record: RecordSummary; page?: number }
  | { kind: 'constitution'; article: string }
  | { kind: 'attachment'; attachment: WorkAttachment };
export type WorkspaceSearchHit = { key: string; title: string; context: string; excerpt: string; target: SearchTarget };
export type WorkspaceSearchResult = { hits: WorkspaceSearchHit[]; warnings: string[] };
type CommentRow = { id: string; body: string; author_id: string; project_id?: string; tension_id?: string; action_id?: string; post_id?: string };
const LIMIT = 30;

export function searchExcerpt(text: string, query: string) {
  const offset = Math.max(0, text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) - 65);
  const end = Math.min(text.length, offset + 230);
  return `${offset ? '…' : ''}${text.slice(offset, end)}${end < text.length ? '…' : ''}`;
}

// Uses the signed-in client and existing RLS/RPC projections. No service key,
// separate search index, unread changes or external service calls.
export async function searchWorkspace(query: string, workspace: WorkspaceData, userId: string): Promise<WorkspaceSearchResult> {
  const needle = query.trim();
  if (needle.length < 2) return { hits: [], warnings: [] };
  const hits: WorkspaceSearchHit[] = [];
  const warnings: string[] = [];
  const matches = (text: string) => text.toLocaleLowerCase().includes(needle.toLocaleLowerCase());
  const add = (key: string, title: string, context: string, text: string, target: SearchTarget) => {
    if (matches(text)) hits.push({ key, title, context, excerpt: searchExcerpt(text, needle), target });
  };
  const projectName = (id?: string) => workspace.projects.find(p => p.id === id)?.title ?? 'Standalone';
  for (const p of workspace.projects) add(`project:${p.id}`, p.title, `Project · ${p.status}`, `${p.title}\n${p.summary}`, { kind: 'project', id: p.id });
  for (const t of workspace.tensions) add(`tension:${t.id}`, t.title, `Tension · ${projectName(t.linkedProjectId)} · ${t.status}`, `${t.title}\n${t.latestNote ?? ''}`, { kind: 'tension', id: t.id });
  for (const a of workspace.actions) add(`action:${a.id}`, a.title, `Commitment · ${projectName(a.projectId)} · ${a.status}`, `${a.title}\n${a.declineNote ?? ''}`, { kind: 'action', id: a.id });
  for (const p of workspace.governanceProposals) add(`proposal:${p.id}`, p.title, `Governance · ${p.stage}`, `${p.title}\n${p.proposal}\n${Object.values(p.meetingNotes).join('\n')}`, { kind: 'proposal', id: p.id });
  for (const r of workspace.roles) add(`role:${r.id}`, r.title, r.isCircle ? 'Organisation · Circle' : 'Organisation · Role', [r.title,r.purpose,r.scope,...r.responsibilities,...r.accountabilities].join('\n'), { kind: 'role', id: r.id });
  for (const a of workspace.standingAgreements) {
    if (a.sourceProposalId) add(`agreement:${a.id}`, a.title, `Governance agreement · ${a.status}`, `${a.title}\n${a.body}`, { kind: 'proposal', id: a.sourceProposalId });
  }
  const pattern = `%${needle.replace(/[\\%_]/g, character => `\\${character}`)}%`;
  async function source(label: string, work: () => Promise<void>) {
    try { await work(); } catch { warnings.push(`${label} could not be searched. Results are incomplete.`); }
  }
  async function comments(table: string, parent: string, label: string, kind: 'project' | 'tension' | 'action' | 'board') {
    const { data, error } = await supabase.from(table).select(`id,body,author_id,${parent}`).ilike('body', pattern).order('created_at', { ascending: false }).limit(LIMIT + 1);
    if (error) throw error;
    let concealed = new Set<string>();
    if (kind === 'project') {
      const conflicts = await supabase.from('project_conflicts').select('project_id,person_id').is('ended_at', null);
      if (conflicts.error) throw conflicts.error;
      concealed = new Set((conflicts.data ?? []).map(c => `${c.project_id}:${c.person_id}`));
    }
    if (data.length > LIMIT) warnings.push(`${label}: showing the latest ${LIMIT} matches. Use a more specific phrase for older matches.`);
    for (const row of (data.slice(0, LIMIT) as unknown as CommentRow[])) {
      const parentId = (row as unknown as Record<string, string>)[parent];
      if (kind === 'project' && row.author_id !== userId && concealed.has(`${parentId}:${row.author_id}`)) continue;
      const item = kind === 'project' ? workspace.projects.find(p => p.id === parentId) : kind === 'tension' ? workspace.tensions.find(t => t.id === parentId) : kind === 'action' ? workspace.actions.find(a => a.id === parentId) : null;
      if (kind !== 'board' && !item) continue;
      const author = workspace.people.find(p => p.id === row.author_id)?.name ?? 'Member';
      add(`${table}:${row.id}`, item?.title ?? 'Board conversation', `${label} · ${author}`, row.body,
        kind === 'board' ? { kind: 'board', id: row.id } : { kind, id: parentId, commentId: row.id });
    }
  }
  await Promise.all([
    source('Project comments', () => comments('project_comments','project_id','Project conversation','project')),
    source('Tension comments', () => comments('tension_comments','tension_id','Tension conversation','tension')),
    source('Commitment comments', () => comments('action_comments','action_id','Commitment conversation','action')),
    source('Board messages', async () => {
      const { data,error } = await supabase.from('board_posts').select('id,body,author_id').ilike('body',pattern).order('created_at',{ascending:false}).limit(LIMIT + 1);
      if(error) throw error;
      if(data.length > LIMIT) warnings.push(`Board messages: showing the latest ${LIMIT} matches.`);
      for(const row of data.slice(0,LIMIT)) add(`board:${row.id}`,'Board conversation',`Board message · ${workspace.people.find(p => p.id === row.author_id)?.name ?? 'Member'}`,row.body,{kind:'board',id:row.id});
    }),
    source('Board replies', () => comments('board_post_comments','post_id','Board reply','board')),
    source('Links and attachments', async () => {
      const candidates = await supabase.rpc('search_workspace_attachments',{search_phrase:needle});
      if(candidates.error) throw candidates.error;
      const parents = new Map<string,{kind:'project'|'tension'|'board_post'; id:string}>();
      if(candidates.data.length > LIMIT) warnings.push('Links and attachments: refine your phrase for additional matches.');
      for(const row of candidates.data.slice(0,LIMIT) as Array<{id:string;project_id:string|null;tension_id:string|null;board_post_id:string|null}>) {
          const kind = row.project_id ? 'project' : row.tension_id ? 'tension' : 'board_post';
          const id = row.project_id ?? row.tension_id ?? row.board_post_id;
          if(id) parents.set(`${kind}:${id}`,{kind,id});
      }
      const lists = await Promise.all([...parents.values()].map(parent => loadWorkAttachments(parent.kind,parent.id)));
      for(const attachment of lists.flat()) {
        if(attachment.coiBlocked || attachment.contributorConflicted && attachment.addedBy !== userId) continue;
        add(`attachment:${attachment.id}`,attachment.title,`${attachment.kind === 'link' ? 'Saved link' : 'Attachment'} · ${attachment.parentType === 'project' ? projectName(attachment.parentId) : attachment.parentType === 'tension' ? workspace.tensions.find(t=>t.id===attachment.parentId)?.title ?? 'Tension' : 'Board'}`,`${attachment.title}\n${attachment.url ?? ''}`,{kind:'attachment',attachment});
      }
    }),
    source('Records', async () => {
      const records = await loadRecords();
      for(const record of records) if(record.currentVersion?.storagePath) add(`record:${record.id}`,record.title,'Records · Document',`${record.title}\n${record.description}`,{kind:'record',record});
      const found = await searchRecordDocuments(needle,'both');
      for(const hit of found) {
        const record = records.find(r => r.id === hit.record_id && r.currentVersion?.id === hit.version_id);
        if(record) hits.push({key:`record-page:${hit.version_id}:${hit.page_number}`,title:hit.title,context:`Records · Page ${hit.page_number}`,excerpt:hit.excerpt,target:{kind:'record',record,page:hit.page_number}});
      }
      const states = await loadRecordIndexStates(records.filter(r => ['statutes','board_minutes'].includes(r.recordType) && r.currentVersion?.storagePath).map(r=>r.currentVersion!.id));
      const expected = records.filter(r => ['statutes','board_minutes'].includes(r.recordType) && r.currentVersion?.storagePath).length;
      if(states.length < expected || states.some(s=>!s.search_indexed_at || s.search_index_status !== 'indexed')) warnings.push('Some document contents are not fully searchable. Use Records search to prepare them or check its coverage notice.');
    }),
    source('Constitution', async () => {
      const current = (await loadConstitutionVersions()).find(v=>v.status==='current');
      if(!current) throw new Error('Missing Constitution');
      for(const hit of searchConstitution(needle,current.constitution_body)) hits.push({key:`constitution:${hit.article}`,title:hit.article,context:'Records · Constitution',excerpt:hit.excerpt,target:{kind:'constitution',article:hit.article}});
    }),
  ]);
  return {hits:[...new Map(hits.map(hit=>[hit.key,hit])).values()],warnings:[...new Set(warnings)]};
}
