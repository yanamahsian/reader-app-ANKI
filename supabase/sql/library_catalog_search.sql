-- library_catalog_search — NEW Postgres function, NOT YET APPLIED.
--
-- Run this against the live database BEFORE deploying the rewritten
-- omnia-library-catalog Edge Function (supabase/functions/omnia-library-catalog/
-- index.ts), which calls this function via supabase.rpc(...) using the
-- service-role client.
--
-- WHY A FUNCTION INSTEAD OF A POSTGREST FILTER STRING:
-- The previous version of omnia-library-catalog built a PostgREST
-- `.or("title.ilike.%<raw text>%,...")` filter string by directly
-- interpolating the visitor's search text. PostgREST's own filter
-- syntax uses commas and dots as operators, so a search string
-- containing those characters could alter the meaning of the filter
-- itself -- a real (if narrow) injection surface, not a theoretical one.
-- Here, p_query is a genuine bound SQL function parameter: Postgres
-- treats its value purely as data, never as SQL/filter syntax, no
-- matter what characters it contains. The only characters with special
-- meaning inside the resulting value are ILIKE's own wildcards (% and
-- _), which only make the match broader or narrower -- they cannot
-- escape the string or change the query's structure.
--
-- WHY catalog_ready FROM work_readiness, NOT publication_status:
-- work_readiness is the project's own canonical readiness layer.
-- catalog_ready = true means: the work has a ready edition, with a
-- ready book_file (kind=normalized, format=anki-json), with a
-- public-domain rights_assertion, AND correct author identity AND
-- valid canonical taxonomy references. publication_status is a
-- separate, unrelated editorial field -- on a live snapshot checked
-- during this work, the large majority of catalog-ready works were
-- publication_status='draft', with only a small handful 'published'
-- (ingestion keeps changing these counts, so no specific number is
-- treated as fixed here -- see the written report for a timestamped
-- snapshot count instead of a hardcoded one). Gating on
-- publication_status IN (...) (the previous version's approach) is
-- gating on the wrong column: it treats an unrelated editorial marker
-- as a readiness signal. The correct rule, exactly as specified: a
-- work is eligible when catalog_ready=true AND publication_status is
-- not 'hidden' -- draft stays in the database and does not block it.
--
-- JOIN COLUMN -- CONFIRMED DIRECTLY AGAINST THE LIVE DATABASE:
-- work_readiness's join column back to works is `work_id` --
-- `join public.work_readiness wr on wr.work_id = w.id` was run
-- directly against the live database and succeeds. Not a naming-
-- convention guess.
--
-- w.id IS CAST TO text IN THE RETURN TYPE on purpose: this repo's own
-- probing never confirmed works.id's concrete column type (uuid vs
-- bigint vs text), so returning it as text avoids hardcoding a possibly
-- wrong type in this function's signature -- the Edge Function's own
-- detail-fetch step (`.in("id", workIds)`) works the same either way,
-- since PostgREST/postgrest-js accept string values for uuid/bigint
-- columns interchangeably in `.in()` filters.
--
-- MULTILINGUAL UI PHASE FIX -- p_language NO LONGER TRUSTS
-- works.original_language / works.available_languages:
-- Both are Work-level metadata, hand-typed or best-effort-synced (see
-- syncAvailableLanguages.ts's own comment on that file's limits), and
-- proven to go stale in practice -- e.g. a Work whose metadata claims a
-- `ru` edition exists when no real, readable Russian Edition was ever
-- ingested for it (Kafka/"Превращение" was the concrete case that
-- surfaced this). Filtering language on that metadata means "Library:
-- язык=ru" can show a visitor a card for a book with nothing readable
-- in Russian at all.
--
-- The filter below instead means exactly "this Work has at least one
-- genuinely qualifying Edition in p_language" -- a ready Edition
-- (ingestion_status='ready') with a ready, reader-format book_file
-- (kind='normalized', format='anki-json', ingestion_status='ready') and
-- a public-domain rights_assertion. This is deliberately the SAME three
-- conditions omnia-library-catalog/index.ts already applies per-edition
-- when it decides which editions are "qualifying" enough to return to
-- the frontend at all (see that file's own qualifyingEditions mapping) --
-- kept as two separate copies of the same rule for the same reason
-- FORMAT_PRIORITY is duplicated there rather than imported (Edge
-- Functions and this SQL file have no shared module at deploy time),
-- not because the rule itself is meant to differ. If a Work's only
-- qualifying edition in a language is missing any one of these three
-- (not yet ready, no reader-format file yet, rights not yet
-- public-domain), that language correctly does not match here either --
-- this never widens what counts as "readable" beyond what the Edge
-- Function itself would actually serve.
--
-- This does not weaken the rights model: it only ever narrows which
-- Works match a language filter (down to ones with a real, already
-- reader-ready, already public-domain edition), never grants a rights
-- status a row didn't already have. A Wikisource-sourced edition still
-- stuck in `review` still fails this check, exactly as it should.

drop function if exists public.library_catalog_search(text, text, int, int, text);

create or replace function public.library_catalog_search(
  p_query text default null,
  p_language text default null,
  p_limit int default 24,
  p_offset int default 0,
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
    )
  order by w.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- Locked down to service_role only, per explicit instruction: this
-- function reads through work_readiness/works/authors with RLS
-- effectively bypassed by whichever role calls it with SECURITY
-- INVOKER (service_role itself bypasses RLS project-wide) -- anon or
-- authenticated must never be able to call it directly, since that
-- would hand back the exact same "browse without a policy" access the
-- five base tables' RLS is deliberately withholding from them.
revoke all on function public.library_catalog_search(text, text, int, int, text) from public;
revoke all on function public.library_catalog_search(text, text, int, int, text) from anon;
revoke all on function public.library_catalog_search(text, text, int, int, text) from authenticated;
grant execute on function public.library_catalog_search(text, text, int, int, text) to service_role;
