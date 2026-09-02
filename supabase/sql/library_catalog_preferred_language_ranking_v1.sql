-- Internationalization v1, part 2 -- server-side preferred-language
-- RANKING (never a filter) for library_catalog_search, applied BEFORE
-- limit/offset so it actually affects which page of results a visitor
-- gets, not just the ordering within one already-fetched page.
--
-- NOT YET APPLIED. Written against the function definition CONFIRMED
-- live on prknybetxirzbzkvmovw via `pg_get_functiondef` at the time of
-- writing (2026-09-02) -- NOT against supabase/sql/library_catalog_search.sql
-- or library_catalog_free_gate_v1.sql in this repo, which have already
-- drifted from what's actually deployed (the live function nests the
-- p_language check inside a single combined `exists (...)` alongside the
-- ingestion/rights checks, rather than as a top-level `p_language is
-- null or ... or exists(...)` the repo files show -- logically
-- equivalent, textually different). This file's WHERE clause is a
-- byte-for-byte copy of the live definition; only ORDER BY and the new
-- parameter are added. Applying this from a stale base would either
-- fail to replace cleanly or silently reintroduce whatever the repo
-- file's drifted text actually says -- worth flagging to whoever
-- applies this, independent of this specific change.
--
-- CORRECTION (this file previously claimed the opposite -- flagged by
-- reviewer, verified against live pg_proc before rewriting):
--
-- APPENDING A PARAMETER IS **NOT** AN IN-PLACE CREATE-OR-REPLACE.
-- In Postgres, a function's identity/overload signature is its ordered
-- list of INPUT ARGUMENT TYPES -- names, defaults and return type are
-- not part of that identity. `library_catalog_search(text, text, int,
-- int, text, boolean)` and `library_catalog_search(text, text, int, int,
-- text, boolean, text[])` are two DIFFERENT identities (different
-- `pg_get_function_identity_arguments`), full stop -- the fact that the
-- second is "the first one plus a defaulted extra param" is irrelevant
-- to identity resolution. `CREATE OR REPLACE FUNCTION` replaces an
-- existing function ONLY when a function with that exact identity
-- already exists; here none does, so this statement CREATES A SECOND,
-- ADDITIONAL OVERLOAD -- a new oid, coexisting with the old 6-arg oid --
-- it does not touch or extend the existing one. Confirmed directly
-- against live pg_proc on prknybetxirzbzkvmovw before writing this: today
-- there is exactly one live overload, 6 args, and it would remain fully
-- intact and callable after a bare CREATE OR REPLACE of the 7-arg form --
-- exactly the "two production functions instead of one" state the
-- reviewer flagged, which is why this file now also explicitly DROPS the
-- old overload (see the `drop function` statement below), rather than
-- assuming CREATE OR REPLACE alone retires it.
--
-- WHY THE OLD OVERLOAD CAN BE DROPPED SAFELY, IN THE SAME MIGRATION, WITH
-- NO CALLER TRANSITION WINDOW NEEDED:
-- The only production caller of this function in this repo is
-- omnia-library-catalog/index.ts (grepped the whole tree to confirm --
-- one call site). Its CURRENTLY DEPLOYED version (before this task's own
-- pending Edge Function change) calls
-- `supabase.rpc("library_catalog_search", { p_query, p_language, p_limit,
-- p_offset, p_jurisdiction, p_free_only })` -- exactly 6 NAMED arguments.
-- Postgres resolves a named-argument call by matching the supplied names
-- against a candidate's parameters, allowing any parameter the call
-- doesn't mention to fall back to its default -- so that exact 6-named-arg
-- call already resolves cleanly against the NEW 7-arg function once it
-- exists (p_preferred_languages simply defaults to null), with or without
-- the old 6-arg overload still being present. That means: applying this
-- migration (drop old + create new, together) is non-disruptive to the
-- currently-deployed Edge Function even before it's redeployed -- there
-- is no window where the currently-live caller breaks. The one order that
-- DOES break is the reverse: redeploying the Edge Function to send
-- p_preferred_languages BEFORE this migration lands, which would fail
-- outright ("function ... does not exist") against the old 6-arg-only
-- function, since it has no parameter by that name. Required order:
-- this migration first (or atomically with the Edge Function redeploy in
-- the same release), never after.
--
-- WHY A BOOST, NOT A FILTER:
-- p_language (existing, unchanged) is still the only hard filter --
-- it's a WHERE-clause EXISTS condition, unaffected by this change, and
-- still takes priority: when a visitor picks an explicit language in
-- the "Язык" dropdown, only matching Works are returned at all, exactly
-- as before. p_preferred_languages instead participates only in ORDER
-- BY: Works with at least one qualifying edition in one of the
-- preferred languages sort first; everything else stays in the result
-- set, just ranked after. "All languages" (p_language omitted/empty)
-- keeps returning every catalog_ready Work regardless of this ranking.
--
-- WHY THIS DOESN'T BREAK SEARCH RELEVANCE:
-- This function never scored text relevance to begin with -- the
-- existing (and unchanged) tie-break for every matching row is `w.id
-- asc`, a stable, arbitrary-but-consistent order, not a ranked-by-match-
-- quality order. The boost this adds is a single extra sort key placed
-- BEFORE that existing tie-break (`order by <boost> desc, w.id asc`),
-- so it only decides which of two ALREADY-MATCHING works (same query,
-- same hard filters) comes first -- it cannot promote a work that
-- doesn't match the search query at all, because the query/language
-- WHERE conditions are unchanged and still evaluated first.
--
-- THE BOOST CONDITION ITSELF mirrors the same three-condition
-- "qualifying edition" rule already applied to p_language and (in
-- omnia-library-catalog/index.ts) to which editions get returned to the
-- frontend at all: ingestion_status='ready', a ready normalized
-- anki-json book_file, and a public-domain rights_assertion (jurisdiction-
-- scoped the same way p_jurisdiction already scopes the p_language
-- check). A Work only gets the boost for a language it could actually
-- open a real, readable Edition in -- never for a language that's only
-- claimed in stale Work-level metadata (see this file's own note above
-- on why p_language already avoids trusting works.available_languages).

-- Retires the OLD 6-arg overload (identity: text, text, int, int, text,
-- boolean) so exactly one production `library_catalog_search` exists
-- after this migration, not two. `if exists` makes this safe to re-run
-- (a second run finds nothing to drop and is a no-op) -- see this file's
-- own header for why this specific drop is safe to run ahead of the Edge
-- Function redeploy, and the reverse order is not.
drop function if exists public.library_catalog_search(text, text, int, int, text, boolean);

-- Creates the NEW 7-arg overload (identity: text, text, int, int, text,
-- boolean, text[]) -- a distinct function/oid from the one just dropped,
-- not a continuation of it; `create or replace` here is only idempotent
-- against ITSELF (re-running this migration replaces this same 7-arg
-- function with an identical body -- a no-op change), not against the
-- 6-arg function above.
create or replace function public.library_catalog_search(
  p_query text default null,
  p_language text default null,
  p_limit int default 24,
  p_offset int default 0,
  p_jurisdiction text default null,
  p_free_only boolean default false,
  p_preferred_languages text[] default null
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
  order by
    (
      p_preferred_languages is not null
      and exists (
        select 1
        from public.editions pe
        where pe.work_id = w.id
          and pe.language = any(p_preferred_languages)
          and pe.ingestion_status = 'ready'
          and exists (
            select 1
            from public.book_files pbf
            where pbf.edition_id = pe.id
              and pbf.kind = 'normalized'
              and pbf.format = 'anki-json'
              and pbf.ingestion_status = 'ready'
          )
          and exists (
            select 1
            from public.rights_assertions pra
            where pra.edition_id = pe.id
              and pra.status = 'public-domain'
              and (
                p_jurisdiction is null
                or p_jurisdiction = ''
                or pra.jurisdiction = p_jurisdiction
              )
          )
      )
    ) desc,
    w.id asc
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0);
$$;

-- Same lockdown as every prior version of this function -- service_role
-- only. These four statements target the NEW 7-arg overload specifically
-- (identity_arguments: text, text, int, int, text, boolean, text[]) --
-- privileges are per-function-identity in Postgres, so they don't carry
-- over from the dropped 6-arg overload and have to be re-stated here
-- regardless; that overload no longer exists after the `drop function`
-- above, so there is nothing left to also revoke/grant on for it. All
-- four are plain REVOKE/GRANT with no IF EXISTS-equivalent guard needed --
-- re-running them against the same still-existing function is already a
-- safe no-op in Postgres.
revoke all on function public.library_catalog_search(text, text, int, int, text, boolean, text[]) from public;
revoke all on function public.library_catalog_search(text, text, int, int, text, boolean, text[]) from anon;
revoke all on function public.library_catalog_search(text, text, int, int, text, boolean, text[]) from authenticated;
grant execute on function public.library_catalog_search(text, text, int, int, text, boolean, text[]) to service_role;
