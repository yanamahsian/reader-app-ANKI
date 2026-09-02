-- Continuous multilingual backfill for all Works already present in the AN.KI catalog.
-- Discovery covers Gutenberg plus exact Wikidata/Wikisource sitelinks; the existing
-- Gutenberg runner ingests small batches and preserves jurisdiction-specific rights.

create table if not exists public.multilingual_catalog_backfill_queue (
  author_id text primary key references public.authors(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','discover_wait','ingesting','complete','review')),
  priority integer not null default 100,
  discovery_attempts integer not null default 0,
  runner_calls integer not null default 0,
  last_discovery_request_at timestamptz,
  last_runner_request_at timestamptz,
  completed_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.multilingual_catalog_backfill_queue enable row level security;
revoke all on table public.multilingual_catalog_backfill_queue from anon, authenticated;
grant select, insert, update, delete on table public.multilingual_catalog_backfill_queue to service_role;

insert into public.multilingual_catalog_backfill_queue(author_id, priority)
select w.author_id, min(coalesce(s.priority_bucket,100))
from public.works w
left join public.catalog_enrichment_status s on s.work_id=w.id
group by w.author_id
on conflict (author_id) do nothing;

create or replace function public.dispatch_multilingual_catalog_backfill()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_author text;
  v_run_id uuid;
  v_request bigint;
  v_active integer;
  v_processing integer;
  v_review integer;
  v_result jsonb := '{}'::jsonb;
begin
  update public.multilingual_catalog_backfill_queue q
  set state='pending', updated_at=now(), last_error='Discovery produced no candidates; retrying once'
  where q.state='discover_wait'
    and q.last_discovery_request_at < now() - interval '8 minutes'
    and q.discovery_attempts < 2
    and not exists (select 1 from public.multilingual_candidates c where c.author_id=q.author_id);

  select q.author_id into v_author
  from public.multilingual_catalog_backfill_queue q
  where q.state='pending'
  order by q.priority, q.discovery_attempts, q.author_id
  for update skip locked
  limit 1;

  if v_author is not null then
    insert into public.master_corpus_run_tokens(token_hash, expires_at, remaining_calls)
    values (md5(random()::text || clock_timestamp()::text || v_author), now()+interval '20 minutes', 1)
    returning id into v_run_id;

    select net.http_get(
      url := 'https://prknybetxirzbzkvmovw.supabase.co/functions/v1/anki-multilingual-discover?runId=' || v_run_id::text || '&authorId=' || v_author,
      timeout_milliseconds := 55000
    ) into v_request;

    update public.multilingual_catalog_backfill_queue
    set state='discover_wait', discovery_attempts=discovery_attempts+1,
        last_discovery_request_at=now(), last_error=null, updated_at=now()
    where author_id=v_author;
    v_result := v_result || jsonb_build_object('discovery_author',v_author,'discovery_request_id',v_request);
  end if;

  update public.multilingual_catalog_backfill_queue q
  set state='ingesting', updated_at=now()
  where q.state='discover_wait'
    and q.last_discovery_request_at < now() - interval '2 minutes'
    and (q.discovery_attempts >= 2 or exists (select 1 from public.multilingual_candidates c where c.author_id=q.author_id));

  v_author := null;
  select q.author_id into v_author
  from public.multilingual_catalog_backfill_queue q
  where q.state='ingesting'
    and exists (
      select 1 from public.multilingual_candidates c
      where c.author_id=q.author_id and c.source_id='gutenberg'
        and c.status in ('discovered','failed')
        and (c.next_attempt_at is null or c.next_attempt_at <= now())
    )
  order by q.priority, coalesce(q.last_runner_request_at,'epoch'::timestamptz), q.author_id
  for update skip locked
  limit 1;

  if v_author is not null then
    insert into public.master_corpus_run_tokens(token_hash, expires_at, remaining_calls)
    values (md5(random()::text || clock_timestamp()::text || v_author || 'runner'), now()+interval '20 minutes', 1)
    returning id into v_run_id;

    select net.http_get(
      url := 'https://prknybetxirzbzkvmovw.supabase.co/functions/v1/anki-multilingual-runner?runId=' || v_run_id::text || '&authorId=' || v_author || '&limit=3',
      timeout_milliseconds := 55000
    ) into v_request;

    update public.multilingual_catalog_backfill_queue
    set runner_calls=runner_calls+1, last_runner_request_at=now(), updated_at=now()
    where author_id=v_author;
    v_result := v_result || jsonb_build_object('runner_author',v_author,'runner_request_id',v_request);
  end if;

  update public.multilingual_catalog_backfill_queue q
  set state = case when exists (
        select 1 from public.multilingual_candidates c
        where c.author_id=q.author_id and c.source_id='wikisource' and c.status='review'
      ) then 'review' else 'complete' end,
      completed_at = now(), updated_at=now()
  where q.state='ingesting'
    and not exists (
      select 1 from public.multilingual_candidates c
      where c.author_id=q.author_id and c.source_id='gutenberg' and c.status in ('discovered','failed','processing')
    );

  select count(*) into v_active from public.multilingual_catalog_backfill_queue where state in ('pending','discover_wait','ingesting');
  select count(*) into v_processing from public.multilingual_catalog_backfill_queue where state='ingesting';
  select count(*) into v_review from public.multilingual_catalog_backfill_queue where state='review';
  return v_result || jsonb_build_object('active_remaining',v_active,'ingesting',v_processing,'review',v_review);
end;
$$;

revoke all on function public.dispatch_multilingual_catalog_backfill() from public, anon, authenticated;
grant execute on function public.dispatch_multilingual_catalog_backfill() to service_role;

do $$
declare v_job bigint;
begin
  select jobid into v_job from cron.job where jobname='multilingual-catalog-backfill-v1' limit 1;
  if v_job is not null then perform cron.unschedule(v_job); end if;
  perform cron.schedule('multilingual-catalog-backfill-v1','* * * * *','select public.dispatch_multilingual_catalog_backfill();');
end $$;
