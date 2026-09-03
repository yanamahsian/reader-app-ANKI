-- GUTENBERG GENRE ENRICHMENT v1 -- perf fix for get_gutenberg_genre_candidates
--
-- The first version of this function left-joined public.catalog_enrichment_status
-- (a plain, non-materialized view built on catalog_enrichment_status_core_v1,
-- which itself correlates editions/book_files/rights_assertions/authors/
-- taxonomy_terms/user_library per work) purely to order candidates by
-- priority_bucket. That view has no index Postgres can use from a nested-loop
-- probe keyed on work_id, so the planner recomputed the ENTIRE view once per
-- outer candidate row. Confirmed via EXPLAIN ANALYZE: even with only ~14-2459
-- outer rows, this made the query exceed both a 5s local statement_timeout
-- and (via PostgREST/supabase-js from the Edge Function) the platform's
-- statement_timeout, surfacing as "canceling statement due to statement
-- timeout" / HTTP 500 on every dry-run and production call.
--
-- This was also a deviation from the actual precedent it claimed to follow:
-- get_catalog_ai_enrichment_candidates does NOT join catalog_enrichment_status
-- at all -- it orders free-catalog works first using public.free_catalog_works
-- directly (a real table with a pkey on work_id, confirmed cheap via EXPLAIN
-- ANALYZE: index scan, sub-millisecond per probe). This migration replaces
-- the ces join/ordering with the same free_catalog_works pattern, fixing both
-- the bug and the precedent mismatch. No other behavior changes: eligibility
-- (empty genre_ids, no terminal attempt, no attempt still in backoff) is
-- unchanged. Verified after the fix: exactly 2459 eligible rows, matching the
-- known count of Gutenberg-linked Works with empty genre_ids.

create or replace function public.get_gutenberg_genre_candidates(p_limit int default 20)
returns table (
  work_id text,
  title text,
  external_id text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with ranked_editions as (
    select e.work_id, e.external_id,
      row_number() over (
        partition by e.work_id
        order by case when e.is_original then 0 else 1 end, e.external_id
      ) as rn
    from public.editions e
    where e.source_id = 'gutenberg'
  )
  select w.id, w.title, re.external_id
  from ranked_editions re
  join public.works w on w.id = re.work_id
  left join public.free_catalog_works fcw on fcw.work_id = re.work_id
  where re.rn = 1
    and coalesce(cardinality(w.genre_ids),0) = 0
    and not exists (
      select 1 from public.catalog_source_enrichment_attempts a
      where a.work_id = re.work_id and a.field_name='genre_ids' and a.source='gutendex-subjects'
        and a.status in ('succeeded','no_value','unmapped')
    )
    and not exists (
      select 1 from public.catalog_source_enrichment_attempts a
      where a.work_id = re.work_id and a.field_name='genre_ids' and a.source='gutendex-subjects'
        and a.status='failed' and coalesce(a.next_retry_at, now()) > now()
    )
  order by case when fcw.work_id is not null and fcw.enabled then 0 else 1 end, re.work_id
  limit greatest(1, least(coalesce(p_limit,20),50));
$$;

revoke all on function public.get_gutenberg_genre_candidates(int) from public, anon, authenticated;
grant execute on function public.get_gutenberg_genre_candidates(int) to service_role;
