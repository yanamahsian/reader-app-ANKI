-- THE CANON v2: dynamic, catalog-backed literary traditions.
--
-- The original Canon pilot intentionally proved the schema with one manually
-- curated nine-work path. Product v2 must not require hand-editing a path
-- every time the catalog grows. These two service-role-only RPCs derive
-- Canon directly from catalog-ready, readable public-domain Works by the
-- Work's ORIGINAL language/tradition.

create or replace function public.canon_catalog_sections(
  p_jurisdiction text default null
)
returns table (
  original_language text,
  work_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    w.original_language,
    count(*)::bigint as work_count
  from public.works w
  join public.work_readiness wr on wr.work_id = w.id
  where
    wr.catalog_ready = true
    and w.publication_status is distinct from 'hidden'
    and w.original_language is not null
    and btrim(w.original_language) <> ''
    and exists (
      select 1
      from public.editions e
      where e.work_id = w.id
        and e.ingestion_status = 'ready'
        and exists (
          select 1
          from public.book_files bf
          where bf.edition_id = e.id
            and bf.kind = 'normalized'
            and bf.format = 'anki-json'
            and bf.ingestion_status = 'ready'
        )
        and exists (
          select 1
          from public.rights_assertions ra
          where ra.edition_id = e.id
            and ra.status = 'public-domain'
            and (
              p_jurisdiction is null
              or p_jurisdiction = ''
              or ra.jurisdiction = p_jurisdiction
            )
        )
    )
  group by w.original_language
  order by count(*) desc, w.original_language asc;
$$;

create or replace function public.canon_catalog_search(
  p_original_language text,
  p_limit integer default 100,
  p_offset integer default 0,
  p_jurisdiction text default null
)
returns table (
  work_id text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    w.id::text as work_id,
    count(*) over () as total_count
  from public.works w
  join public.work_readiness wr on wr.work_id = w.id
  left join public.authors a on a.id = w.author_id
  where
    wr.catalog_ready = true
    and w.publication_status is distinct from 'hidden'
    and w.original_language = p_original_language
    and exists (
      select 1
      from public.editions e
      where e.work_id = w.id
        and e.ingestion_status = 'ready'
        and exists (
          select 1
          from public.book_files bf
          where bf.edition_id = e.id
            and bf.kind = 'normalized'
            and bf.format = 'anki-json'
            and bf.ingestion_status = 'ready'
        )
        and exists (
          select 1
          from public.rights_assertions ra
          where ra.edition_id = e.id
            and ra.status = 'public-domain'
            and (
              p_jurisdiction is null
              or p_jurisdiction = ''
              or ra.jurisdiction = p_jurisdiction
            )
        )
    )
  order by
    w.publication_year asc nulls last,
    lower(coalesce(a.name, '')) asc,
    lower(w.title) asc,
    w.id asc
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.canon_catalog_sections(text) from public;
revoke all on function public.canon_catalog_sections(text) from anon;
revoke all on function public.canon_catalog_sections(text) from authenticated;
grant execute on function public.canon_catalog_sections(text) to service_role;

revoke all on function public.canon_catalog_search(text, integer, integer, text) from public;
revoke all on function public.canon_catalog_search(text, integer, integer, text) from anon;
revoke all on function public.canon_catalog_search(text, integer, integer, text) from authenticated;
grant execute on function public.canon_catalog_search(text, integer, integer, text) to service_role;
