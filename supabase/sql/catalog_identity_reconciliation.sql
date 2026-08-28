-- CATALOG IDENTITY RECONCILIATION v1
--
-- Deterministic title-normalization helpers used to classify legacy ws-q*
-- Works (Works created directly from a Wikisource Wikidata QID before this
-- project had any other identity mechanism) against the rest of the
-- catalog. Mirrors the normalize()/stripTrailingParen() logic already
-- deployed in omnia-wikisource-ingest-one, so ws-q* legacy Work
-- classification uses the exact same non-fuzzy identity rule as the
-- forward matcher -- never independent, looser title logic.
create extension if not exists unaccent with schema public;

create or replace function public._title_identity_normalize(p_title text)
returns text
language sql
immutable
as $$
  select nullif(
    trim(
      regexp_replace(
        regexp_replace(
          lower(replace(unaccent(coalesce(p_title,'')), 'ё', 'е')),
          '[^[:alnum:]]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
  '')
$$;

create or replace function public._title_identity_strip_trailing_paren(p_title text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(coalesce(p_title,''), '\s*\([^()]*\)\s*$', '')), '')
$$;

-- Safe Class-A merge of 14 deterministic ws-q* duplicate Works into their
-- canonical counterparts, found via the title-identity helpers above.
-- work_readiness is a VIEW computed live from works/editions/rights_assertions/
-- etc, so no manual cleanup is needed there -- once the legacy Work row is
-- deleted, the view naturally produces no row for it.
--
-- This is a historical, one-time data migration (not a schema/function
-- change): it is naturally idempotent on re-run (each UPDATE/DELETE only
-- ever touches rows matching a specific legacy work_id; once that work_id
-- no longer exists -- as is already the case in current production -- every
-- statement in the loop below is a no-op), so it is safe to keep in this
-- file for a reproducible from-scratch deployment without special-casing.
do $$
declare
  pairs text[][] := array[
    array['ws-q1193766','the-prisoner-of-zenda'],
    array['ws-q1305106','looking-backward-2000-1887'],
    array['ws-q1610831','night-and-day'],
    array['ws-q19364939','overruled'],
    array['ws-q2646905','arms-and-the-man'],
    array['ws-q3210336','la-maison-tellier'],
    array['ws-q471118','the-school-for-scandal'],
    array['ws-q4759428','androcles-and-the-lion'],
    array['ws-q5047054','cartas-de-inglaterra'],
    array['ws-q5188976','crotchet-castle'],
    array['ws-q5689829','headlong-hall'],
    array['ws-q6669365','lombard-street-a-description-of-the-money-market'],
    array['ws-q6736091','main-street'],
    array['ws-q8773903','o-livro-de-cesario-verde']
  ];
  pair text[];
  legacy text;
  canonical text;
begin
  foreach pair slice 1 in array pairs loop
    legacy := pair[1];
    canonical := pair[2];

    update editions set work_id = canonical, updated_at = now() where work_id = legacy;

    update master_corpus_candidates set work_id = canonical, updated_at = now() where work_id = legacy;
    update multilingual_candidates set work_id = canonical where work_id = legacy;
    update cover_candidates set work_id = canonical where work_id = legacy;
    update ingestion_jobs set work_id = canonical where work_id = legacy;
    update open_book_candidates set work_id = canonical where work_id = legacy;
    update soft_classification_attempts set work_id = canonical where work_id = legacy
      and not exists (select 1 from soft_classification_attempts s2 where s2.work_id = canonical);
    delete from soft_classification_attempts where work_id = legacy;

    update user_library set work_id = canonical where work_id = legacy
      and not exists (select 1 from user_library ul2 where ul2.work_id = canonical and ul2.user_id = user_library.user_id);
    delete from user_library where work_id = legacy;
    update annotations set work_id = canonical where work_id = legacy;
    update ai_classification_provenance set work_id = canonical where work_id = legacy
      and not exists (select 1 from ai_classification_provenance a2 where a2.work_id = canonical and a2.category = ai_classification_provenance.category);
    delete from ai_classification_provenance where work_id = legacy;

    update work_contributors set work_id = canonical where work_id = legacy
      and not exists (
        select 1 from work_contributors wc2
        where wc2.work_id = canonical and wc2.author_id = work_contributors.author_id and wc2.role = work_contributors.role
      );
    delete from work_contributors where work_id = legacy;

    update match_review_queue set candidate_work_id = canonical where candidate_work_id = legacy;
    update match_review_queue set resolved_work_id = canonical where resolved_work_id = legacy;

    delete from works where id = legacy;
  end loop;
end $$;

-- CATALOG IDENTITY RECONCILIATION v1, section 11: cleaned the 440 existing
-- duplicate (edition_id, jurisdiction) rights_assertions pairs left by the
-- pre-fix insert-only backfill_rights_from_death_year (see
-- rights_backfill_death_year.sql for the write-path fix itself). Confirmed
-- every one of the 440 pairs is exactly {status='unknown', status='public-domain'}
-- for the same edition+jurisdiction='DE' -- a stale pre-determination
-- placeholder superseded by a later confirmed determination, not a valid
-- multi-evidence scenario (no consumer reads 'unknown' rows for anything;
-- all readiness/search logic uses EXISTS(status='public-domain')). The
-- surviving row already carries full computed_by/rule/death-year
-- provenance, so no information is lost by deleting the superseded
-- placeholder. Naturally idempotent: matches zero rows once already clean.
delete from rights_assertions ra_unknown
using rights_assertions ra_confirmed
where ra_unknown.status = 'unknown'
  and ra_confirmed.status = 'public-domain'
  and ra_unknown.edition_id = ra_confirmed.edition_id
  and ra_unknown.jurisdiction = ra_confirmed.jurisdiction
  and ra_unknown.jurisdiction = 'DE';
