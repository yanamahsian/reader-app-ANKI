-- Idempotent German (DE) pma+70 rights backfill based on death year.
-- Dry-run by default. This file reflects the CURRENT live production
-- definition of backfill_rights_from_death_year(), which evolved through
-- several same-day production migrations (see PRODUCTION -> REPOSITORY
-- SYNC v1 for the full reconciliation); each step is summarized below so
-- the accumulated behavior is traceable from this one file, matching this
-- project's existing convention for these accumulated-context sql files.
--
-- EVOLUTION (all already applied to production, in order):
--  1. Original version: language in ('ru','uk') only, originals only,
--     translations always insufficient_metadata.
--  2. CONTENT EXPANSION / GERMANY READABLE CORPUS v1: removed the
--     language in ('ru','uk') restriction -- the pma+70 rule is
--     language-agnostic (depends only on the ORIGINAL author's death
--     year), so restricting by edition language had nothing to do with
--     the legal rule and excluded the much larger non-ru/uk corpus.
--  3. MULTILINGUAL RIGHTS COVERAGE v1: translations are now evaluated too,
--     via editions.translator_author_id -> authors.death_year. A
--     translation is a derivative work (Bearbeitung, S3 UrhG) with its
--     own separate copyright term, life+70 years post-mortem of the
--     TRANSLATOR. For a translation to be safely public domain in
--     Germany, BOTH the original author's copyright AND the translator's
--     own copyright must have expired -- neither condition alone is
--     sufficient. Translator identity is only ever populated by a
--     deterministic name-token match (see translator_enrichment.sql) --
--     never guessed -- so translator_author_id NULL correctly still
--     falls through to insufficient_metadata.
--  4. AUTOMATED TRANSLATOR ENRICHMENT v1: added an optional
--     p_edition_ids scope so the incremental translator_enrichment_tick()
--     can re-evaluate a small, specific set of editions after resolving a
--     translator's identity/death year, without re-scanning the full
--     ready corpus on every tick. Default remains NULL, preserving exact
--     full-corpus behavior for every pre-existing caller. NOTE: the
--     CREATE OR REPLACE that added this parameter created a second
--     overload rather than replacing the original (new Postgres
--     signature) -- the stale single-argument
--     backfill_rights_from_death_year(boolean) overload was dropped in a
--     following migration so single-argument calls stay unambiguous.
--  5. CATALOG IDENTITY RECONCILIATION v1, section 10: fixed rights_assertions
--     write semantics. omnia-wikisource-ingest-one and
--     omnia-aozora-ingest-one both insert an unconditional DE
--     status='unknown' placeholder row at ingest time; this function
--     previously always INSERTed a fresh row on confirmation, producing a
--     duplicate (edition_id, jurisdiction='DE') pair -- one 'unknown', one
--     'public-domain' -- for every edition it confirmed (440 such stale
--     pairs were found and cleaned up separately). Fixed to UPDATE an
--     existing 'unknown' placeholder in place when one exists, and only
--     INSERT fresh when no DE row exists yet for that edition at all. A
--     pre-existing 'public-domain', 'open-license', or 'restricted' row is
--     never overwritten by this automated computation.
create or replace function public.backfill_rights_from_death_year(
  p_dry_run boolean default true,
  p_edition_ids text[] default null
)
returns table (
  edition_id text,
  work_id text,
  work_title text,
  author_id text,
  author_name text,
  language text,
  is_original boolean,
  translator_name text,
  author_death_year int,
  outcome text,
  reason text
)
language plpgsql
set search_path = public
as $$
declare
  v_current_year int := extract(year from now())::int;
begin
  return query
  with candidates as (
    select
      e.id as c_edition_id,
      e.work_id as c_work_id,
      w.title as c_work_title,
      a.id as c_author_id,
      a.name as c_author_name,
      e.language as c_language,
      e.is_original as c_is_original,
      e.translator_name as c_translator_name,
      a.death_year as c_author_death_year,
      ta.death_year as c_translator_death_year,
      exists (
        select 1 from rights_assertions ra
        where ra.edition_id = e.id
          and ra.status = 'public-domain'
          and ra.jurisdiction = 'DE'
      ) as c_already_confirmed
    from editions e
    join works w on w.id = e.work_id
    join authors a on a.id = w.author_id
    left join authors ta on ta.id = e.translator_author_id
    where e.ingestion_status = 'ready'
      and (p_edition_ids is null or e.id = any(p_edition_ids))
  )
  select
    c.c_edition_id,
    c.c_work_id,
    c.c_work_title,
    c.c_author_id,
    c.c_author_name,
    c.c_language,
    c.c_is_original,
    c.c_translator_name,
    c.c_author_death_year,
    case
      when c.c_already_confirmed then 'already_confirmed'
      when c.c_is_original is null then 'needs_review'
      when c.c_is_original = true and c.c_translator_name is not null then 'conflict'
      when c.c_is_original = true and c.c_author_death_year is null then 'insufficient_metadata'
      when c.c_is_original = true and v_current_year >= c.c_author_death_year + 71 then 'confirmed_public_domain'
      when c.c_is_original = true then 'needs_review'
      when c.c_is_original = false and c.c_translator_name is null then 'insufficient_metadata'
      when c.c_is_original = false and c.c_translator_death_year is null then 'insufficient_metadata'
      when c.c_is_original = false and c.c_author_death_year is null then 'insufficient_metadata'
      when c.c_is_original = false and v_current_year >= c.c_author_death_year + 71 and v_current_year >= c.c_translator_death_year + 71 then 'confirmed_public_domain'
      when c.c_is_original = false then 'needs_review'
      else 'insufficient_metadata'
    end as outcome,
    case
      when c.c_already_confirmed
        then 'A public-domain/DE assertion already exists for this edition -- idempotent no-op.'
      when c.c_is_original is null
        then 'editions.is_original is not set -- cannot tell original from translation without guessing.'
      when c.c_is_original = true and c.c_translator_name is not null
        then 'Marked is_original=true but also carries a translator_name -- contradictory edition metadata.'
      when c.c_is_original = true and c.c_author_death_year is null
        then 'Original edition, but authors.death_year is not on record.'
      when c.c_is_original = true and v_current_year >= c.c_author_death_year + 71
        then c.c_author_name || ' died ' || c.c_author_death_year || ' -- public domain in Germany since Jan 1, ' || (c.c_author_death_year + 71) || '.'
      when c.c_is_original = true
        then c.c_author_name || ' died ' || c.c_author_death_year || ' -- still under German copyright until Dec 31, ' || (c.c_author_death_year + 70) || '.'
      when c.c_is_original = false and c.c_translator_name is null
        then 'Translation edition with no recorded translator_name -- cannot assess.'
      when c.c_is_original = false and c.c_translator_death_year is null
        then 'Translation by ' || c.c_translator_name || ' -- translator identity/death year not yet confirmed (deterministic identity gate has not resolved it, or edition has multiple translators not yet individually linked).'
      when c.c_is_original = false and c.c_author_death_year is null
        then 'Translation edition, but the original author''s death year is not on record -- both original and translator terms must be confirmed.'
      when c.c_is_original = false and v_current_year >= c.c_author_death_year + 71 and v_current_year >= c.c_translator_death_year + 71
        then c.c_author_name || ' (original, d. ' || c.c_author_death_year || ') and translator ' || c.c_translator_name || ' (d. ' || c.c_translator_death_year || ') are both public domain in Germany.'
      else
        'Original author (d. ' || coalesce(c.c_author_death_year::text,'?') || ') and/or translator ' || c.c_translator_name || ' (d. ' || coalesce(c.c_translator_death_year::text,'?') || ') not yet 70 years post-mortem in Germany -- still under copyright.'
    end as reason
  from candidates c
  order by c.c_language, c.c_author_name, c.c_edition_id;

  if not p_dry_run then
    -- 1. Upsert path: an existing 'unknown' DE placeholder gets updated in place
    --    (same row, no duplicate) rather than left stranded alongside a new row.
    update rights_assertions ra
    set status = 'public-domain',
        asserted_at = now(),
        rights_metadata = jsonb_build_object(
          'assessment', 'de-life-plus-70',
          'basis', case when e.is_original then 'original-author-death-year' else 'original-and-translator-death-year' end,
          'author_id', a.id,
          'author_name', a.name,
          'author_death_year', a.death_year,
          'translator_author_id', e.translator_author_id,
          'translator_death_year', ta.death_year,
          'rule', 'current_year >= death_year + 71 (both original author and translator, when translated)',
          'current_year_at_assessment', v_current_year,
          'computed_by', 'backfill_rights_from_death_year',
          'superseded_placeholder_asserted_at', ra.asserted_at
        )
    from editions e
    join works w on w.id = e.work_id
    join authors a on a.id = w.author_id
    left join authors ta on ta.id = e.translator_author_id
    where e.ingestion_status = 'ready'
      and (p_edition_ids is null or e.id = any(p_edition_ids))
      and a.death_year is not null
      and v_current_year >= a.death_year + 71
      and (
        (e.is_original = true and e.translator_name is null)
        or
        (e.is_original = false and e.translator_name is not null and ta.death_year is not null and v_current_year >= ta.death_year + 71)
      )
      and ra.edition_id = e.id
      and ra.jurisdiction = 'DE'
      and ra.status = 'unknown';

    -- 2. Fresh-insert path: only when NO row exists yet for (edition_id, 'DE')
    --    at all (neither the placeholder nor a prior determination).
    insert into rights_assertions (edition_id, status, jurisdiction, rights_metadata)
    select
      e.id,
      'public-domain',
      'DE',
      jsonb_build_object(
        'assessment', 'de-life-plus-70',
        'basis', case when e.is_original then 'original-author-death-year' else 'original-and-translator-death-year' end,
        'author_id', a.id,
        'author_name', a.name,
        'author_death_year', a.death_year,
        'translator_author_id', e.translator_author_id,
        'translator_death_year', ta.death_year,
        'rule', 'current_year >= death_year + 71 (both original author and translator, when translated)',
        'current_year_at_assessment', v_current_year,
        'computed_by', 'backfill_rights_from_death_year'
      )
    from editions e
    join works w on w.id = e.work_id
    join authors a on a.id = w.author_id
    left join authors ta on ta.id = e.translator_author_id
    where e.ingestion_status = 'ready'
      and (p_edition_ids is null or e.id = any(p_edition_ids))
      and a.death_year is not null
      and v_current_year >= a.death_year + 71
      and (
        (e.is_original = true and e.translator_name is null)
        or
        (e.is_original = false and e.translator_name is not null and ta.death_year is not null and v_current_year >= ta.death_year + 71)
      )
      and not exists (
        select 1 from rights_assertions ra
        where ra.edition_id = e.id
          and ra.jurisdiction = 'DE'
      );
  end if;
end;
$$;

-- The single-argument overload from before step 4 above no longer exists in
-- production (dropped to keep single-argument calls unambiguous); this DROP
-- is included so a fresh deployment from this file reaches the same end
-- state even if applied on top of the very first (pre-widen) version.
drop function if exists public.backfill_rights_from_death_year(boolean);

revoke all on function public.backfill_rights_from_death_year(boolean, text[]) from public;
revoke all on function public.backfill_rights_from_death_year(boolean, text[]) from anon;
revoke all on function public.backfill_rights_from_death_year(boolean, text[]) from authenticated;
grant execute on function public.backfill_rights_from_death_year(boolean, text[]) to service_role;
