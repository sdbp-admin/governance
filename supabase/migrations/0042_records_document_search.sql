-- Searchable text is a derived copy. Original documents remain authoritative.
alter table public.record_versions
  add column search_indexed_at timestamptz,
  add column search_index_status text check (search_index_status in ('indexed', 'partial', 'unsearchable')),
  add column search_index_note text;

create table public.record_search_pages (
  version_id uuid not null references public.record_versions(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  body text not null,
  search_vector tsvector generated always as (to_tsvector('simple', body)) stored,
  primary key (version_id, page_number)
);
create index record_search_pages_text on public.record_search_pages using gin (search_vector);
alter table public.record_search_pages enable row level security;
revoke all on public.record_search_pages from public, anon;
grant select, insert, delete on public.record_search_pages to authenticated;
create policy "board members read record search text"
  on public.record_search_pages for select to authenticated
  using ((select public.is_board_member()));
create policy "board members index record search text"
  on public.record_search_pages for insert to authenticated
  with check ((select public.is_board_member()));
create policy "board members replace record search text"
  on public.record_search_pages for delete to authenticated
  using ((select public.is_board_member()));

-- One atomic write per version; a concurrent visitor cannot duplicate its index.
create function public.index_record_search_text(target_version_id uuid, page_texts text[], problem text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare
  v_indexed_at timestamptz;
  v_pages integer := coalesce(cardinality(page_texts), 0);
  v_readable integer;
begin
  if not public.is_board_member() then raise exception 'Board membership required.'; end if;
  select v.search_indexed_at into v_indexed_at
  from public.record_versions v join public.records r on r.id = v.record_id
  where v.id = target_version_id and v.status = 'current' and r.deleted_at is null
    and r.record_type in ('statutes', 'board_minutes')
  for update of v;
  if not found then raise exception 'Current document version not available.'; end if;
  if v_indexed_at is not null then return; end if;
  if v_pages > 500 or (select coalesce(sum(length(t)), 0) from unnest(page_texts) t) > 10000000 then
    raise exception 'Document exceeds search indexing limits.';
  end if;
  delete from public.record_search_pages where version_id = target_version_id;
  insert into public.record_search_pages(version_id, page_number, body)
  select target_version_id, n::integer, t from unnest(page_texts) with ordinality as pages(t, n)
  where length(btrim(coalesce(t, ''))) > 0;
  get diagnostics v_readable = row_count;
  update public.record_versions set
    search_indexed_at = now(),
    search_index_status = case when v_readable = 0 then 'unsearchable' when v_readable < v_pages then 'partial' else 'indexed' end,
    search_index_note = case when v_readable = 0 then coalesce(problem, 'No extractable text. A scanned document may need OCR.')
      when v_readable < v_pages then 'Some pages have no extractable text; they may be blank or scanned.' else null end
  where id = target_version_id;
end;
$$;
revoke all on function public.index_record_search_text(uuid, text[], text) from public, anon;
grant execute on function public.index_record_search_text(uuid, text[], text) to authenticated;

create function public.search_record_documents(search_text text, search_scope text default 'both')
returns table(record_id uuid, version_id uuid, title text, record_type text, document_date date, page_number integer, excerpt text)
language plpgsql stable security invoker set search_path = public as $$
declare v_query tsquery;
begin
  if not public.is_board_member() then raise exception 'Board membership required.'; end if;
  if search_scope not in ('both', 'statutes', 'board_minutes') then raise exception 'Choose minutes, statutes or both.'; end if;
  if length(btrim(search_text)) < 2 or length(search_text) > 200 then raise exception 'Enter between 2 and 200 characters.'; end if;
  v_query := websearch_to_tsquery('simple', search_text);
  return query
  select r.id, v.id, r.title, r.record_type, v.effective_on, p.page_number,
    ts_headline('simple', p.body, v_query, 'StartSel=, StopSel=, MaxWords=45, MinWords=20, MaxFragments=2')
  from public.record_search_pages p
  join public.record_versions v on v.id = p.version_id
  join public.records r on r.id = v.record_id
  where p.search_vector @@ v_query and v.status = 'current' and r.deleted_at is null
    and r.record_type in ('statutes', 'board_minutes')
    and (search_scope = 'both' or r.record_type = search_scope)
  order by ts_rank_cd(p.search_vector, v_query) desc, v.effective_on desc nulls last, r.id, p.page_number
  limit 50;
end;
$$;
revoke all on function public.search_record_documents(text, text) from public, anon;
grant execute on function public.search_record_documents(text, text) to authenticated;
