-- GUTENBERG GENRE ENRICHMENT v1 -- Edge Function variant
--
-- Supersedes the dormant public.enrich_gutenberg_genre / _gutendex_match_genre_label
-- functions added in catalog_deterministic_enrichment_v1.sql: live testing
-- confirmed gutendex.com is unreachable from this project's Postgres instance
-- via extensions.http_get (0 bytes, timeout even at 15s), while it IS reachable
-- from Edge Functions (Deno fetch) -- anki-multilingual-discover and
-- omnia-ingest already call it successfully in production. Rather than run two
-- parallel genre-enrichment mechanisms, the plpgsql HTTP-calling function and
-- its dedicated matcher are dropped here; the alias data they share
-- (catalog_taxonomy_source_aliases, source='gutendex') and the taxonomy-match
-- convention are reused as-is by the new Edge Function
-- (anki-gutenberg-genre-enrichment).
--
-- This file adds only the two SQL-side pieces the Edge Function needs, both
-- following existing precedent exactly:
--   * get_gutenberg_genre_candidates(p_limit) -- read-only candidate selection,
--     same shape as get_catalog_ai_enrichment_candidates.
--   * dispatch_gutenberg_genre_enrichment() -- cron dispatcher, identical
--     pattern to dispatch_catalog_ai_enrichment_v2 (same vault secret
--     'omnia_master_corpus_runner_token', same x-omnia-run-token header).
-- catalog_source_enrichment_attempts / enrichment_provenance remain the write
-- targets, with the same (work_id, 'genre_ids', 'gutendex-subjects') /
-- (work, work_id, 'genre_ids', 'gutendex') keys the dormant function used, so
-- no bookkeeping identity changes.
--
-- One deliberate deviation from every other catalog_source_enrichment_attempts
-- consumer in this codebase: a 'failed' row here is NEVER permanently excluded
-- (no attempt_count>=3 cutoff). Every other failure mode in this pipeline is a
-- network/infrastructure failure, not evidence the *work* is a bad candidate --
-- unlike the AI pipeline, there is no "this work's content is unsuitable"
-- failure mode here, only "Gutendex didn't answer this time". A failed
-- attempt still gets capped, growing backoff (6h * attempt_count, capped at
-- 72h) so retries cannot storm Gutendex, but it always becomes eligible again
-- once that time passes. Only a genuine answer (succeeded / no_value /
-- unmapped) is treated as terminal.

drop function if exists public.enrich_gutenberg_genre(int, boolean);
drop function if exists public._gutendex_match_genre_label(text);

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
  left join public.catalog_enrichment_status ces on ces.work_id = re.work_id
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
  order by coalesce(ces.priority_bucket,5), re.work_id
  limit greatest(1, least(coalesce(p_limit,20),50));
$$;

revoke all on function public.get_gutenberg_genre_candidates(int) from public, anon, authenticated;
grant execute on function public.get_gutenberg_genre_candidates(int) to service_role;

-- All guarded writes live here, in SQL, not in the Edge Function -- the Edge
-- Function only does the one thing Postgres cannot (reach gutendex.com) and
-- the label matching (mirrors _catalog_taxonomy_match_label's algorithm
-- exactly, see the function's own comment); every write guard, the
-- terminal-vs-retryable distinction, and the backoff calculation are
-- centralized here so they can be audited/dry-run tested independently of
-- network access, the same way every other enrichment function in this
-- codebase keeps its write logic in SQL.
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
  v_written boolean := false;
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
    get diagnostics v_written = row_count;
    v_written := v_written > 0;

    if v_written then
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

    return v_written;
  end if;

  if p_status in ('no_value','unmapped') then
    -- Terminal: Gutendex genuinely has nothing usable for this book (no
    -- subjects/bookshelves, or none map to canonical taxonomy). Re-fetching
    -- the same static catalog record would not change that -- no retry.
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

  -- p_status = 'failed': network/infrastructure failure, not evidence this
  -- work is a bad candidate. Never terminal -- capped growing backoff
  -- (6h * new attempt_count, capped at 72h) so retries cannot storm
  -- Gutendex, but next_retry_at is always set (never null), so
  -- get_gutenberg_genre_candidates will pick it up again once due.
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

create or replace function public.dispatch_gutenberg_genre_enrichment()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, extensions, pg_temp
as $$
declare
  v_token text;
  v_request bigint;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'omnia_master_corpus_runner_token'
  order by created_at desc
  limit 1;
  if v_token is null then raise exception 'Master corpus runner token missing'; end if;
  v_request := net.http_get(
    url := 'https://prknybetxirzbzkvmovw.supabase.co/functions/v1/anki-gutenberg-genre-enrichment?limit=20',
    headers := jsonb_build_object('x-omnia-run-token', v_token),
    timeout_milliseconds := 120000
  );
  return v_request;
end;
$$;

revoke all on function public.dispatch_gutenberg_genre_enrichment() from public, anon, authenticated;
grant execute on function public.dispatch_gutenberg_genre_enrichment() to service_role;
