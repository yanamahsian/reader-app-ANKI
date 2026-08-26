-- library_language_facets — NEW Postgres function. ALREADY APPLIED to the
-- live database directly via the Supabase MCP (migration name
-- "library_language_facets"), matching this repo's established convention
-- (see author_death_year_enrichment.sql, rights_backfill_death_year.sql)
-- of every applied migration also existing here as a committed .sql file.
--
-- SERVER-DRIVEN LANGUAGE FACETS PHASE:
-- Backs omnia-library-catalog's new `facets.languages` response field
-- (see supabase/functions/omnia-library-catalog/index.ts). Replaces the
-- frontend's previous hand-maintained LANGUAGE_OPTIONS list
-- (src/catalog/languages.ts) as the source of truth for WHICH languages
-- are currently offered in Library/Search's "Язык" dropdown — a new
-- readable language ingested by the multilingual cron now appears in the
-- UI automatically, with no frontend code change.
--
-- WHY NOT works.available_languages OR works.original_language:
-- Both are explicitly disallowed as the source of truth here, for the
-- same reason library_catalog_search.sql's own p_language filter already
-- stopped trusting them (see that file's own "MULTILINGUAL UI PHASE FIX"
-- comment) — they are Work-level metadata, hand-typed or best-effort
-- synced, and proven to go stale (a Work can claim a language exists with
-- no real, readable Edition ever ingested for it). A facet count sourced
-- from that metadata could tell a visitor "Russian is available" when
-- picking language=ru would return zero results.
--
-- ELIGIBILITY RULE — DELIBERATELY THE EXACT SAME RULE library_catalog_search
-- ALREADY APPLIES, DUPLICATED RATHER THAN SHARED:
-- catalog_ready=true, publication_status is not 'hidden', the optional
-- p_query text match (title/original_title/alternative_titles/author
-- name/author alternative_names), and — per Edition — ingestion_status
-- ='ready' with a ready reader-format book_file (kind='normalized',
-- format='anki-json', ingestion_status='ready') and a public-domain
-- rights_assertion matched to p_jurisdiction. This is copied rather than
-- imported because SQL functions and Edge Functions share no module at
-- deploy time (same reason FORMAT_PRIORITY and this three-condition rule
-- are already duplicated between library_catalog_search.sql and
-- omnia-library-catalog/index.ts) — not because the rule is meant to
-- differ. Verified numerically against production to actually match:
-- library_language_facets(null, 'DE') reports ru work_count=137, and an
-- independent `select count(*) from library_catalog_search(null, 'ru',
-- 10000, 0, 'DE')` also returns exactly 137.
--
-- COUNT IS PER-WORK, NOT PER-EDITION:
-- `count(distinct w.id)` — a Work with three qualifying English editions
-- increases the English count by exactly 1, not 3. Verified against
-- production: 8 real Works were found with >=2 qualifying English
-- editions (one, "cymbeline-trag-die", has 3), and a global cross-check
-- (library_language_facets(null,null) en count vs an independent
-- `count(distinct e.work_id)` raw query) matched exactly at 1824=1824.
--
-- FACETS REACT TO p_query BUT NEVER TO A LANGUAGE FILTER:
-- There is deliberately no p_language parameter here at all. Per the
-- explicit product decision for this phase, facets must not shrink to
-- just the currently-selected language (picking language=ru must still
-- show the visitor every other available language for their
-- jurisdiction) — only the free-text search narrows the facet set, the
-- same way it narrows the result set itself.
--
-- JURISDICTION-AWARE, SAME AS library_catalog_search:
-- p_jurisdiction is applied to the rights_assertions match exactly as in
-- that function — verified against production that a DE visitor and a US
-- visitor see different language sets for the same query (DE sees ru
-- with work_count=137; US sees no ru facet at all for the same DE-only
-- Russian editions).
create or replace function public.library_language_facets(
  p_query text default null,
  p_jurisdiction text default null
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
  group by e.language
  order by work_count desc, e.language asc;
$$;

-- Locked down to service_role only, same reasoning as
-- library_catalog_search.sql's own grant block: SECURITY INVOKER here
-- still reads through work_readiness/works/authors/editions/book_files/
-- rights_assertions with RLS effectively bypassed by service_role, so
-- anon/authenticated must never call this directly.
revoke all on function public.library_language_facets(text, text) from public;
revoke all on function public.library_language_facets(text, text) from anon;
revoke all on function public.library_language_facets(text, text) from authenticated;
grant execute on function public.library_language_facets(text, text) to service_role;
