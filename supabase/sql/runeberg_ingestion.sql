-- Project Runeberg ingestion support — applied to production 2026-08-29.
--
-- The Edge Function source lives at:
--   supabase/functions/omnia-runeberg-ingest-one/index.ts
--
-- This migration adds `runeberg` to the existing bounded master-corpus dispatcher;
-- it does not create a parallel ingestion pipeline. Existing identity, normalization,
-- rights and readiness layers remain canonical.

create or replace function public.master_corpus_autonomous_tick()
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'vault', 'net', 'extensions', 'pg_temp'
as $function$
declare
  v_token text; v_stale_reset integer:=0; v_processing integer:=0; v_slots integer:=0; v_pending integer:=0; v_dispatched integer:=0; v_discover_author text:=null; v_request_id bigint:=null; r record;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name='omnia_master_corpus_runner_token' order by created_at desc limit 1;
  if v_token is null then raise exception 'Master corpus runner token is missing'; end if;

  update public.master_corpus_candidates c
  set status=case when c.attempts>=3 then 'review' else 'failed' end,
      last_error=coalesce(c.last_error,'Automatic worker: processing lease expired'),processing_started_at=null,
      next_attempt_at=case when c.attempts>=3 then null else now()+interval '10 minutes' end,updated_at=now()
  from public.master_corpus_authors m
  where c.master_author_id=m.id and m.status='ingesting' and c.status='processing' and c.processing_started_at is not null and c.processing_started_at<now()-interval '10 minutes';
  get diagnostics v_stale_reset=row_count;

  update public.master_corpus_authors m
  set status='blocked',notes=case when coalesce(m.notes,'')='' then 'No usable book candidates discovered from enabled providers in autonomous pass' when m.notes not like '%No usable book candidates discovered from enabled providers%' then m.notes||'; No usable book candidates discovered from enabled providers in autonomous pass' else m.notes end,updated_at=now()
  where m.status='ingesting' and m.updated_at<now()-interval '5 minutes' and not exists(select 1 from public.master_corpus_candidates c where c.master_author_id=m.id);

  select count(*) into v_pending from public.master_corpus_candidates c join public.master_corpus_authors m on m.id=c.master_author_id
  where m.status='ingesting' and (c.status in('discovered','processing') or (c.status='failed' and c.attempts<3 and coalesce(c.next_attempt_at,now())<=now()));

  if v_pending<20 then
    select m.canonical_author_id into v_discover_author from public.master_corpus_authors m
    where m.status='ready-for-discovery' and m.canonical_author_id is not null and m.original_language is not null
    order by m.priority asc,m.display_name asc for update skip locked limit 1;
    if v_discover_author is not null then
      update public.master_corpus_authors set status='ingesting',updated_at=now() where canonical_author_id=v_discover_author;
      v_request_id:=net.http_get(url:='https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-master-corpus-discover',params:=jsonb_build_object('authorId',v_discover_author),headers:=jsonb_build_object('x-omnia-run-token',v_token),timeout_milliseconds:=120000);
      v_request_id:=net.http_get(url:='https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-wikisource-discover-author',params:=jsonb_build_object('authorId',v_discover_author),headers:=jsonb_build_object('x-omnia-run-token',v_token),timeout_milliseconds:=120000);
    end if;
  end if;

  select count(*) into v_processing from public.master_corpus_candidates c join public.master_corpus_authors m on m.id=c.master_author_id where c.status='processing' and m.status='ingesting';
  v_slots:=greatest(0,10-v_processing);
  if v_slots>0 then
    for r in
      with chosen as(
        select c.id from public.master_corpus_candidates c join public.master_corpus_authors m on m.id=c.master_author_id
        where m.status='ingesting' and m.canonical_author_id is not null and (c.status='discovered' or (c.status='failed' and c.attempts<3 and coalesce(c.next_attempt_at,now())<=now()))
        order by case c.source_id when 'gutenberg' then 0 when 'wikisource' then 1 when 'runeberg' then 2 when 'aozora' then 3 else 4 end, m.priority asc,c.master_author_id,c.ordinal asc for update of c skip locked limit v_slots
      ),claimed as(
        update public.master_corpus_candidates c set status='processing',attempts=c.attempts+1,processing_started_at=now(),next_attempt_at=now()+interval '10 minutes',last_error=null,updated_at=now()
        from chosen where c.id=chosen.id returning c.id,c.external_id,c.source_id,c.master_author_id
      ) select cl.id,cl.external_id,cl.source_id,m.canonical_author_id from claimed cl join public.master_corpus_authors m on m.id=cl.master_author_id
    loop
      begin
        if r.source_id='gutenberg' then
          v_request_id:=net.http_get(url:='https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-master-corpus-ingest-one',params:=jsonb_build_object('authorId',r.canonical_author_id,'externalId',r.external_id,'dryRun','false'),headers:=jsonb_build_object('x-omnia-run-token',v_token),timeout_milliseconds:=120000);
        elsif r.source_id='wikisource' then
          v_request_id:=net.http_get(url:='https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-wikisource-ingest-one',params:=jsonb_build_object('authorId',r.canonical_author_id,'externalId',r.external_id),headers:=jsonb_build_object('x-omnia-run-token',v_token),timeout_milliseconds:=120000);
        elsif r.source_id='runeberg' then
          v_request_id:=net.http_get(url:='https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-runeberg-ingest-one',params:=jsonb_build_object('authorId',r.canonical_author_id,'externalId',r.external_id),headers:=jsonb_build_object('x-omnia-run-token',v_token),timeout_milliseconds:=120000);
        elsif r.source_id='aozora' then
          v_request_id:=net.http_get(url:='https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-aozora-ingest-one',params:=jsonb_build_object('authorId',r.canonical_author_id,'externalId',r.external_id),headers:=jsonb_build_object('x-omnia-run-token',v_token),timeout_milliseconds:=120000);
        else raise exception 'Unsupported autonomous source: %',r.source_id; end if;
        update public.master_corpus_candidates set last_request_id=v_request_id,updated_at=now() where id=r.id; v_dispatched:=v_dispatched+1;
      exception when others then
        update public.master_corpus_candidates set status=case when attempts>=3 then 'review' else 'failed' end,processing_started_at=null,last_error='Automatic dispatch failed: '||sqlerrm,next_attempt_at=case when attempts>=3 then null else now()+interval '10 minutes' end,updated_at=now() where id=r.id;
      end;
    end loop;
  end if;

  update public.master_corpus_authors m set status='rights-review',updated_at=now()
  where m.status='ingesting' and exists(select 1 from public.master_corpus_candidates c where c.master_author_id=m.id)
    and not exists(select 1 from public.master_corpus_candidates c where c.master_author_id=m.id and (c.status in('discovered','processing') or (c.status='failed' and c.attempts<3)));

  select count(*) into v_processing from public.master_corpus_candidates c join public.master_corpus_authors m on m.id=c.master_author_id where c.status='processing' and m.status='ingesting';
  select count(*) into v_pending from public.master_corpus_candidates c join public.master_corpus_authors m on m.id=c.master_author_id where m.status='ingesting' and (c.status in('discovered','processing') or (c.status='failed' and c.attempts<3));
  insert into public.master_corpus_cron_runs(stale_reset,discovered_author_id,dispatched,active_processing,pending_candidates,note)
  values(v_stale_reset,v_discover_author,v_dispatched,v_processing,v_pending,case when v_discover_author is null then null else 'Gutenberg + Wikisource discovery; Aozora catalog is synced separately' end);
  delete from public.master_corpus_cron_runs where ran_at<now()-interval '14 days';
  return jsonb_build_object('ok',true,'staleReset',v_stale_reset,'discoveryAuthorId',v_discover_author,'dispatched',v_dispatched,'activeProcessing',v_processing,'pendingCandidates',v_pending,'maxConcurrency',10,'providers',jsonb_build_array('gutenberg','wikisource','runeberg','aozora'));
end;$function$;

-- First production Runeberg candidate. The source page explicitly states that the
-- 1956 Karlfeldt collection adds no textual copyright beyond Karlfeldt's own work;
-- artwork is excluded by the text-only importer. DE availability still comes only
-- from AN.KI's existing deterministic death-year rights engine.
insert into public.master_corpus_candidates
(master_author_id,source_id,external_id,title,language,ordinal,status,provider_metadata)
select m.id,'runeberg','eakdikt','Erik Axel Karlfeldts dikter','sv',0,'discovered',jsonb_build_object(
  'selection_reason','Nobel recovery: Project Runeberg full OCR text',
  'sourcePageUrl','https://runeberg.org/eakdikt/',
  'ocrTextUrl','https://runeberg.org/download.pl?mode=ocrtext&work=eakdikt',
  'sourcePublicationYear',1956,
  'copyrightNote','Runeberg states this 1956 collection adds no copyright beyond Karlfeldt text; artwork is excluded from AN.KI ingestion'
)
from public.master_corpus_authors m
where m.canonical_author_id='erik-axel-karlfeldt'
on conflict (source_id,external_id) do nothing;
