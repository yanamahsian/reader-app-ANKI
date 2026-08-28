-- AUTOMATED TRANSLATOR ENRICHMENT v1 -- SS8B
--
-- Carries a newly-ready translation edition through: translator identity
-- -> translator death-year enrichment -> deterministic DE rights, entirely
-- through EXISTING mechanisms (_author_enrich_names_match,
-- enrich_author_death_year_from_wikidata in author_death_year_enrichment.sql,
-- backfill_rights_from_death_year in rights_backfill_death_year.sql). No
-- logic from those functions is duplicated here; this file only decides
-- WHAT small batch to feed them and records its own "already attempted"
-- bookkeeping so repeat ticks never re-scan the whole corpus and never
-- hammer Wikidata for a name that's already known to be unresolvable.
--
-- MULTILINGUAL RIGHTS COVERAGE v1: links a translation edition to the
-- existing `authors` entity that represents its translator, when that
-- identity can be determined. This deliberately reuses the SAME `authors`
-- table already used for original-work authors -- a translator is, for
-- rights purposes, just another person whose death year matters under
-- German pma+70 law. No new entity/table is introduced; a translator
-- author row simply has no works.author_id pointing at it, which the
-- schema already allows.

alter table public.editions
  add column if not exists translator_author_id text references public.authors(id);

comment on column public.editions.translator_author_id is
  'FK to authors.id for this edition''s translator, when identity is confirmed (deterministic name-token match to an existing authors row, or a newly seeded authors row later enriched via enrich_author_death_year_from_wikidata). NULL means translator identity is not yet resolved -- must not be guessed.';

-- enrichment_provenance is constrained to the two EXISTING sources
-- ('gutendex','wikidata') and three confidence levels -- not a free-form
-- bookkeeping table, so it is the wrong place to record "the tick
-- attempted this author and it stayed unresolved". Minimal, single-purpose
-- alternative: one nullable timestamp on authors, touched by nothing else.
-- NULL means "never attempted by the tick" (or already resolved, in which
-- case death_year is set and this column is irrelevant); a recent
-- timestamp means "attempted, stayed unresolved -- don't hammer Wikidata
-- again for 7 days". The candidate query below already filters on
-- death_year IS NULL first, so a resolved author is never reconsidered.
alter table public.authors
  add column if not exists death_year_enrichment_attempted_at timestamptz;

comment on column public.authors.death_year_enrichment_attempted_at is
  'Set by translator_enrichment_tick() after an unresolved enrich_author_death_year_from_wikidata() attempt, purely to bound retry frequency (7-day backoff). Never set on success (death_year becomes non-null instead, which is itself the permanent exclusion condition). Not written by any other process.';

-- Keeps the incremental tick's candidate scan cheap forever -- a partial
-- index over exactly the rows translator_enrichment_tick() looks for:
-- ready translations still missing a translator link.
create index if not exists editions_translator_link_pending_idx
  on public.editions (updated_at)
  where is_original = false and translator_author_id is null and ingestion_status = 'ready';

create or replace function public._translator_enrich_slug(p_display_name text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(public.unaccent(regexp_replace($1, '[^a-zA-Z0-9]+', '-', 'g'))), '-+', '-', 'g'))
$$;

create or replace function public._translator_enrich_display_name(p_translator_name text)
returns text
language sql
immutable
as $$
  select case when position(',' in $1) > 0
    then trim(substring($1 from position(',' in $1)+1)) || ' ' || trim(substring($1 from 1 for position(',' in $1)-1))
    else $1
  end
$$;

revoke all on function public._translator_enrich_slug(text) from public, anon, authenticated;
revoke all on function public._translator_enrich_display_name(text) from public, anon, authenticated;
grant execute on function public._translator_enrich_slug(text) to service_role;
grant execute on function public._translator_enrich_display_name(text) to service_role;

-- Final live definition (post fix-role, post fix-bookkeeping): SECURITY
-- DEFINER without SET ROLE (the owner, postgres, already inherits
-- service_role membership in this project, so no explicit role switch is
-- needed or allowed -- SET ROLE is disallowed inside a SECURITY DEFINER
-- function body, a hard Postgres restriction), and unresolved death-year
-- attempts are recorded via authors.death_year_enrichment_attempted_at
-- rather than an enrichment_provenance row (see column comment above).
--
-- Idempotency:
--  * translator_author_id is only ever set when currently NULL.
--  * a translator author row is only created after re-checking
--    _author_enrich_names_match against ALL existing authors (including
--    ones this same tick function created earlier), so the same real
--    name never gets two different author rows.
--  * death_year is only ever attempted while NULL, and a resolved value
--    is never revisited or overwritten.
--  * a master_corpus_authors row is only ever INSERTed fresh
--    (status='rights-review', inert to master_corpus_autonomous_tick's
--    dispatch clauses), never UPDATEd -- several translator identities
--    also happen to be tracked there by the unrelated author-discovery
--    pipeline (e.g. Guizot, Jowett are also original Gutenberg authors),
--    so writing to their .status could cross-contaminate that pipeline's
--    own state.
--  * rights_assertions insert/update is unchanged / still guarded inside
--    backfill_rights_from_death_year.
create or replace function public.translator_enrichment_tick(
  p_link_limit int default 5,
  p_death_year_limit int default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_display_name text;
  v_slug text;
  v_author_id text;
  v_matched_author_id text;
  v_linked int := 0;
  v_scaffolded int := 0;
  v_link_edition_ids text[] := array[]::text[];
  v_dy_author_ids text[] := array[]::text[];
  v_dy_edition_ids text[] := array[]::text[];
  v_rights_edition_ids text[] := array[]::text[];
  v_enrich_row record;
  v_rights_written int := 0;
begin
  -- STEP A: link translator identity for a bounded batch of new,
  -- single-translator, not-yet-linked ready translations.
  for r in
    select e.id as edition_id, trim(e.translator_name) as tname, e.language as edition_language
    from editions e
    where e.ingestion_status = 'ready'
      and e.is_original = false
      and e.translator_name is not null
      and e.translator_name not like '%;%'
      and e.translator_author_id is null
    order by e.updated_at
    limit greatest(p_link_limit, 0)
  loop
    v_matched_author_id := null;

    select a.id into v_matched_author_id
    from authors a
    where public._author_enrich_names_match(r.tname, a.name)
    limit 1;

    if v_matched_author_id is null then
      select m.canonical_author_id into v_matched_author_id
      from master_corpus_authors m
      where public._author_enrich_names_match(r.tname, m.display_name)
      limit 1;

      if v_matched_author_id is not null then
        insert into authors (id, name, death_year)
        values (v_matched_author_id, public._translator_enrich_display_name(r.tname), null)
        on conflict (id) do nothing;
      end if;
    end if;

    if v_matched_author_id is null then
      v_display_name := public._translator_enrich_display_name(r.tname);
      v_slug := public._translator_enrich_slug(v_display_name);
      v_author_id := 'translator-' || v_slug;

      -- Handle a slug collision between two DIFFERENT real names by
      -- falling back to a name-token match against what that slug
      -- already points to; only mint a disambiguated id if it's truly
      -- a different person.
      if exists (select 1 from authors a where a.id = v_author_id and not public._author_enrich_names_match(r.tname, a.name)) then
        v_author_id := v_author_id || '-' || substr(md5(r.tname), 1, 8);
      end if;

      insert into authors (id, name, death_year)
      values (v_author_id, v_display_name, null)
      on conflict (id) do nothing;

      insert into master_corpus_authors (display_name, original_language, corpus_scope, priority, canonical_author_id, status, notes)
      select v_display_name, r.edition_language, 'rights-check', 999, v_author_id, 'rights-review',
        'Scaffold row created by translator_enrichment_tick() so enrich_author_death_year_from_wikidata() can resolve a search language for this translator author row. Inert to master_corpus_autonomous_tick.'
      where not exists (select 1 from master_corpus_authors m where m.canonical_author_id = v_author_id)
      on conflict (display_name) do nothing;

      v_matched_author_id := v_author_id;
      v_scaffolded := v_scaffolded + 1;
    end if;

    update editions set translator_author_id = v_matched_author_id, updated_at = now()
    where id = r.edition_id and translator_author_id is null;

    v_linked := v_linked + 1;
    v_link_edition_ids := v_link_edition_ids || r.edition_id;
  end loop;

  -- STEP B: death-year enrichment for a small, impact-ordered batch of
  -- already-linked translators still missing death_year, skipping any
  -- attempted in the last 7 days.
  select array_agg(x.author_id) into v_dy_author_ids
  from (
    select a.id as author_id, count(*) as edition_count
    from authors a
    join editions e on e.translator_author_id = a.id
    where a.death_year is null
      and e.is_original = false
      and e.ingestion_status = 'ready'
      and (a.death_year_enrichment_attempted_at is null or a.death_year_enrichment_attempted_at < now() - interval '7 days')
    group by a.id
    order by count(*) desc, a.id
    limit greatest(p_death_year_limit, 0)
  ) x;

  if v_dy_author_ids is not null and array_length(v_dy_author_ids, 1) > 0 then
    for v_enrich_row in
      select * from public.enrich_author_death_year_from_wikidata(v_dy_author_ids, array_length(v_dy_author_ids,1), false)
    loop
      if v_enrich_row.resolved_death_year is null then
        update authors set death_year_enrichment_attempted_at = now()
        where id = v_enrich_row.author_id;
      end if;
    end loop;

    select array_agg(distinct e.id) into v_dy_edition_ids
    from editions e
    where e.translator_author_id = any(v_dy_author_ids)
      and e.is_original = false and e.ingestion_status = 'ready';
  end if;

  -- STEP C: targeted DE rights re-evaluation, scoped to exactly the
  -- editions touched this tick -- never a full-corpus scan.
  v_rights_edition_ids := (select array_agg(distinct x) from unnest(coalesce(v_link_edition_ids, array[]::text[]) || coalesce(v_dy_edition_ids, array[]::text[])) as x);

  if v_rights_edition_ids is not null and array_length(v_rights_edition_ids, 1) > 0 then
    select count(*) into v_rights_written
    from public.backfill_rights_from_death_year(false, v_rights_edition_ids)
    where outcome = 'confirmed_public_domain';
  end if;

  return jsonb_build_object(
    'ok', true,
    'identity_linked', v_linked,
    'new_translator_authors_scaffolded', v_scaffolded,
    'death_year_attempts', coalesce(array_length(v_dy_author_ids,1), 0),
    'rights_editions_rechecked', coalesce(array_length(v_rights_edition_ids,1), 0),
    'rights_newly_confirmed_public_domain', v_rights_written
  );
end;
$$;

comment on function public.translator_enrichment_tick(int, int) is
  'Bounded incremental tick: links translator identity, enriches translator death_year, and re-runs the deterministic DE rights check for exactly the editions touched -- never a full-corpus scan. Scheduled via pg_cron (see below).';

-- PRODUCTION -> REPOSITORY SYNC v1 note: the job was originally scheduled
-- with translator_enrichment_tick() (defaults 5, 3). Live production's
-- pg_cron job now calls translator_enrichment_tick(5, 2) -- the
-- p_death_year_limit was adjusted directly against production after the
-- initial schedule (found via this sync's live-vs-repo audit, not
-- recorded as its own migration at the time). This file schedules the
-- job with the argument list actually running in production today, per
-- this sync task's LIVE -> repo direction.
select cron.schedule(
  'translator-enrichment-every-10-minutes',
  '*/10 * * * *',
  $$select public.translator_enrichment_tick(5, 2);$$
);
