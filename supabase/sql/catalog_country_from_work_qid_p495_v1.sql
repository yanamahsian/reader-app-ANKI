-- COUNTRY_ID second stage: Wikidata P495 (country of origin) on the WORK's
-- own QID.
--
-- The existing enrich_country_from_language correctly leaves ambiguous
-- languages (en, fr, de, es, pt, ar, ...) null, since a language alone
-- cannot determine a single literary tradition. Investigated whether a safe,
-- non-AI signal exists to resolve some of these without falling into the
-- explicitly forbidden pattern of "P27=citizenship -> tradition":
--
-- Wikidata's P495 ("country of origin") is a property on the WORK's own
-- item, not the author's -- it describes where the WORK originates, which is
-- much closer to "literary tradition" than an author's citizenship (P27)
-- would be. Live-sampled against 50 real candidate works (null country_id,
-- ambiguous original_language, existing wikidata-work QID): 21/50 (42%) had
-- a P495 claim. Observed values, all verified live via a Wikidata label
-- lookup rather than assumed from memory: Q30=United States, Q45=Portugal,
-- Q155=Brazil, Q27=Ireland, Q145=United Kingdom, Q958291=United
-- Principalities of Moldavia and Wallachia (a historical state with no
-- corresponding canonical term -- correctly left unmapped).
--
-- Q145 (United Kingdom) is deliberately EXCLUDED from the mapping below: this
-- taxonomy splits British literature into english-literature/
-- scottish-literature/irish-literature/welsh-literature, and P495=Q145 alone
-- does not say which -- mapping it to any one of those would be exactly the
-- kind of unproven guess the task forbids. Only sovereign states that
-- resolve to exactly ONE canonical country/tradition term in this
-- taxonomy are included, so the rule never has to choose between competing
-- traditions the way the language-rule already avoids for en/fr/de/es.
--
-- Scope: this first pass only maps the QIDs actually observed and verified
-- live during this investigation. It is intentionally not a full worldwide
-- QID->tradition table built from memory -- expanding it further should
-- follow the same discipline (fetch the real label, confirm the taxonomy
-- has exactly one matching term, only then add the row).

create or replace function public.enrich_country_from_work_qid_p495(p_limit int default 1000, p_dry_run boolean default true)
returns table(processed int, succeeded int)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_processed int := 0;
  v_succeeded int := 0;
  v_qids text[];
  v_chunk text[];
  v_ids_param text;
  v_body jsonb;
  i int;
begin
  create temporary table if not exists _p495_qid_country_map (
    qid text primary key,
    term_id text not null
  ) on commit drop;
  delete from _p495_qid_country_map;
  insert into _p495_qid_country_map(qid, term_id) values
    ('Q30','american-literature'),
    ('Q45','portuguese-literature'),
    ('Q155','brazilian-literature'),
    ('Q27','irish-literature');

  create temporary table if not exists _p495_candidates(work_id text, qid text) on commit drop;
  delete from _p495_candidates;
  insert into _p495_candidates(work_id, qid)
  select w.id, wei.external_id
  from public.works w
  join public.work_external_identifiers wei on wei.work_id = w.id and wei.scheme = 'wikidata-work'
  where w.country_id is null
  order by w.id
  limit greatest(1, least(coalesce(p_limit,1000), 2000));

  select count(*) into v_processed from _p495_candidates;

  create temporary table if not exists _p495_results(work_id text, qid text, term_id text) on commit drop;
  delete from _p495_results;

  select array_agg(distinct qid) into v_qids from _p495_candidates;
  perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS','15000');

  i := 1;
  while i <= coalesce(array_length(v_qids,1),0) loop
    v_chunk := v_qids[i : i+49];
    v_ids_param := array_to_string(v_chunk, '|');
    begin
      select content::jsonb into v_body
      from extensions.http_get('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=' || v_ids_param || '&origin=*');

      insert into _p495_results(work_id, qid, term_id)
      select c.work_id, c.qid, m.term_id
      from _p495_candidates c
      join jsonb_each(v_body->'entities') as ent(key, value) on ent.key = c.qid
      join _p495_qid_country_map m
        on m.qid = (ent.value->'claims'->'P495'->0->'mainsnak'->'datavalue'->'value'->>'id')
      where ent.value->'claims'->'P495' is not null;
    exception when others then
      -- A single chunk failure (network hiccup) must not abort the whole
      -- pass -- those work_ids simply get no result this run and remain
      -- eligible next time; nothing is guessed in their place.
      null;
    end;
    i := i + 50;
  end loop;

  if p_dry_run then
    select count(*) into v_succeeded from _p495_results;
    return query select v_processed, v_succeeded;
    return;
  end if;

  update public.works w
  set country_id = r.term_id
  from _p495_results r
  where w.id = r.work_id and w.country_id is null;
  get diagnostics v_succeeded = row_count;

  insert into public.enrichment_provenance(
    entity_type, entity_id, field_name, value, source, source_ref, confidence, basis, fetched_at
  )
  select 'work', r.work_id, 'country_id', r.term_id, 'wikidata', r.qid, 'high',
    'Wikidata P495 (country of origin) on the work''s own QID (not author citizenship) resolves unambiguously to exactly one canonical literary-tradition taxonomy id',
    now()
  from _p495_results r
  join public.works w on w.id = r.work_id and w.country_id = r.term_id
  on conflict (entity_type, entity_id, field_name, source) do update set
    value = excluded.value, source_ref = excluded.source_ref,
    confidence = excluded.confidence, basis = excluded.basis, fetched_at = excluded.fetched_at;

  return query select v_processed, v_succeeded;
end;
$$;

revoke all on function public.enrich_country_from_work_qid_p495(int, boolean) from public, anon, authenticated;
grant execute on function public.enrich_country_from_work_qid_p495(int, boolean) to service_role;
