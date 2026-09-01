-- WIKISOURCE -> WIKIDATA PUBLICATION-YEAR ENRICHMENT v1
-- Uses the exact workQid already stored by Wikisource ingestion. No title
-- search or fuzzy identity matching is introduced. One batched Wikidata API
-- request handles up to 50 Works; ambiguous/missing P577 is recorded as
-- no_value instead of guessed.

create table if not exists public.catalog_source_enrichment_attempts (
  work_id text not null references public.works(id) on delete cascade,
  field_name text not null,
  source text not null,
  source_ref text,
  status text not null,
  attempt_count int not null default 0,
  last_error text,
  last_attempt_at timestamptz not null default now(),
  next_retry_at timestamptz,
  primary key (work_id, field_name, source),
  constraint catalog_source_enrichment_attempts_status_check
    check (status in ('succeeded','no_value','failed'))
);

alter table public.catalog_source_enrichment_attempts enable row level security;
revoke all on public.catalog_source_enrichment_attempts from public;
revoke all on public.catalog_source_enrichment_attempts from anon;
revoke all on public.catalog_source_enrichment_attempts from authenticated;
grant select, insert, update, delete on public.catalog_source_enrichment_attempts to service_role;

create or replace function public._wikidata_claim_consensus_year(p_entity jsonb, p_property text)
returns int
language sql
immutable
as $$
  with valid as (
    select
      coalesce(c->>'rank','normal') as rank,
      public._author_enrich_claim_year(c) as y
    from jsonb_array_elements(coalesce(p_entity->'claims'->p_property, '[]'::jsonb)) c
    where c->'mainsnak'->>'snaktype' = 'value'
      and coalesce(c->>'rank','normal') <> 'deprecated'
  ), chosen as (
    select y from valid
    where y is not null
      and (
        rank = 'preferred'
        or not exists (select 1 from valid v2 where v2.rank = 'preferred' and v2.y is not null)
      )
  ), years as (
    select distinct y from chosen
  )
  select case when count(*) = 1 then min(y) else null end
  from years;
$$;

create or replace function public.enrich_wikisource_publication_years(
  p_limit int default 25,
  p_dry_run boolean default true
)
returns table (
  processed int,
  succeeded int,
  no_value int,
  failed int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_work_ids text[];
  v_qids text[];
  v_count int := 0;
  v_succeeded int := 0;
  v_no_value int := 0;
  v_failed int := 0;
  v_resp extensions.http_response;
  v_body jsonb;
  v_entity jsonb;
  v_year int;
  v_century_id text;
  v_url text;
  i int;
begin
  select array_agg(c.work_id order by c.priority_bucket, c.work_id),
         array_agg(c.qid order by c.priority_bucket, c.work_id)
    into v_work_ids, v_qids
  from (
    select distinct on (m.work_id)
      m.work_id,
      m.provider_metadata->>'workQid' as qid,
      coalesce(ces.priority_bucket, 5) as priority_bucket
    from public.master_corpus_candidates m
    join public.works w on w.id = m.work_id
    left join public.catalog_enrichment_status ces on ces.work_id = m.work_id
    left join public.catalog_source_enrichment_attempts a
      on a.work_id = m.work_id
     and a.field_name = 'publication_year'
     and a.source = 'wikidata-wikisource-qid'
    where m.source_id = 'wikisource'
      and m.status = 'ready'
      and m.work_id is not null
      and nullif(m.provider_metadata->>'workQid','') is not null
      and w.publication_year is null
      and (
        a.work_id is null
        or (
          a.status = 'failed'
          and a.attempt_count < 3
          and coalesce(a.next_retry_at, now()) <= now()
        )
      )
    order by m.work_id, m.updated_at desc
    limit greatest(1, least(coalesce(p_limit,25),50))
  ) c;

  v_count := coalesce(array_length(v_work_ids,1),0);
  if v_count = 0 then
    return query select 0,0,0,0;
    return;
  end if;

  v_url := 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=' || array_to_string(v_qids, '%7C');
  v_resp := public._author_enrich_http_get_retry(v_url);

  if v_resp.status < 200 or v_resp.status >= 300 then
    if not p_dry_run then
      for i in 1..v_count loop
        insert into public.catalog_source_enrichment_attempts(
          work_id, field_name, source, source_ref, status, attempt_count,
          last_error, last_attempt_at, next_retry_at
        ) values (
          v_work_ids[i], 'publication_year', 'wikidata-wikisource-qid', v_qids[i],
          'failed', 1, 'HTTP ' || v_resp.status::text, now(), now() + interval '6 hours'
        )
        on conflict (work_id, field_name, source) do update set
          source_ref = excluded.source_ref,
          status = 'failed',
          attempt_count = public.catalog_source_enrichment_attempts.attempt_count + 1,
          last_error = excluded.last_error,
          last_attempt_at = now(),
          next_retry_at = now() + interval '6 hours';
      end loop;
    end if;
    return query select v_count,0,0,v_count;
    return;
  end if;

  begin
    v_body := v_resp.content::jsonb;
  exception when others then
    if not p_dry_run then
      for i in 1..v_count loop
        insert into public.catalog_source_enrichment_attempts(
          work_id, field_name, source, source_ref, status, attempt_count,
          last_error, last_attempt_at, next_retry_at
        ) values (
          v_work_ids[i], 'publication_year', 'wikidata-wikisource-qid', v_qids[i],
          'failed', 1, 'Invalid Wikidata JSON response', now(), now() + interval '6 hours'
        )
        on conflict (work_id, field_name, source) do update set
          source_ref = excluded.source_ref,
          status = 'failed',
          attempt_count = public.catalog_source_enrichment_attempts.attempt_count + 1,
          last_error = excluded.last_error,
          last_attempt_at = now(),
          next_retry_at = now() + interval '6 hours';
      end loop;
    end if;
    return query select v_count,0,0,v_count;
    return;
  end;

  for i in 1..v_count loop
    v_entity := v_body->'entities'->v_qids[i];
    v_year := case when v_entity is null or coalesce((v_entity->>'missing')::boolean,false)
      then null
      else public._wikidata_claim_consensus_year(v_entity, 'P577')
    end;

    if v_year is null then
      v_no_value := v_no_value + 1;
      if not p_dry_run then
        insert into public.catalog_source_enrichment_attempts(
          work_id, field_name, source, source_ref, status, attempt_count,
          last_error, last_attempt_at, next_retry_at
        ) values (
          v_work_ids[i], 'publication_year', 'wikidata-wikisource-qid', v_qids[i],
          'no_value', 1, null, now(), null
        )
        on conflict (work_id, field_name, source) do update set
          source_ref = excluded.source_ref,
          status = 'no_value',
          attempt_count = public.catalog_source_enrichment_attempts.attempt_count + 1,
          last_error = null,
          last_attempt_at = now(),
          next_retry_at = null;
      end if;
      continue;
    end if;

    v_succeeded := v_succeeded + 1;
    if not p_dry_run then
      v_century_id := case
        when v_year < 0 then concat(ceil(abs(v_year)::numeric / 100)::int, '-bc')
        else ceil(v_year::numeric / 100)::int::text
      end;

      update public.works w
      set
        publication_year = coalesce(w.publication_year, v_year),
        century_id = case
          when w.century_id is not null then w.century_id
          when exists (
            select 1 from public.taxonomy_terms t
            where t.category = 'century' and t.id = v_century_id
          ) then v_century_id
          else w.century_id
        end
      where w.id = v_work_ids[i];

      insert into public.enrichment_provenance(
        entity_type, entity_id, field_name, value, source, source_ref,
        confidence, basis, fetched_at
      ) values (
        'work', v_work_ids[i], 'publication_year', v_year::text,
        'wikidata', v_qids[i], 'high',
        'Wikidata P577 on exact work QID already stored by Wikisource ingestion; all preferred (or, if none, non-deprecated) year-precision claims agree',
        now()
      )
      on conflict (entity_type, entity_id, field_name, source) do update set
        value = excluded.value,
        source_ref = excluded.source_ref,
        confidence = excluded.confidence,
        basis = excluded.basis,
        fetched_at = excluded.fetched_at;

      insert into public.catalog_source_enrichment_attempts(
        work_id, field_name, source, source_ref, status, attempt_count,
        last_error, last_attempt_at, next_retry_at
      ) values (
        v_work_ids[i], 'publication_year', 'wikidata-wikisource-qid', v_qids[i],
        'succeeded', 1, null, now(), null
      )
      on conflict (work_id, field_name, source) do update set
        source_ref = excluded.source_ref,
        status = 'succeeded',
        attempt_count = public.catalog_source_enrichment_attempts.attempt_count + 1,
        last_error = null,
        last_attempt_at = now(),
        next_retry_at = null;
    end if;
  end loop;

  return query select v_count, v_succeeded, v_no_value, v_failed;
end;
$$;

revoke all on function public.enrich_wikisource_publication_years(int, boolean) from public;
revoke all on function public.enrich_wikisource_publication_years(int, boolean) from anon;
revoke all on function public.enrich_wikisource_publication_years(int, boolean) from authenticated;
grant execute on function public.enrich_wikisource_publication_years(int, boolean) to service_role;