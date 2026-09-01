-- AOZORA JAPANESE LITERATURE TRADITION v1
-- Safe deterministic tradition fill: only ready Aozora Works whose master
-- author original_language and Work original_language are both Japanese.

update public.works w
set country_id = 'japanese-literature'
from (
  select distinct m.work_id
  from public.master_corpus_candidates m
  join public.master_corpus_authors ma on ma.id = m.master_author_id
  join public.works w2 on w2.id = m.work_id
  where m.source_id = 'aozora'
    and m.status = 'ready'
    and m.work_id is not null
    and ma.original_language = 'ja'
    and w2.original_language = 'ja'
    and w2.country_id is null
) a
where w.id = a.work_id;

insert into public.enrichment_provenance(
  entity_type, entity_id, field_name, value, source, source_ref,
  confidence, basis, fetched_at
)
select distinct on (m.work_id)
  'work', m.work_id, 'country_id', 'japanese-literature', 'aozora',
  coalesce(m.provider_metadata->>'cardUrl', m.external_id),
  'medium',
  'Aozora ready Work with master author original_language=ja and Work original_language=ja -> canonical Japanese literature tradition',
  now()
from public.master_corpus_candidates m
join public.master_corpus_authors ma on ma.id = m.master_author_id
join public.works w on w.id = m.work_id
where m.source_id = 'aozora'
  and m.status = 'ready'
  and m.work_id is not null
  and ma.original_language = 'ja'
  and w.original_language = 'ja'
  and w.country_id = 'japanese-literature'
order by m.work_id, m.updated_at desc
on conflict (entity_type, entity_id, field_name, source) do update set
  value = excluded.value,
  source_ref = excluded.source_ref,
  confidence = excluded.confidence,
  basis = excluded.basis,
  fetched_at = excluded.fetched_at;