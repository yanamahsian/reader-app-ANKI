-- CROSS-LANGUAGE WORK IDENTITY BRIDGE v1
--
-- Semantic finding: every workQid stored anywhere in this database has
-- already passed, at discovery time, against live Wikidata:
--   (a) a P31/P279 type-closure check confirming the entity is classified
--       under one of the root literary-work types (Q571 book, Q7725634
--       literary work, Q25379 play);
--   (b) an unambiguous single non-deprecated P50 authorship check matching
--       the target author's own confirmed Wikidata author QID.
-- This is real semantic validation, not title guessing -- but it does NOT
-- by itself guarantee the entity is the abstract cross-language "work"
-- rather than a specific translation/edition item (Wikidata's Q3331189
-- "version, edition or translation" class). Whether a given confirmed QID
-- behaves as a genuine multi-language bridge is observed empirically via
-- Wikidata's own sitelinks (already fetched by anki-multilingual-discover)
-- rather than asserted from the QID alone.
--
-- Generic external-identity bridge table: ONE WORK -> MANY EXTERNAL
-- IDENTIFIERS (wikidata-work today; openlibrary-work/wikisource-work etc.
-- are anticipated future schemes, not yet populated) -- not permanently
-- coupled to a single wikidata_work_qid column.
create table if not exists public.work_external_identifiers (
  id uuid primary key default gen_random_uuid(),
  work_id text not null references public.works(id),
  scheme text not null,                -- e.g. 'wikidata-work'
  external_id text not null,           -- e.g. 'Q165318'
  resolution_method text not null,     -- how this specific mapping was established
  provenance jsonb not null default '{}'::jsonb,  -- full evidence: origin table/row, authorQid, wikiLanguage, authorshipPolicy, etc.
  created_at timestamptz not null default now()
);

create index if not exists work_external_identifiers_work_id_idx on public.work_external_identifiers(work_id);

-- Enforces: one canonical external Work ID can never silently attach to two
-- different AN.KI Works. A future insert that would violate this is a
-- reconciliation candidate, not something to resolve automatically --
-- callers must catch the conflict and route it to review rather than
-- overwrite (see the identity-first upsert in omnia-wikisource-ingest-one,
-- which uses ON CONFLICT ... ignoreDuplicates:true for exactly this
-- reason).
create unique index if not exists work_external_identifiers_scheme_external_id_key
  on public.work_external_identifiers(scheme, external_id);

comment on table public.work_external_identifiers is
  'Generic external-identity bridge: one Work may carry identifiers from multiple canonical providers (wikidata-work today; openlibrary-work/wikisource-work etc. are anticipated future schemes, not yet populated). (scheme, external_id) is globally unique by design.';

-- Safe initial backfill, high-confidence cases only. Two sources, both
-- already independently confirmed (literary-work type closure + unambiguous
-- single-author P50 match) at discovery time -- no title guessing:
--   1. master_corpus_candidates (source_id='wikisource') for ws-q* Works:
--      the Wikisource page's own Wikidata item, confirmed via
--      confirmedLiteraryWorkQids()+confirmedAuthorship() in
--      omnia-wikisource-discover-author.
--   2. multilingual_candidates (source_id='wikisource',
--      provider_metadata->>'identity' is not null): the SAME confirmation
--      mechanism, run by anki-multilingual-discover either via the primary
--      QID-mining path ('wikidata-sitelink-exact') or its author-page-linked
--      title-match fallback ('fallback-wikisource-author-page-linked-title-match').
-- Deliberately excluded: multilingual_candidates rows from source_id='gutenberg'
-- -- these merely copy through the work's already-known QID for reference
-- and were matched by title, not independently identity-confirmed.
--
-- Idempotent: ON CONFLICT (scheme, external_id) DO NOTHING, safe to re-run
-- on a fresh deployment or replay against the same production data.
with source_a as (
  select distinct on (mc.work_id)
    mc.work_id,
    upper(mc.provider_metadata->>'workQid') as qid,
    'wikisource-page-pageprops-confirmed-literary-work' as resolution_method,
    jsonb_build_object(
      'origin', 'master_corpus_candidates',
      'source_id', mc.source_id,
      'wikiLanguage', mc.provider_metadata->>'wikiLanguage',
      'authorQid', mc.provider_metadata->>'authorQid',
      'authorshipPolicy', mc.provider_metadata->>'authorshipPolicy',
      'candidate_id', mc.id
    ) as provenance
  from master_corpus_candidates mc
  where mc.source_id = 'wikisource'
    and mc.work_id is not null
    and mc.provider_metadata ? 'workQid'
  order by mc.work_id, mc.updated_at desc
),
source_b as (
  select distinct on (mlc.work_id)
    mlc.work_id,
    upper(mlc.work_qid) as qid,
    (mlc.provider_metadata->>'identity') as resolution_method,
    jsonb_build_object(
      'origin', 'multilingual_candidates',
      'source_id', mlc.source_id,
      'wikiLanguage', mlc.provider_metadata->>'wikiLanguage',
      'pageTitle', mlc.provider_metadata->>'pageTitle',
      'candidate_language', mlc.language
    ) as provenance
  from multilingual_candidates mlc
  where mlc.source_id = 'wikisource'
    and mlc.work_id is not null
    and mlc.work_qid is not null
    and mlc.provider_metadata->>'identity' is not null
  order by mlc.work_id, mlc.updated_at desc
),
combined as (
  -- prefer source_a (the original ws-q ingestion provenance) when both exist
  -- for the same work_id; they were already verified qid-identical for ws-q
  -- Works.
  select coalesce(a.work_id, b.work_id) as work_id,
         coalesce(a.qid, b.qid) as qid,
         coalesce(a.resolution_method, b.resolution_method) as resolution_method,
         coalesce(a.provenance, b.provenance) as provenance
  from source_a a
  full outer join source_b b on b.work_id = a.work_id
)
insert into work_external_identifiers (work_id, scheme, external_id, resolution_method, provenance)
select work_id, 'wikidata-work', qid, resolution_method, provenance
from combined
where qid is not null and qid ~ '^Q[0-9]+$'
on conflict (scheme, external_id) do nothing;
