do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname='anki-catalog-enrichment-v2';
  if v_id is not null then perform cron.unschedule(v_id); end if;
end $$;
