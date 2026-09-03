create or replace function public.dispatch_catalog_ai_enrichment_v2()
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
    url := 'https://prknybetxirzbzkvmovw.supabase.co/functions/v1/anki-catalog-enrichment-v2',
    headers := jsonb_build_object('x-omnia-run-token', v_token),
    timeout_milliseconds := 120000
  );
  return v_request;
end;
$$;
revoke all on function public.dispatch_catalog_ai_enrichment_v2() from public, anon, authenticated;
grant execute on function public.dispatch_catalog_ai_enrichment_v2() to service_role;

do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname='anki-catalog-enrichment-v2';
  if v_id is not null then perform cron.unschedule(v_id); end if;
  perform cron.schedule('anki-catalog-enrichment-v2','* * * * *','select public.dispatch_catalog_ai_enrichment_v2();');
end $$;
