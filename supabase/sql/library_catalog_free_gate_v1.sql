-- FREE / LIBRARY CATALOG BOUNDARY v1 -- discovery-boundary filtering for
-- library_catalog_search / library_language_facets.
--
-- Filtering must happen before LIMIT/OFFSET so totals and pagination stay
-- correct. p_free_only is additive and defaults false; paid callers keep
-- the full catalog_ready result set, while guest/Free callers are narrowed
-- to enabled rows in public.free_catalog_works.

drop function if exists public.library_catalog_search(text, text, int, int, text);
drop function if exists public.library_catalog_search(text, text, int, int, text, boolean);

create or replace function public.library_catalog_search(
  p_query text default null,
  p_language text default null,
  p_limit int default 24,
  p_offset int default 0,
  p_jurisdiction text default null,
  p_free_only boolean default false
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
    and (w.publication_status is distinct from 'hidden')
    and (
      p_free_only = false
      or exists (
        select 1 from public.free_catalog_works fcw
        where fcw.work_id = w.id and fcw.enabled
      )
    )
    and (
      p_query is null
      or btrim(p_query) = ''
      or w.title ilike '%' || p_query || '%'
      or w.original_title ilike '%' || p_query || '%'
      or exists (
        select 1 from unnest(coalesce(w.alternative_titles, array[]::text[])) as t
        where t ilike '%' || p_query || '%'
      )
      or a.name ilike '%' || p_query || '%'
      or exists (
        select 1 from unnest(coalesce(a.alternative_names, array[]::text[])) as n
        where n ilike '%' || p_query || '%'
      )
    )
    and (
      p_language is null
      or p_language = ''
      or exists (
        select 1
        from public.editions e
        where e.work_id = w.id
          and e.language = p_language
          and e.ingestion_status = 'ready'
          and exists (
            select 1 from public.book_files bf
            where bf.edition_id = e.id
              and bf.kind = 'normalized'
              and bf.format = 'anki-json'
              and bf.ingestion_status = 'ready'
          )
          and exists (
            select 1 from public.rights_assertions ra
            where ra.edition_id = e.id
              and ra.status = 'public-domain'
              and (
                p_jurisdiction is null
                or p_jurisdiction = ''
                or ra.jurisdiction = p_jurisdiction
              )
          )
      )
    )
  order by w.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.library_catalog_search(text, text, int, int, text, boolean) from public;
revoke all on function public.library_catalog_search(text, text, int, int, text, boolean) from anon;
revoke all on function public.library_catalog_search(text, text, int, int, text, boolean) from authenticated;
grant execute on function public.library_catalog_search(text, text, int, int, text, boolean) to service_role;

drop function if exists public.library_language_facets(text, text);
drop function if exists public.library_language_facets(text, text, boolean);

create or replace function public.library_language_facets(
  p_query text default null,
  p_jurisdiction text default null,
  p_free_only boolean default false
)
returns table (
  language text,
  work_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    e.language,
    count(distinct w.id) as work_count
  from public.works w
  join public.work_readiness wr on wr.work_id = w.id
  left join public.authors a on a.id = w.author_id
  join public.editions e on e.work_id = w.id
  where
    wr.catalog_ready = true
    and (w.publication_status is distinct from 'hidden')
    and (
      p_free_only = false
      or exists (
        select 1 from public.free_catalog_works fcw
        where fcw.work_id = w.id and fcw.enabled
      )
    )
    and (
      p_query is null
      or btrim(p_query) = ''
      or w.title ilike '%' || p_query || '%'
      or w.original_title ilike '%' || p_query || '%'
      or exists (
        select 1 from unnest(coalesce(w.alternative_titles, array[]::text[])) as t
        where t ilike '%' || p_query || '%'
      )
      or a.name ilike '%' || p_query || '%'
      or exists (
        select 1 from unnest(coalesce(a.alternative_names, array[]::text[])) as n
        where n ilike '%' || p_query || '%'
      )
    )
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
      select 1 from public.rights_assertions ra
      where ra.edition_id = e.id
        and ra.status = 'public-domain'
        and (
          p_jurisdiction is null
          or p_jurisdiction = ''
          or ra.jurisdiction = p_jurisdiction
        )
    )
  group by e.language
  order by work_count desc, e.language asc;
$$;

revoke all on function public.library_language_facets(text, text, boolean) from public;
revoke all on function public.library_language_facets(text, text, boolean) from anon;
revoke all on function public.library_language_facets(text, text, boolean) from authenticated;
grant execute on function public.library_language_facets(text, text, boolean) to service_role;
