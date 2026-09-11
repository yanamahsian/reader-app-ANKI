-- AESTESIS CATALOG RPC OVERLOADS v1
-- Backward-compatible production-aligned overloads. Existing 7-arg/3-arg
-- RPCs remain intact; these exact-signature overloads add p_aestesis_only.
-- No defaults are declared here, deliberately avoiding Postgres ambiguity
-- with the existing defaulted overloads.

create or replace function public.library_catalog_search(
  p_query text,
  p_language text,
  p_limit integer,
  p_offset integer,
  p_jurisdiction text,
  p_free_only boolean,
  p_preferred_languages text[],
  p_aestesis_only boolean
)
returns table(work_id text, total_count bigint)
language sql
stable
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
      p_aestesis_only = false
      or exists (
        select 1 from public.aestesis_catalog_works acw
        where acw.work_id = w.id and acw.enabled
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
    and exists (
      select 1
      from public.editions e
      where e.work_id = w.id
        and (p_language is null or p_language = '' or e.language = p_language)
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
            and (p_jurisdiction is null or p_jurisdiction = '' or ra.jurisdiction = p_jurisdiction)
        )
    )
  order by
    case when p_aestesis_only then (
      select acw.sort_order
      from public.aestesis_catalog_works acw
      where acw.work_id = w.id and acw.enabled
    ) else null end asc nulls last,
    (
      p_preferred_languages is not null
      and exists (
        select 1
        from public.editions pe
        where pe.work_id = w.id
          and pe.language = any(p_preferred_languages)
          and pe.ingestion_status = 'ready'
          and exists (
            select 1 from public.book_files pbf
            where pbf.edition_id = pe.id
              and pbf.kind = 'normalized'
              and pbf.format = 'anki-json'
              and pbf.ingestion_status = 'ready'
          )
          and exists (
            select 1 from public.rights_assertions pra
            where pra.edition_id = pe.id
              and pra.status = 'public-domain'
              and (p_jurisdiction is null or p_jurisdiction = '' or pra.jurisdiction = p_jurisdiction)
          )
      )
    ) desc,
    w.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

create or replace function public.library_language_facets(
  p_query text,
  p_jurisdiction text,
  p_free_only boolean,
  p_aestesis_only boolean
)
returns table(language text, work_count bigint)
language sql
stable
set search_path = public
as $$
  select e.language, count(distinct w.id) as work_count
  from public.works w
  join public.work_readiness wr on wr.work_id = w.id
  left join public.authors a on a.id = w.author_id
  join public.editions e on e.work_id = w.id
  where
    wr.catalog_ready = true
    and (w.publication_status is distinct from 'hidden')
    and (
      p_free_only = false
      or exists (select 1 from public.free_catalog_works fcw where fcw.work_id=w.id and fcw.enabled)
    )
    and (
      p_aestesis_only = false
      or exists (select 1 from public.aestesis_catalog_works acw where acw.work_id=w.id and acw.enabled)
    )
    and (
      p_query is null
      or btrim(p_query) = ''
      or w.title ilike '%' || p_query || '%'
      or w.original_title ilike '%' || p_query || '%'
      or exists (select 1 from unnest(coalesce(w.alternative_titles,array[]::text[])) as t where t ilike '%' || p_query || '%')
      or a.name ilike '%' || p_query || '%'
      or exists (select 1 from unnest(coalesce(a.alternative_names,array[]::text[])) as n where n ilike '%' || p_query || '%')
    )
    and e.ingestion_status='ready'
    and exists (
      select 1 from public.book_files bf
      where bf.edition_id=e.id
        and bf.kind='normalized'
        and bf.format='anki-json'
        and bf.ingestion_status='ready'
    )
    and exists (
      select 1 from public.rights_assertions ra
      where ra.edition_id=e.id
        and ra.status='public-domain'
        and (p_jurisdiction is null or p_jurisdiction='' or ra.jurisdiction=p_jurisdiction)
    )
  group by e.language
  order by work_count desc, e.language asc;
$$;

revoke all on function public.library_catalog_search(text,text,integer,integer,text,boolean,text[],boolean) from public, anon, authenticated;
grant execute on function public.library_catalog_search(text,text,integer,integer,text,boolean,text[],boolean) to service_role;
revoke all on function public.library_language_facets(text,text,boolean,boolean) from public, anon, authenticated;
grant execute on function public.library_language_facets(text,text,boolean,boolean) to service_role;
