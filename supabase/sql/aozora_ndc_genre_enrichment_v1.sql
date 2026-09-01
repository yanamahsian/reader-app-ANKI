-- AOZORA NDC GENRE ENRICHMENT v1
-- Uses stored Aozora NDC metadata only for unambiguous mappings.
-- Verified NDC 10 categories: 911=poetry, 912=drama, 914=essay, 917=aphorisms.

alter table public.enrichment_provenance drop constraint if exists enrichment_provenance_source_check;
alter table public.enrichment_provenance add constraint enrichment_provenance_source_check
  check (source = any (array['gutendex'::text, 'wikidata'::text, 'aozora'::text]));

with tokens as (
  select distinct m.work_id, m.external_id,
    coalesce(m.provider_metadata->>'cardUrl', m.external_id) as source_ref,
    x[1] as ndc
  from public.master_corpus_candidates m
  join public.works w on w.id = m.work_id
  cross join lateral regexp_matches(coalesce(m.provider_metadata->>'ndc',''), '(\d{3})', 'g') x
  where m.source_id = 'aozora'
    and m.status = 'ready'
    and m.work_id is not null
    and coalesce(cardinality(w.genre_ids), 0) = 0
), mapped as (
  select work_id, source_ref, ndc,
    case ndc
      when '911' then 'poetry'
      when '912' then 'drama'
      when '914' then 'essay'
      when '917' then 'aphorisms'
      else null
    end as genre_id
  from tokens
), agg as (
  select work_id,
    array_agg(distinct genre_id order by genre_id) filter (where genre_id is not null) as genre_ids,
    string_agg(distinct ndc, ',' order by ndc) filter (where genre_id is not null) as ndc_codes,
    min(source_ref) filter (where genre_id is not null) as source_ref
  from mapped
  group by work_id
)
update public.works w
set genre_ids = a.genre_ids
from agg a
where w.id = a.work_id
  and a.genre_ids is not null
  and cardinality(a.genre_ids) > 0
  and coalesce(cardinality(w.genre_ids), 0) = 0;

with tokens as (
  select distinct m.work_id,
    coalesce(m.provider_metadata->>'cardUrl', m.external_id) as source_ref,
    x[1] as ndc
  from public.master_corpus_candidates m
  join public.works w on w.id = m.work_id
  cross join lateral regexp_matches(coalesce(m.provider_metadata->>'ndc',''), '(\d{3})', 'g') x
  where m.source_id = 'aozora'
    and m.status = 'ready'
    and m.work_id is not null
), mapped as (
  select work_id, source_ref, ndc,
    case ndc
      when '911' then 'poetry'
      when '912' then 'drama'
      when '914' then 'essay'
      when '917' then 'aphorisms'
      else null
    end as genre_id
  from tokens
), agg as (
  select work_id,
    array_agg(distinct genre_id order by genre_id) filter (where genre_id is not null) as genre_ids,
    string_agg(distinct ndc, ',' order by ndc) filter (where genre_id is not null) as ndc_codes,
    min(source_ref) filter (where genre_id is not null) as source_ref
  from mapped
  group by work_id
)
insert into public.enrichment_provenance(
  entity_type, entity_id, field_name, value, source, source_ref,
  confidence, basis, fetched_at
)
select 'work', a.work_id, 'genre_ids', to_jsonb(a.genre_ids)::text,
  'aozora', a.source_ref, 'high',
  'Aozora provider_metadata.ndc mapped from unambiguous NDC 10 classes: 911=poetry, 912=drama, 914=essay, 917=aphorisms; observed NDC=' || a.ndc_codes,
  now()
from agg a
join public.works w on w.id = a.work_id
where a.genre_ids is not null
  and cardinality(a.genre_ids) > 0
  and a.genre_ids <@ w.genre_ids
on conflict (entity_type, entity_id, field_name, source) do update set
  value = excluded.value,
  source_ref = excluded.source_ref,
  confidence = excluded.confidence,
  basis = excluded.basis,
  fetched_at = excluded.fetched_at;