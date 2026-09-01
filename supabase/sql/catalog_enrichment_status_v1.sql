-- CATALOG ENRICHMENT STATUS v1
--
-- Operational metadata/enrichment layer for AN.KI's catalog.
--
-- This migration does NOT generate descriptions, call AI, fetch/buy cover
-- images, or overwrite Works. It makes enrichment measurable and gives any
-- current/future worker one canonical backlog instead of inventing its own
-- definition of "missing metadata".
--
-- Core rules:
--   * populated values remain in public.works — this is not a shadow catalog;
--   * successful external facts keep using enrichment_provenance;
--   * AI classification provenance keeps using ai_classification_provenance;
--   * explicit exceptions/review decisions live in the small
--     catalog_enrichment_field_decisions table;
--   * cover is tracked separately as a deferred visual field and is excluded
--     from metadata_completion_percent, so visual work never blocks factual /
--     editorial enrichment;
--   * Free corpus, then actually-used books, then the rest of the catalog are
--     prioritized automatically.

create table if not exists public.catalog_enrichment_field_decisions (
  work_id text not null references public.works(id) on delete cascade,
  field_name text not null,
  state text not null,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (work_id, field_name),
  constraint catalog_enrichment_field_decisions_field_check check (
    field_name in (
      'description', 'publication_year', 'century_id', 'country_id',
      'genre_ids', 'theme_ids', 'movement_id', 'epoch_id', 'cover'
    )
  ),
  constraint catalog_enrichment_field_decisions_state_check check (
    state in ('review', 'accepted_missing', 'deferred')
  )
);

alter table public.catalog_enrichment_field_decisions enable row level security;
revoke all on public.catalog_enrichment_field_decisions from public;
revoke all on public.catalog_enrichment_field_decisions from anon;
revoke all on public.catalog_enrichment_field_decisions from authenticated;
grant select, insert, update, delete on public.catalog_enrichment_field_decisions to service_role;

drop function if exists public.get_catalog_enrichment_backlog(int);
drop view if exists public.catalog_enrichment_progress;
drop view if exists public.catalog_enrichment_status;

create view public.catalog_enrichment_status
with (security_invoker = true)
as
with library_activity as (
  select
    ul.work_id,
    count(*)::int as saved_count,
    count(*) filter (where ul.status in ('reading', 'finished'))::int as engaged_count
  from public.user_library ul
  group by ul.work_id
),
enrichment_counts as (
  select
    ep.entity_id as work_id,
    count(*)::int as enrichment_provenance_count
  from public.enrichment_provenance ep
  where ep.entity_type = 'work'
  group by ep.entity_id
),
ai_counts as (
  select
    ap.work_id,
    count(*)::int as ai_provenance_count
  from public.ai_classification_provenance ap
  group by ap.work_id
),
decisions as (
  select
    d.work_id,
    coalesce(array_agg(d.field_name order by d.field_name) filter (where d.state = 'accepted_missing'), array[]::text[]) as accepted_missing_fields,
    coalesce(array_agg(d.field_name order by d.field_name) filter (where d.state = 'review'), array[]::text[]) as explicit_review_fields,
    coalesce(array_agg(d.field_name order by d.field_name) filter (where d.state = 'deferred'), array[]::text[]) as explicitly_deferred_fields
  from public.catalog_enrichment_field_decisions d
  group by d.work_id
),
base as (
  select
    w.id as work_id,
    w.title,
    w.author_id,
    coalesce(w.description, '') as description,
    w.cover,
    w.publication_year,
    w.original_language,
    w.country_id,
    w.century_id,
    w.epoch_id,
    w.movement_id,
    coalesce(w.genre_ids, array[]::text[]) as genre_ids,
    coalesce(w.theme_ids, array[]::text[]) as theme_ids,
    coalesce(wr.reader_ready, false) as reader_ready,
    coalesce(wr.catalog_ready, false) as catalog_ready,
    coalesce(fcw.enabled, false) as is_free,
    coalesce(la.saved_count, 0) as saved_count,
    coalesce(la.engaged_count, 0) as engaged_count,
    coalesce(ec.enrichment_provenance_count, 0) as enrichment_provenance_count,
    coalesce(ac.ai_provenance_count, 0) as ai_provenance_count,
    sca.status as soft_classifier_status,
    coalesce(sca.attempt_count, 0) as soft_classifier_attempt_count,
    sca.last_attempt_at as soft_classifier_last_attempt_at,
    coalesce(d.accepted_missing_fields, array[]::text[]) as accepted_missing_fields,
    coalesce(d.explicit_review_fields, array[]::text[]) as explicit_review_fields,
    coalesce(d.explicitly_deferred_fields, array[]::text[]) as explicitly_deferred_fields
  from public.works w
  left join public.work_readiness wr on wr.work_id = w.id
  left join public.free_catalog_works fcw on fcw.work_id = w.id and fcw.enabled
  left join library_activity la on la.work_id = w.id
  left join enrichment_counts ec on ec.work_id = w.id
  left join ai_counts ac on ac.work_id = w.id
  left join public.soft_classification_attempts sca on sca.work_id = w.id
  left join decisions d on d.work_id = w.id
),
signals as (
  select
    b.*,
    array_remove(array[
      case when nullif(btrim(b.description), '') is null and not ('description' = any(b.accepted_missing_fields)) and not ('description' = any(b.explicitly_deferred_fields)) then 'description' end,
      case when b.publication_year is null and not ('publication_year' = any(b.accepted_missing_fields)) and not ('publication_year' = any(b.explicitly_deferred_fields)) then 'publication_year' end,
      case when b.century_id is null and not ('century_id' = any(b.accepted_missing_fields)) and not ('century_id' = any(b.explicitly_deferred_fields)) then 'century_id' end,
      case when b.country_id is null and not ('country_id' = any(b.accepted_missing_fields)) and not ('country_id' = any(b.explicitly_deferred_fields)) then 'country_id' end,
      case when cardinality(b.genre_ids) = 0 and not ('genre_ids' = any(b.accepted_missing_fields)) and not ('genre_ids' = any(b.explicitly_deferred_fields)) then 'genre_ids' end,
      case when cardinality(b.theme_ids) = 0 and not ('theme_ids' = any(b.accepted_missing_fields)) and not ('theme_ids' = any(b.explicitly_deferred_fields)) then 'theme_ids' end
    ], null::text) as actionable_missing_fields,
    array_remove(array[
      case when nullif(btrim(coalesce(b.cover, '')), '') is null then 'cover' end
    ], null::text) || b.explicitly_deferred_fields as deferred_visual_fields,
    -- Only fields the EXISTING soft-classifier candidate selector itself
    -- treats as actionable and that also belong to this core metadata pass.
    -- movement_id is deliberately not here: a Work can legitimately have no
    -- literary movement, so null alone must not create an endless review loop.
    array_remove(array[
      case when b.publication_year is null and not ('publication_year' = any(b.accepted_missing_fields)) then 'publication_year' end,
      case when b.century_id is null and not ('century_id' = any(b.accepted_missing_fields)) then 'century_id' end,
      case when cardinality(b.genre_ids) = 0 and not ('genre_ids' = any(b.accepted_missing_fields)) then 'genre_ids' end,
      case when cardinality(b.theme_ids) = 0 and not ('theme_ids' = any(b.accepted_missing_fields)) then 'theme_ids' end
    ], null::text) as soft_classifier_remaining_fields,
    (
      (case when nullif(btrim(b.description), '') is not null or 'description' = any(b.accepted_missing_fields) then 1 else 0 end) +
      (case when b.publication_year is not null or 'publication_year' = any(b.accepted_missing_fields) then 1 else 0 end) +
      (case when b.century_id is not null or 'century_id' = any(b.accepted_missing_fields) then 1 else 0 end) +
      (case when b.country_id is not null or 'country_id' = any(b.accepted_missing_fields) then 1 else 0 end) +
      (case when cardinality(b.genre_ids) > 0 or 'genre_ids' = any(b.accepted_missing_fields) then 1 else 0 end) +
      (case when cardinality(b.theme_ids) > 0 or 'theme_ids' = any(b.accepted_missing_fields) then 1 else 0 end)
    ) as completed_metadata_fields
  from base b
)
select
  s.work_id,
  s.title,
  s.author_id,
  s.original_language,
  s.reader_ready,
  s.catalog_ready,
  s.is_free,
  s.saved_count,
  s.engaged_count,
  case
    when s.is_free then 0
    when s.engaged_count > 0 then 1
    when s.saved_count > 0 then 2
    when s.catalog_ready then 3
    when s.reader_ready then 4
    else 5
  end as priority_bucket,
  case
    when s.is_free then 'free-corpus'
    when s.engaged_count > 0 then 'actively-read'
    when s.saved_count > 0 then 'saved-by-users'
    when s.catalog_ready then 'catalog-ready'
    when s.reader_ready then 'reader-ready'
    else 'ingestion/backlog'
  end as priority_reason,
  s.actionable_missing_fields,
  s.accepted_missing_fields,
  s.explicit_review_fields,
  s.deferred_visual_fields,
  s.soft_classifier_remaining_fields,
  (s.completed_metadata_fields * 100 / 6)::int as metadata_completion_percent,
  s.enrichment_provenance_count,
  s.ai_provenance_count,
  s.soft_classifier_status,
  s.soft_classifier_attempt_count,
  s.soft_classifier_last_attempt_at,
  coalesce(
    s.soft_classifier_status = 'succeeded'
    and cardinality(s.soft_classifier_remaining_fields) > 0
    and s.ai_provenance_count = 0,
    false
  ) as soft_classifier_needs_review
from signals s;

revoke all on public.catalog_enrichment_status from public;
revoke all on public.catalog_enrichment_status from anon;
revoke all on public.catalog_enrichment_status from authenticated;
grant select on public.catalog_enrichment_status to service_role;

create view public.catalog_enrichment_progress
with (security_invoker = true)
as
select
  count(*)::bigint as total_works,
  count(*) filter (where reader_ready)::bigint as reader_ready_works,
  count(*) filter (where catalog_ready)::bigint as catalog_ready_works,
  count(*) filter (where is_free)::bigint as free_works,
  count(*) filter (where cardinality(actionable_missing_fields) = 0)::bigint as metadata_complete_works,
  count(*) filter (where 'description' = any(actionable_missing_fields))::bigint as missing_description,
  count(*) filter (where 'publication_year' = any(actionable_missing_fields))::bigint as missing_publication_year,
  count(*) filter (where 'century_id' = any(actionable_missing_fields))::bigint as missing_century,
  count(*) filter (where 'country_id' = any(actionable_missing_fields))::bigint as missing_country,
  count(*) filter (where 'genre_ids' = any(actionable_missing_fields))::bigint as missing_genres,
  count(*) filter (where 'theme_ids' = any(actionable_missing_fields))::bigint as missing_themes,
  count(*) filter (where 'cover' = any(deferred_visual_fields))::bigint as deferred_missing_covers,
  count(*) filter (where cardinality(explicit_review_fields) > 0)::bigint as explicit_review_works,
  count(*) filter (where soft_classifier_needs_review)::bigint as soft_classifier_review_works,
  round(avg(metadata_completion_percent), 1) as average_metadata_completion_percent
from public.catalog_enrichment_status;

revoke all on public.catalog_enrichment_progress from public;
revoke all on public.catalog_enrichment_progress from anon;
revoke all on public.catalog_enrichment_progress from authenticated;
grant select on public.catalog_enrichment_progress to service_role;

create function public.get_catalog_enrichment_backlog(p_limit int default 100)
returns table (
  work_id text,
  title text,
  priority_bucket int,
  priority_reason text,
  metadata_completion_percent int,
  actionable_missing_fields text[],
  accepted_missing_fields text[],
  explicit_review_fields text[],
  deferred_visual_fields text[],
  soft_classifier_needs_review boolean,
  enrichment_provenance_count int,
  ai_provenance_count int
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    ces.work_id,
    ces.title,
    ces.priority_bucket,
    ces.priority_reason,
    ces.metadata_completion_percent,
    ces.actionable_missing_fields,
    ces.accepted_missing_fields,
    ces.explicit_review_fields,
    ces.deferred_visual_fields,
    ces.soft_classifier_needs_review,
    ces.enrichment_provenance_count,
    ces.ai_provenance_count
  from public.catalog_enrichment_status ces
  where cardinality(ces.actionable_missing_fields) > 0
     or cardinality(ces.explicit_review_fields) > 0
     or ces.soft_classifier_needs_review
  order by
    ces.priority_bucket asc,
    cardinality(ces.explicit_review_fields) desc,
    ces.soft_classifier_needs_review desc,
    ces.metadata_completion_percent asc,
    ces.engaged_count desc,
    ces.saved_count desc,
    ces.work_id asc
  limit greatest(1, least(coalesce(p_limit, 100), 1000));
$$;

revoke all on function public.get_catalog_enrichment_backlog(int) from public;
revoke all on function public.get_catalog_enrichment_backlog(int) from anon;
revoke all on function public.get_catalog_enrichment_backlog(int) from authenticated;
grant execute on function public.get_catalog_enrichment_backlog(int) to service_role;
