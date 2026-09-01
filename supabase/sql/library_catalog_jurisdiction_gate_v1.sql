-- LIBRARY CATALOG JURISDICTION CONSISTENCY v1
--
-- Fixes a discovery/readability mismatch in library_catalog_search().
-- Previously p_jurisdiction was checked only inside the optional
-- p_language branch. With no language selected (the normal "Все языки"
-- Library view), any catalog_ready Work could match even when none of its
-- readable Editions had public-domain rights for the visitor's selected
-- jurisdiction. Book Detail / omnia-book-content would then correctly
-- refuse that Work later, so discovery and actual readability disagreed.
--
-- The qualifying-Edition EXISTS below is now unconditional. p_language
-- remains optional inside that SAME Edition predicate, so when a language
-- is selected the Work must have one Edition that satisfies both the
-- requested language and the requested jurisdiction. When no language is
-- selected, the Work must still have at least one genuinely readable
-- Edition for the selected jurisdiction.
--
-- p_free_only remains an independent discovery boundary and is unchanged.
-- library_language_facets already applied jurisdiction independently at
-- Edition level, so it requires no change in this migration.

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
        select 1
        from public.free_catalog_works fcw
        where fcw.work_id = w.id
          and fcw.enabled
      )
    )
    and (
      p_query is null
      or btrim(p_query) = ''
      or w.title ilike '%' || p_query || '%'
      or w.original_title ilike '%' || p_query || '%'
      or exists (
        select 1
        from unnest(coalesce(w.alternative_titles, array[]::text[])) as t
        where t ilike '%' || p_query || '%'
      )
      or a.name ilike '%' || p_query || '%'
      or exists (
        select 1
        from unnest(coalesce(a.alternative_names, array[]::text[])) as n
        where n ilike '%' || p_query || '%'
      )
    )
    and exists (
      select 1
      from public.editions e
      where e.work_id = w.id
        and (
          p_language is null
          or p_language = ''
          or e.language = p_language
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
  order by w.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

revoke all on function public.library_catalog_search(text, text, int, int, text, boolean) from public;
revoke all on function public.library_catalog_search(text, text, int, int, text, boolean) from anon;
revoke all on function public.library_catalog_search(text, text, int, int, text, boolean) from authenticated;
grant execute on function public.library_catalog_search(text, text, int, int, text, boolean) to service_role;
