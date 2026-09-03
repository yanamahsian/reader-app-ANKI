-- Fix a real production bug found live during the first non-dry-run batch:
-- `get diagnostics v_written = row_count` requires an INTEGER target, but
-- v_written was declared boolean, so every call that actually matched a
-- genre (the 'succeeded' branch) raised
-- "operator does not exist: boolean > integer" and rolled back the entire
-- transaction -- silently discarding both the works.genre_ids UPDATE and the
-- catalog_source_enrichment_attempts insert. The Edge Function never checked
-- the RPC's `.error` field (also fixed, see anki-gutenberg-genre-enrichment/
-- index.ts), so this surfaced only as a work reported "succeeded" in the
-- JSON response with worksActuallyWritten staying 0 and no attempt row ever
-- written (confirmed live: work a-cadets-honor-mark-mallorys-heroism matched
-- 'novel' via the new "Category: Novels" alias, but genre_ids stayed empty
-- and no catalog_source_enrichment_attempts row existed until this fix).
--
-- Only the 'succeeded' branch was affected -- 'no_value'/'unmapped'/'failed'
-- never touched v_written and were confirmed writing correctly throughout.
create or replace function public.record_gutenberg_genre_result(
  p_work_id text,
  p_external_id text,
  p_status text,
  p_genre_ids text[] default null,
  p_unmatched text default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prior_attempts int := 0;
  v_next_retry timestamptz;
  v_written_count int := 0;
begin
  if p_status not in ('succeeded','no_value','unmapped','failed') then
    raise exception 'invalid status %', p_status;
  end if;

  select attempt_count into v_prior_attempts
  from public.catalog_source_enrichment_attempts
  where work_id = p_work_id and field_name = 'genre_ids' and source = 'gutendex-subjects';

  if p_status = 'succeeded' then
    update public.works
    set genre_ids = p_genre_ids
    where id = p_work_id
      and coalesce(cardinality(genre_ids),0) = 0;
    get diagnostics v_written_count = row_count;

    if v_written_count > 0 then
      insert into public.enrichment_provenance(
        entity_type, entity_id, field_name, value, source, source_ref, confidence, basis, fetched_at
      ) values (
        'work', p_work_id, 'genre_ids', to_jsonb(p_genre_ids)::text, 'gutendex', p_external_id, 'medium',
        'Gutendex subjects/bookshelves for Gutenberg #' || p_external_id || ' matched only to canonical AN.KI genre taxonomy (fetched via Edge Function, gutendex.com unreachable from Postgres)',
        now()
      )
      on conflict (entity_type, entity_id, field_name, source) do update set
        value = excluded.value, source_ref = excluded.source_ref,
        confidence = excluded.confidence, basis = excluded.basis, fetched_at = excluded.fetched_at;
    end if;

    insert into public.catalog_source_enrichment_attempts(
      work_id, field_name, source, source_ref, status, attempt_count, last_error, last_attempt_at, next_retry_at
    ) values (
      p_work_id, 'genre_ids', 'gutendex-subjects', p_external_id, 'succeeded', coalesce(v_prior_attempts,0)+1, null, now(), null
    )
    on conflict (work_id, field_name, source) do update set
      source_ref = excluded.source_ref, status='succeeded',
      attempt_count = public.catalog_source_enrichment_attempts.attempt_count + 1,
      last_error = null, last_attempt_at = now(), next_retry_at = null;

    return v_written_count > 0;
  end if;

  if p_status in ('no_value','unmapped') then
    insert into public.catalog_source_enrichment_attempts(
      work_id, field_name, source, source_ref, status, attempt_count, last_error, last_attempt_at, next_retry_at
    ) values (
      p_work_id, 'genre_ids', 'gutendex-subjects', p_external_id, p_status, coalesce(v_prior_attempts,0)+1,
      case when p_status='unmapped' then 'Unmapped: '||coalesce(p_unmatched,'') else null end, now(), null
    )
    on conflict (work_id, field_name, source) do update set
      source_ref = excluded.source_ref, status = excluded.status,
      attempt_count = public.catalog_source_enrichment_attempts.attempt_count + 1,
      last_error = excluded.last_error, last_attempt_at = now(), next_retry_at = null;
    return false;
  end if;

  v_next_retry := now() + (least(6 * (coalesce(v_prior_attempts,0)+1), 72) || ' hours')::interval;
  insert into public.catalog_source_enrichment_attempts(
    work_id, field_name, source, source_ref, status, attempt_count, last_error, last_attempt_at, next_retry_at
  ) values (
    p_work_id, 'genre_ids', 'gutendex-subjects', p_external_id, 'failed', coalesce(v_prior_attempts,0)+1, p_error, now(), v_next_retry
  )
  on conflict (work_id, field_name, source) do update set
    source_ref = excluded.source_ref, status='failed',
    attempt_count = public.catalog_source_enrichment_attempts.attempt_count + 1,
    last_error = excluded.last_error, last_attempt_at = now(), next_retry_at = v_next_retry;
  return false;
end;
$$;

revoke all on function public.record_gutenberg_genre_result(text,text,text,text[],text,text) from public, anon, authenticated;
grant execute on function public.record_gutenberg_genre_result(text,text,text,text[],text,text) to service_role;
