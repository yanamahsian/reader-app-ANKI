create table if not exists public.catalog_ai_enrichment_runs (
  work_id text primary key references public.works(id) on delete cascade,
  edition_id text references public.editions(id) on delete set null,
  prompt_version text not null default 'v2',
  status text not null default 'pending' check (status in ('pending','processing','succeeded','failed')),
  attempts integer not null default 0,
  completed_fields text[] not null default '{}'::text[],
  unresolved_fields text[] not null default '{}'::text[],
  model text,
  result jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  next_attempt_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.catalog_ai_enrichment_runs enable row level security;
revoke all on table public.catalog_ai_enrichment_runs from anon, authenticated;
grant select, insert, update, delete on table public.catalog_ai_enrichment_runs to service_role;

create or replace function public.get_catalog_ai_enrichment_candidates(p_limit integer default 1, p_work_id text default null)
returns table(work_id text, edition_id text)
language sql
security definer
set search_path = public, pg_temp
as $$
  with candidate_works as (
    select
      w.id,
      case when fcw.work_id is not null and fcw.enabled then 1 else 0 end as free_priority,
      ((w.description is null)::int +
       (w.publication_year is null)::int +
       (w.century_id is null)::int +
       (w.country_id is null)::int +
       (coalesce(cardinality(w.genre_ids),0)=0)::int +
       (coalesce(cardinality(w.theme_ids),0)=0)::int +
       (w.movement_id is null)::int +
       (w.epoch_id is null)::int) as missing_count
    from public.works w
    left join public.free_catalog_works fcw on fcw.work_id = w.id
    left join public.catalog_ai_enrichment_runs r on r.work_id = w.id
    where (p_work_id is null or w.id = p_work_id)
      and (
        w.description is null or w.publication_year is null or w.century_id is null or
        w.country_id is null or coalesce(cardinality(w.genre_ids),0)=0 or
        coalesce(cardinality(w.theme_ids),0)=0 or w.movement_id is null or w.epoch_id is null
      )
      and (
        r.work_id is null or
        r.prompt_version <> 'v2' or
        (r.status = 'failed' and r.attempts < 3 and (r.next_attempt_at is null or r.next_attempt_at <= now())) or
        (r.status = 'processing' and r.started_at < now() - interval '20 minutes')
      )
  ), ready_editions as (
    select distinct on (e.work_id) e.work_id, e.id as edition_id
    from public.editions e
    join public.book_files bf on bf.edition_id = e.id
      and bf.kind = 'normalized' and bf.format = 'anki-json' and bf.ingestion_status = 'ready'
    where e.ingestion_status = 'ready'
    order by e.work_id,
      case when e.is_original then 0 else 1 end,
      e.id
  )
  select cw.id, re.edition_id
  from candidate_works cw
  join ready_editions re on re.work_id = cw.id
  order by cw.free_priority desc, cw.missing_count desc, cw.id
  limit greatest(1, least(coalesce(p_limit,1),3));
$$;

revoke all on function public.get_catalog_ai_enrichment_candidates(integer,text) from public, anon, authenticated;
grant execute on function public.get_catalog_ai_enrichment_candidates(integer,text) to service_role;
