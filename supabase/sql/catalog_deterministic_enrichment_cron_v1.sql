-- CATALOG DETERMINISTIC ENRICHMENT v1 -- CRON
--
-- Only the three pure-computation passes (century_id, epoch_id, country_id --
-- no external HTTP call, no rate limit, no plan dependency) are scheduled
-- here. enrich_gutenberg_genre is deliberately NOT scheduled: live testing
-- from this project's Postgres instance (via extensions.http_get, the same
-- mechanism every existing enrichment function in this codebase uses) found
-- gutendex.com unreachable (connection accepted, then 0 bytes / timeout,
-- even at a 15s timeout) from this database, while the exact same mechanism
-- reaches wikidata.org and www.gutenberg.org successfully. Scheduling it
-- as-is would just accumulate useless 'failed' attempts. The function and its
-- alias dictionary are still installed (see catalog_deterministic_
-- enrichment_v1.sql) and are correct/ready; see the accompanying report for
-- the recommended follow-up (move this one pass into an Edge Function, which
-- has a different/broader egress path -- anki-multilingual-discover and
-- omnia-ingest already call gutendex.com successfully from Deno).

select cron.unschedule(jobid) from cron.job where jobname = 'anki-catalog-century-from-year';
select cron.unschedule(jobid) from cron.job where jobname = 'anki-catalog-epoch-from-year';
select cron.unschedule(jobid) from cron.job where jobname = 'anki-catalog-country-from-language';

select cron.schedule(
  'anki-catalog-century-from-year',
  '*/30 * * * *',
  $$select public.enrich_century_from_year(1000, false);$$
);

select cron.schedule(
  'anki-catalog-epoch-from-year',
  '*/30 * * * *',
  $$select public.enrich_epoch_from_year(1000, false);$$
);

select cron.schedule(
  'anki-catalog-country-from-language',
  '*/30 * * * *',
  $$select public.enrich_country_from_language(1000, false);$$
);
