-- Schedule the zero-cost Wikisource publication-year enrichment worker.
-- One batched Wikidata request every ten minutes; once the queue is exhausted
-- the function returns immediately without an external request.

do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'anki-wikisource-year-enrichment' limit 1;
  if v_jobid is not null then
    perform cron.unschedule(v_jobid);
  end if;
end $$;

select cron.schedule(
  'anki-wikisource-year-enrichment',
  '*/10 * * * *',
  $$select * from public.enrich_wikisource_publication_years(50, false);$$
);