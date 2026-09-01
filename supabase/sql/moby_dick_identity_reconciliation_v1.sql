-- MOBY-DICK IDENTITY RECONCILIATION v1
--
-- Production contained two Work rows for the same Herman Melville Work:
--   moby-dick-or-the-whale     -> Gutenberg #2701
--   moby-dick-or-the-whale-2   -> Gutenberg #15
-- Project Gutenberg identifies #15, #2701 and #2489 as alternate editions
-- of the same Moby-Dick Work. Keep the clean existing canonical Work id,
-- move the #15 Edition and operational references onto it, preserve the
-- Free-corpus slot, then remove the duplicate Work row.

do $$
declare
  legacy constant text := 'moby-dick-or-the-whale-2';
  canonical constant text := 'moby-dick-or-the-whale';
begin
  if not exists (select 1 from public.works where id = legacy) then
    return;
  end if;
  if not exists (select 1 from public.works where id = canonical) then
    raise exception 'Canonical Moby-Dick Work is missing';
  end if;

  update public.editions set work_id = canonical, updated_at = now() where work_id = legacy;
  update public.ingestion_jobs set work_id = canonical, updated_at = now() where work_id = legacy;
  update public.master_corpus_candidates set work_id = canonical, updated_at = now() where work_id = legacy;
  update public.multilingual_candidates set work_id = canonical where work_id = legacy;
  update public.cover_candidates set work_id = canonical where work_id = legacy;
  update public.open_book_candidates set work_id = canonical where work_id = legacy;

  insert into public.free_catalog_works(work_id, enabled, sort_order, created_at)
  select canonical, enabled, sort_order, created_at
  from public.free_catalog_works
  where work_id = legacy
  on conflict (work_id) do update set
    enabled = excluded.enabled,
    sort_order = least(public.free_catalog_works.sort_order, excluded.sort_order);
  delete from public.free_catalog_works where work_id = legacy;

  update public.user_library ul
  set work_id = canonical
  where work_id = legacy
    and not exists (
      select 1 from public.user_library ul2
      where ul2.user_id = ul.user_id and ul2.work_id = canonical
    );
  delete from public.user_library where work_id = legacy;

  update public.annotations set work_id = canonical where work_id = legacy;

  update public.ai_classification_provenance ap
  set work_id = canonical
  where work_id = legacy
    and not exists (
      select 1 from public.ai_classification_provenance ap2
      where ap2.work_id = canonical and ap2.category = ap.category
    );
  delete from public.ai_classification_provenance where work_id = legacy;

  insert into public.enrichment_provenance(
    entity_type, entity_id, field_name, value, source, source_ref,
    confidence, basis, fetched_at
  )
  select
    entity_type, canonical, field_name, value, source, source_ref,
    confidence, basis, fetched_at
  from public.enrichment_provenance
  where entity_type = 'work' and entity_id = legacy
  on conflict (entity_type, entity_id, field_name, source) do nothing;
  delete from public.enrichment_provenance
  where entity_type = 'work' and entity_id = legacy;

  update public.work_contributors wc
  set work_id = canonical
  where work_id = legacy
    and not exists (
      select 1 from public.work_contributors wc2
      where wc2.work_id = canonical
        and wc2.author_id = wc.author_id
        and wc2.role = wc.role
    );
  delete from public.work_contributors where work_id = legacy;

  update public.work_external_identifiers set work_id = canonical where work_id = legacy;

  update public.match_review_queue set candidate_work_id = canonical where candidate_work_id = legacy;
  update public.match_review_queue set resolved_work_id = canonical where resolved_work_id = legacy;

  -- The canonical Work already had a successful soft-classifier attempt;
  -- retaining a second Work-level attempt would only preserve duplicate state.
  delete from public.soft_classification_attempts where work_id = legacy;

  -- The duplicate's temporary identity-review marker is now resolved.
  delete from public.catalog_enrichment_field_decisions where work_id = legacy;

  update public.works
  set
    description = case when nullif(btrim(coalesce(description, '')), '') is null
      then 'Роман о плавании «Пекода» и одержимой охоте капитана Ахава на белого кита — история о море, судьбе и разрушительной силе навязчивой идеи.'
      else description end,
    publication_year = coalesce(publication_year, 1851),
    century_id = coalesce(century_id, '19'),
    country_id = coalesce(country_id, 'american-literature'),
    genre_ids = case when coalesce(cardinality(genre_ids), 0) = 0
      then array['novel','nautical-fiction','adventure-fiction','psychological-fiction']::text[]
      else genre_ids end,
    theme_ids = case when coalesce(cardinality(theme_ids), 0) = 0
      then array['obsession','fate','nature','sea']::text[]
      else theme_ids end
  where id = canonical;

  delete from public.works where id = legacy;
end $$;
