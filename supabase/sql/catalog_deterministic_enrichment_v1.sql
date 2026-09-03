-- CATALOG DETERMINISTIC ENRICHMENT v1 (no AI, no OpenAI calls)
--
-- Adds four new, independent, additive enrichment passes that reuse the
-- existing conventions established by author_death_year_enrichment.sql /
-- wikisource_wikidata_year_enrichment_v1.sql / wikisource_wikidata_taxonomy_*:
--   * p_dry_run default true, computes and returns without writing;
--   * never overwrite a currently non-null/non-empty value (double-guarded:
--     once in the eligibility WHERE, again in the UPDATE itself);
--   * facts attributed to an external source go through enrichment_provenance;
--   * HTTP-backed passes use catalog_source_enrichment_attempts for bounded
--     retry (reusing _author_enrich_http_get_retry, which already backs off
--     on HTTP 429);
--   * genre/theme/movement label resolution reuses
--     _catalog_taxonomy_match_label / catalog_taxonomy_source_aliases --
--     canonical taxonomy_terms only, unmapped labels are recorded as
--     'unmapped', never guessed.
--
-- Deliberately NOT implemented here (left for AI v2 once OpenAI credit is
-- restored, or intentionally left out of scope -- see the accompanying
-- report for the reasoning on each):
--   * description, theme_ids -- explicitly semantic fields, out of scope
--     for this migration by instruction.
--   * movement_id from Gutendex -- LCSH/Gutendex subject headings are not a
--     reliable literary-movement signal; the existing Wikidata P135 pipeline
--     (enrich_wikisource_taxonomy) remains the only deterministic movement_id
--     source.
--   * country_id for ambiguous-tradition languages (en, fr, de, es, pt, nl,
--     ar, ...) -- left null rather than guessed; see
--     enrich_country_from_language's comment for the full reasoning.
--   * epoch_id outside the three chronologically uncontested brackets below
--     -- ancient/medieval/renaissance/postwar boundaries are genuinely
--     contested across standard literary periodizations and are left null
--     rather than forced into a bracket.

-- ============================================================================
-- A. century_id, computed purely from an already-known publication_year.
-- ============================================================================
create or replace function public.enrich_century_from_year(
  p_limit int default 1000,
  p_dry_run boolean default true
)
returns table (processed int, succeeded int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_processed int := 0;
  v_succeeded int := 0;
begin
  create temporary table if not exists _century_candidates(id text, computed_id text) on commit drop;
  delete from _century_candidates;
  insert into _century_candidates(id, computed_id)
  select w.id,
    case
      when w.publication_year < 0 then concat(ceil(abs(w.publication_year)::numeric/100)::int,'-bc')
      else ceil(w.publication_year::numeric/100)::int::text
    end
  from public.works w
  where w.century_id is null and w.publication_year is not null
  limit greatest(1, least(coalesce(p_limit,1000),5000));
  select count(*) into v_processed from _century_candidates;
  if p_dry_run then
    select count(*) into v_succeeded from _century_candidates c
    where exists (select 1 from public.taxonomy_terms t where t.category='century' and t.id=c.computed_id);
    return query select v_processed, v_succeeded;
    return;
  end if;
  update public.works w set century_id = c.computed_id
  from _century_candidates c
  where w.id = c.id and w.century_id is null
    and exists (select 1 from public.taxonomy_terms t where t.category='century' and t.id=c.computed_id);
  get diagnostics v_succeeded = row_count;
  return query select v_processed, v_succeeded;
end;
$$;
revoke all on function public.enrich_century_from_year(int, boolean) from public, anon, authenticated;
grant execute on function public.enrich_century_from_year(int, boolean) to service_role;

-- ============================================================================
-- B. epoch_id: only three chronologically unambiguous brackets.
-- ============================================================================
create or replace function public.enrich_epoch_from_year(
  p_limit int default 1000,
  p_dry_run boolean default true
)
returns table (processed int, succeeded int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_processed int := 0;
  v_succeeded int := 0;
begin
  create temporary table if not exists _epoch_candidates(id text, computed_id text) on commit drop;
  delete from _epoch_candidates;
  insert into _epoch_candidates(id, computed_id)
  select w.id,
    case
      when w.publication_year between 1789 and 1815 then 'revolutionary-age'
      when w.publication_year between 1816 and 1913 then 'long-nineteenth-century'
      when w.publication_year between 1918 and 1939 then 'interwar-period'
      else null
    end
  from public.works w
  where w.epoch_id is null and w.publication_year is not null
  limit greatest(1, least(coalesce(p_limit,1000),5000));
  select count(*) into v_processed from _epoch_candidates;
  if p_dry_run then
    select count(*) into v_succeeded from _epoch_candidates c
    where c.computed_id is not null
      and exists (select 1 from public.taxonomy_terms t where t.category='epoch' and t.id=c.computed_id);
    return query select v_processed, v_succeeded;
    return;
  end if;
  update public.works w set epoch_id = c.computed_id
  from _epoch_candidates c
  where w.id = c.id and w.epoch_id is null and c.computed_id is not null
    and exists (select 1 from public.taxonomy_terms t where t.category='epoch' and t.id=c.computed_id);
  get diagnostics v_succeeded = row_count;
  return query select v_processed, v_succeeded;
end;
$$;
revoke all on function public.enrich_epoch_from_year(int, boolean) from public, anon, authenticated;
grant execute on function public.enrich_epoch_from_year(int, boolean) to service_role;

-- ============================================================================
-- C. country_id from original language only where literary tradition is
-- unambiguous in the project's canonical taxonomy.
-- ============================================================================
alter table public.enrichment_provenance
  drop constraint if exists enrichment_provenance_source_check;
alter table public.enrichment_provenance
  add constraint enrichment_provenance_source_check
  check (source in ('gutendex','wikidata','aozora','language-rule'));

create or replace function public.enrich_country_from_language(
  p_limit int default 1000,
  p_dry_run boolean default true
)
returns table (processed int, succeeded int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_processed int := 0;
  v_succeeded int := 0;
begin
  create temporary table if not exists _lang_country_map (
    lang text primary key,
    term_id text not null,
    confidence text not null
  ) on commit drop;
  delete from _lang_country_map;
  insert into _lang_country_map(lang, term_id, confidence) values
    ('ru','russian-literature','high'),
    ('hu','hungarian-literature','high'),
    ('fi','finnish-literature','high'),
    ('pl','polish-literature','high'),
    ('da','danish-literature','high'),
    ('no','norwegian-literature','high'),
    ('cs','czech-literature','high'),
    ('uk','ukrainian-literature','high'),
    ('el','greek-literature','high'),
    ('grc','ancient-greek-literature','high'),
    ('fa','persian-literature','high'),
    ('la','latin-literature','high'),
    ('zh','chinese-literature','medium'),
    ('sv','swedish-literature','medium'),
    ('it','italian-literature','medium');
  create temporary table if not exists _country_candidates(id text, lang text, term_id text, confidence text) on commit drop;
  delete from _country_candidates;
  insert into _country_candidates(id, lang, term_id, confidence)
  select w.id, w.original_language, m.term_id, m.confidence
  from public.works w join _lang_country_map m on m.lang = w.original_language
  where w.country_id is null
  limit greatest(1, least(coalesce(p_limit,1000),5000));
  select count(*) into v_processed from _country_candidates;
  if p_dry_run then
    select count(*) into v_succeeded from _country_candidates c
    where exists (select 1 from public.taxonomy_terms t where t.category='country' and t.id=c.term_id);
    return query select v_processed, v_succeeded;
    return;
  end if;
  update public.works w set country_id = c.term_id
  from _country_candidates c
  where w.id = c.id and w.country_id is null
    and exists (select 1 from public.taxonomy_terms t where t.category='country' and t.id=c.term_id);
  get diagnostics v_succeeded = row_count;
  insert into public.enrichment_provenance(entity_type, entity_id, field_name, value, source, source_ref, confidence, basis, fetched_at)
  select 'work', c.id, 'country_id', c.term_id, 'language-rule', c.lang, c.confidence,
    'works.original_language=''' || c.lang || ''' maps to exactly one literary-tradition taxonomy id with no competing id in taxonomy_terms(category=''country'') for this language', now()
  from _country_candidates c
  join public.works w on w.id = c.id and w.country_id = c.term_id
  on conflict (entity_type, entity_id, field_name, source) do update set
    value = excluded.value, source_ref = excluded.source_ref,
    confidence = excluded.confidence, basis = excluded.basis, fetched_at = excluded.fetched_at;
  return query select v_processed, v_succeeded;
end;
$$;
revoke all on function public.enrich_country_from_language(int, boolean) from public, anon, authenticated;
grant execute on function public.enrich_country_from_language(int, boolean) to service_role;

-- ============================================================================
-- D. genre_ids from Gutendex subjects/bookshelves.
-- ============================================================================
insert into public.catalog_taxonomy_source_aliases(source, category, source_label_normalized, term_id, note)
values
  ('gutendex','genre','detective and mystery stories','detective-fiction','LCSH heading'),
  ('gutendex','genre','mystery fiction','detective-fiction','Gutendex bookshelf wording'),
  ('gutendex','genre','love stories','romance-fiction','LCSH heading'),
  ('gutendex','genre','adventure stories','adventure-fiction','LCSH heading'),
  ('gutendex','genre','sea stories','nautical-fiction','LCSH heading'),
  ('gutendex','genre','war stories','war-fiction','LCSH heading'),
  ('gutendex','genre','ghost stories','horror','LCSH heading'),
  ('gutendex','genre','horror tales','horror','LCSH heading'),
  ('gutendex','genre','fantasy fiction','fantasy','LCSH heading'),
  ('gutendex','genre','short stories','short-story-collection','LCSH heading, plural = collection'),
  ('gutendex','genre','tragedies','tragedy','LCSH plural form'),
  ('gutendex','genre','comedies','comedy','LCSH plural form'),
  ('gutendex','genre','essays','essay-collection','LCSH plural form = collection'),
  ('gutendex','genre','autobiographies','autobiography','LCSH plural form'),
  ('gutendex','genre','diaries','diary-journal','LCSH heading'),
  ('gutendex','genre','personal correspondence','letters','LCSH heading'),
  ('gutendex','genre','description and travel','travel-writing','LCSH heading'),
  ('gutendex','genre','voyages and travels','travel-writing','LCSH heading'),
  ('gutendex','genre','utopias','utopian-fiction','LCSH heading'),
  ('gutendex','genre','dystopias','dystopian-fiction','LCSH heading'),
  ('gutendex','genre','bildungsromans','bildungsroman','LCSH plural form'),
  ('gutendex','genre','epistolary fiction','epistolary-novel','LCSH heading'),
  ('gutendex','genre','picaresque literature','picaresque-novel','LCSH heading'),
  ('gutendex','genre','manifestoes','manifesto','LCSH plural form'),
  ('gutendex','genre','manifestos','manifesto','LCSH plural form'),
  ('gutendex','genre','treatises','treatise','LCSH plural form'),
  ('gutendex','genre','lectures','lectures','LCSH heading'),
  ('gutendex','genre','fairy tales','fantasy','LCSH heading -- closest canonical genre'),
  ('gutendex','genre','satires','satire','LCSH plural form'),
  ('gutendex','genre','biographies','biography','LCSH plural form')
on conflict (source, category, source_label_normalized) do update set term_id = excluded.term_id, note = excluded.note;

create or replace function public._gutendex_match_genre_label(p_label text)
returns text language sql stable set search_path = public as $$
  with parts as (
    select p_label as full_text, split_part(p_label, ' -- ', 1) as head_text
  ), candidates as (
    select full_text as v, 1 as ord from parts
    union all select head_text, 2 from parts where head_text <> full_text
    union all select split_part(head_text, ',', 1), 3 from parts where split_part(head_text,',',1) <> head_text
  )
  select public._catalog_taxonomy_match_label('gutendex','genre', v)
  from candidates
  where public._catalog_taxonomy_match_label('gutendex','genre', v) is not null
  order by ord limit 1;
$$;
revoke all on function public._gutendex_match_genre_label(text) from public, anon, authenticated;
grant execute on function public._gutendex_match_genre_label(text) to service_role;

create or replace function public.enrich_gutenberg_genre(
  p_limit int default 15,
  p_dry_run boolean default true
)
returns table (processed int, succeeded int, no_value int, unmapped int, failed int)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_source constant text := 'gutendex-subjects';
  v_work_ids text[];
  v_external_ids text[];
  v_count int := 0;
  v_succeeded int := 0;
  v_no_value int := 0;
  v_unmapped int := 0;
  v_failed int := 0;
  v_resp extensions.http_response;
  v_body jsonb;
  v_subjects jsonb;
  v_shelves jsonb;
  v_label text;
  v_term_id text;
  v_mapped text[];
  v_unmapped_labels text[];
  v_url text;
  v_work public.works%rowtype;
  i int;
  j int;
begin
  with ranked_editions as (
    select e.work_id, e.external_id,
      row_number() over (partition by e.work_id order by case when e.is_original then 0 else 1 end, e.external_id) as rn
    from public.editions e where e.source_id = 'gutenberg'
  ), eligible as (
    select re.work_id, re.external_id, coalesce(ces.priority_bucket,5) as priority_bucket
    from ranked_editions re
    join public.works w on w.id = re.work_id
    left join public.catalog_enrichment_status ces on ces.work_id = re.work_id
    where re.rn = 1 and coalesce(cardinality(w.genre_ids),0) = 0
      and not exists (select 1 from public.catalog_source_enrichment_attempts a where a.work_id = re.work_id and a.field_name='genre_ids' and a.source=v_source and a.status in ('succeeded','no_value','unmapped'))
      and not exists (select 1 from public.catalog_source_enrichment_attempts a where a.work_id = re.work_id and a.field_name='genre_ids' and a.source=v_source and a.status='failed' and (a.attempt_count >= 3 or coalesce(a.next_retry_at,now()) > now()))
    order by priority_bucket, re.work_id limit greatest(1, least(coalesce(p_limit,15),30))
  )
  select array_agg(work_id order by priority_bucket, work_id), array_agg(external_id order by priority_bucket, work_id)
    into v_work_ids, v_external_ids from eligible;
  v_count := coalesce(array_length(v_work_ids,1),0);
  if v_count = 0 then return query select 0,0,0,0,0; return; end if;

  for i in 1..v_count loop
    select * into v_work from public.works where id = v_work_ids[i];
    v_url := 'https://gutendex.com/books/' || v_external_ids[i];
    v_resp := public._author_enrich_http_get_retry(v_url);
    if v_resp.status < 200 or v_resp.status >= 300 then
      v_failed := v_failed + 1;
      if not p_dry_run then
        insert into public.catalog_source_enrichment_attempts(work_id,field_name,source,source_ref,status,attempt_count,last_error,last_attempt_at,next_retry_at)
        values (v_work_ids[i],'genre_ids',v_source,v_external_ids[i],'failed',1,'HTTP '||v_resp.status::text,now(),now()+interval '6 hours')
        on conflict (work_id,field_name,source) do update set source_ref=excluded.source_ref,status='failed',attempt_count=public.catalog_source_enrichment_attempts.attempt_count+1,last_error=excluded.last_error,last_attempt_at=now(),next_retry_at=now()+interval '6 hours';
      end if;
      continue;
    end if;
    begin v_body := v_resp.content::jsonb;
    exception when others then
      v_failed := v_failed + 1;
      if not p_dry_run then
        insert into public.catalog_source_enrichment_attempts(work_id,field_name,source,source_ref,status,attempt_count,last_error,last_attempt_at,next_retry_at)
        values (v_work_ids[i],'genre_ids',v_source,v_external_ids[i],'failed',1,'Invalid Gutendex JSON response',now(),now()+interval '6 hours')
        on conflict (work_id,field_name,source) do update set source_ref=excluded.source_ref,status='failed',attempt_count=public.catalog_source_enrichment_attempts.attempt_count+1,last_error=excluded.last_error,last_attempt_at=now(),next_retry_at=now()+interval '6 hours';
      end if;
      continue;
    end;
    v_subjects := coalesce(v_body->'subjects','[]'::jsonb);
    v_shelves := coalesce(v_body->'bookshelves','[]'::jsonb);
    v_mapped := array[]::text[];
    v_unmapped_labels := array[]::text[];
    for j in 0..jsonb_array_length(v_subjects)-1 loop
      v_label := v_subjects->>j; v_term_id := public._gutendex_match_genre_label(v_label);
      if v_term_id is null then v_unmapped_labels := array_append(v_unmapped_labels,'subject:'||v_label);
      elsif not (v_term_id = any(v_mapped)) and cardinality(v_mapped) < 4 then v_mapped := array_append(v_mapped,v_term_id); end if;
    end loop;
    for j in 0..jsonb_array_length(v_shelves)-1 loop
      v_label := v_shelves->>j; v_term_id := public._gutendex_match_genre_label(v_label);
      if v_term_id is null then v_unmapped_labels := array_append(v_unmapped_labels,'shelf:'||v_label);
      elsif not (v_term_id = any(v_mapped)) and cardinality(v_mapped) < 4 then v_mapped := array_append(v_mapped,v_term_id); end if;
    end loop;
    if jsonb_array_length(v_subjects)=0 and jsonb_array_length(v_shelves)=0 then
      v_no_value := v_no_value+1;
      if not p_dry_run then
        insert into public.catalog_source_enrichment_attempts(work_id,field_name,source,source_ref,status,attempt_count,last_error,last_attempt_at,next_retry_at)
        values(v_work_ids[i],'genre_ids',v_source,v_external_ids[i],'no_value',1,null,now(),null)
        on conflict(work_id,field_name,source) do update set source_ref=excluded.source_ref,status='no_value',attempt_count=public.catalog_source_enrichment_attempts.attempt_count+1,last_error=null,last_attempt_at=now(),next_retry_at=null;
      end if;
    elsif cardinality(v_mapped)=0 then
      v_unmapped := v_unmapped+1;
      if not p_dry_run then
        insert into public.catalog_source_enrichment_attempts(work_id,field_name,source,source_ref,status,attempt_count,last_error,last_attempt_at,next_retry_at)
        values(v_work_ids[i],'genre_ids',v_source,v_external_ids[i],'unmapped',1,'Unmapped: '||array_to_string(v_unmapped_labels[1:8],' | '),now(),null)
        on conflict(work_id,field_name,source) do update set source_ref=excluded.source_ref,status='unmapped',attempt_count=public.catalog_source_enrichment_attempts.attempt_count+1,last_error=excluded.last_error,last_attempt_at=now(),next_retry_at=null;
      end if;
    else
      v_succeeded := v_succeeded+1;
      if not p_dry_run then
        update public.works set genre_ids=v_mapped where id=v_work_ids[i] and coalesce(cardinality(genre_ids),0)=0;
        insert into public.enrichment_provenance(entity_type,entity_id,field_name,value,source,source_ref,confidence,basis,fetched_at)
        values('work',v_work_ids[i],'genre_ids',to_jsonb(v_mapped)::text,'gutendex',v_external_ids[i],'medium','Gutendex subjects/bookshelves for Gutenberg #'||v_external_ids[i]||' matched only to canonical AN.KI genre taxonomy',now())
        on conflict(entity_type,entity_id,field_name,source) do update set value=excluded.value,source_ref=excluded.source_ref,confidence=excluded.confidence,basis=excluded.basis,fetched_at=excluded.fetched_at;
        insert into public.catalog_source_enrichment_attempts(work_id,field_name,source,source_ref,status,attempt_count,last_error,last_attempt_at,next_retry_at)
        values(v_work_ids[i],'genre_ids',v_source,v_external_ids[i],'succeeded',1,null,now(),null)
        on conflict(work_id,field_name,source) do update set source_ref=excluded.source_ref,status='succeeded',attempt_count=public.catalog_source_enrichment_attempts.attempt_count+1,last_error=null,last_attempt_at=now(),next_retry_at=null;
      end if;
    end if;
  end loop;
  return query select v_count,v_succeeded,v_no_value,v_unmapped,v_failed;
end;
$$;
revoke all on function public.enrich_gutenberg_genre(int, boolean) from public, anon, authenticated;
grant execute on function public.enrich_gutenberg_genre(int, boolean) to service_role;
