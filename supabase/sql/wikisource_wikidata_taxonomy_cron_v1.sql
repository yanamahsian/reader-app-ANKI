-- Keep Wikisource taxonomy enrichment current for future ingests.
-- Stagger five minutes behind the existing publication-year job so the two
-- workers do not hit Wikidata at the same instant.
do $$
declare
  v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='anki-wikisource-taxonomy-enrichment' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
end $$;

select cron.schedule(
  'anki-wikisource-taxonomy-enrichment',
  '5,15,25,35,45,55 * * * *',
  'select * from public.enrich_wikisource_taxonomy(50, false);'
);
