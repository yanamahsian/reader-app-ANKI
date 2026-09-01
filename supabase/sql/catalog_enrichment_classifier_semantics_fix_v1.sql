-- CATALOG ENRICHMENT CLASSIFIER SEMANTICS FIX v1
--
-- The existing anki-soft-classifier is explicitly a factual/bibliographic
-- enrichment pass, not an AI completeness oracle. omnia-classify-work treats
-- unresolved/null fields as a valid outcome and writes successful external
-- facts to enrichment_provenance (not ai_classification_provenance). Therefore
-- a successful classifier run that leaves some fields null is NOT itself a
-- review condition. Review is reserved for an exhausted failed classifier run
-- or an explicit editorial review decision.

drop function if exists public.get_catalog_enrichment_backlog(int);
drop view if exists public.catalog_enrichment_progress;
alter view public.catalog_enrichment_status rename to catalog_enrichment_status_core_v1;

create view public.catalog_enrichment_status
with (security_invoker = true)
as
select
  c.work_id,
  c.title,
  c.author_id,
  c.original_language,
  c.reader_ready,
  c.catalog_ready,
  c.is_free,
  c.saved_count,
  c.engaged_count,
  c.priority_bucket,
  c.priority_reason,
  c.actionable_missing_fields,
  c.accepted_missing_fields,
  c.explicit_review_fields,
  c.deferred_visual_fields,
  c.soft_classifier_remaining_fields,
  c.metadata_completion_percent,
  c.enrichment_provenance_count,
  c.ai_provenance_count,
  c.soft_classifier_status,
  c.soft_classifier_attempt_count,
  c.soft_classifier_last_attempt_at,
  coalesce(
    c.soft_classifier_status = 'failed'
    and c.soft_classifier_attempt_count >= 3,
    false
  ) as soft_classifier_needs_review
from public.catalog_enrichment_status_core_v1 c;

revoke all on public.catalog_enrichment_status_core_v1 from public;
revoke all on public.catalog_enrichment_status_core_v1 from anon;
revoke all on public.catalog_enrichment_status_core_v1 from authenticated;
grant select on public.catalog_enrichment_status_core_v1 to service_role;

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
