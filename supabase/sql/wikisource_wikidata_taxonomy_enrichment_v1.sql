-- WIKISOURCE -> WIKIDATA TAXONOMY ENRICHMENT v1
-- Uses the exact workQid already stored by Wikisource ingestion.
-- No title search and no fuzzy identity matching.
-- P136 -> genre, P135 -> movement, P921 -> theme.
-- Only canonical AN.KI taxonomy terms are written. Exact English-label matches
-- are accepted, plus a deliberately small reviewed alias table for obvious
-- Wikidata wording variants. Unknown labels are recorded as 'unmapped', never guessed.

alter table public.catalog_source_enrichment_attempts
  drop constraint if exists catalog_source_enrichment_attempts_status_check;
alter table public.catalog_source_enrichment_attempts
  add constraint catalog_source_enrichment_attempts_status_check
  check (status in ('succeeded','no_value','unmapped','failed'));

create table if not exists public.catalog_taxonomy_source_aliases (
  source text not null,
  category text not null,
  source_label_normalized text not null,
  term_id text not null,
  note text,
  created_at timestamptz not null default now(),
  primary key (source, category, source_label_normalized),
  constraint catalog_taxonomy_source_aliases_category_check
    check (category in ('genre','theme','movement'))
);

alter table public.catalog_taxonomy_source_aliases enable row level security;
revoke all on public.catalog_taxonomy_source_aliases from public;
revoke all on public.catalog_taxonomy_source_aliases from anon;
revoke all on public.catalog_taxonomy_source_aliases from authenticated;
grant select, insert, update, delete on public.catalog_taxonomy_source_aliases to service_role;

insert into public.catalog_taxonomy_source_aliases(source, category, source_label_normalized, term_id, note)
values
  ('wikidata','genre','play','drama','Wikidata genre label; AN.KI canonical genre is drama'),
  ('wikidata','genre','epic poem','epic-poetry','Wikidata genre label; AN.KI canonical genre is epic-poetry'),
  ('wikidata','genre','poem','poetry','Wikidata genre label; generic poem maps to AN.KI poetry'),
  ('wikidata','genre','horror fiction','horror','Wikidata genre wording variant'),
  ('wikidata','genre','philosophical novel','philosophical-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','adventure novel','adventure-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','political novel','political-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','historical novel','historical-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','gothic novel','gothic-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','romance novel','romance-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','crime novel','crime-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','dystopian novel','dystopian-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','utopian novel','utopian-fiction','Wikidata genre wording variant'),
  ('wikidata','genre','war novel','war-fiction','Wikidata genre wording variant'),
  ('wikidata','theme','social class','class','Wikidata topic wording variant')
on conflict (source, category, source_label_normalized) do update set
  term_id = excluded.term_id,
  note = excluded.note;

create or replace function public._catalog_taxonomy_normalize_label(p_label text)
returns text
language sql
immutable
as $$
  select nullif(lower(trim(regexp_replace(coalesce(p_label,''), '\s+', ' ', 'g'))), '');
$$;

create or replace function public._catalog_taxonomy_match_label(
  p_source text,
  p_category text,
  p_label text
)
returns text
language sql
stable
set search_path = public
as $$
  with norm as (
    select public._catalog_taxonomy_normalize_label(p_label) as label_norm
  ), exact_match as (
    select t.id, 0 as precedence
    from public.taxonomy_terms t, norm n
    where t.category = p_category
      and t.is_canonical
      and public._catalog_taxonomy_normalize_label(t.label_en) = n.label_norm
    limit 1
  ), alias_match as (
    select a.term_id as id, 1 as precedence
    from public.catalog_taxonomy_source_aliases a
    join public.taxonomy_terms t
      on t.category = a.category and t.id = a.term_id and t.is_canonical
    join norm n on n.label_norm = a.source_label_normalized
    where a.source = p_source and a.category = p_category
    limit 1
  )
  select id from (
    select * from exact_match
    union all
    select * from alias_match
  ) m
  order by precedence
  limit 1;
$$;

create or replace function public._wikidata_claim_target_qids(p_entity jsonb, p_property text)
returns text[]
language sql
immutable
as $$
  with valid as (
    select
      coalesce(c->>'rank','normal') as rank,
      c->'mainsnak'->'datavalue'->'value'->>'id' as qid
    from jsonb_array_elements(coalesce(p_entity->'claims'->p_property, '[]'::jsonb)) c
    where c->'mainsnak'->>'snaktype' = 'value'
      and coalesce(c->>'rank','normal') <> 'deprecated'
      and c->'mainsnak'->'datavalue'->'value'->>'id' is not null
  ), chosen as (
    select qid from valid
    where rank = 'preferred'
       or not exists (select 1 from valid v2 where v2.rank = 'preferred')
  )
  select coalesce(array_agg(distinct qid order by qid), array[]::text[])
  from chosen;
$$;

create or replace function public.enrich_wikisource_taxonomy(
  p_limit int default 20,
  p_dry_run boolean default true
)
returns table (
  processed_works int,
  genre_succeeded int,
  theme_succeeded int,
  movement_succeeded int,
  no_value_fields int,
  unmapped_fields int,
  failed_fields int
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_work_ids text[];
  v_qids text[];
  v_count int := 0;
  v_genre_ok int := 0;
  v_theme_ok int := 0;
  v_movement_ok int := 0;
  v_no_value int := 0;
  v_unmapped int := 0;
  v_failed int := 0;
  v_resp extensions.http_response;
  v_claims_body jsonb;
  v_labels_body jsonb := '{}'::jsonb;
  v_entity jsonb;
  v_target_qids text[];
  v_all_target_qids text[] := array[]::text[];
  v_target_qid text;
  v_label text;
  v_term_id text;
  v_mapped text[];
  v_unmapped_labels text[];
  v_url text;
  v_work public.works%rowtype;
  v_attempt public.catalog_source_enrichment_attempts%rowtype;
  i int;
  v_field text;
  v_property text;
  v_category text;
  v_should_process boolean;
  v_status text;
  v_basis text;
  v_value_text text;
  v_source constant text := 'wikidata-wikisource-qid-taxonomy';
begin
  with latest as (
    select distinct on (m.work_id)
      m.work_id,
      m.provider_metadata->>'workQid' as qid,
      coalesce(ces.priority_bucket,5) as priority_bucket,
      m.updated_at
    from public.master_corpus_candidates m
    join public.works w on w.id = m.work_id
    left join public.catalog_enrichment_status ces on ces.work_id = m.work_id
    where m.source_id = 'wikisource'
      and m.status = 'ready'
      and m.work_id is not null
      and nullif(m.provider_metadata->>'workQid','') is not null
    order by m.work_id, m.updated_at desc
  ), eligible as (
    select l.*
    from latest l
    join public.works w on w.id = l.work_id
    where
      (
        coalesce(cardinality(w.genre_ids),0)=0
        and not exists (
          select 1 from public.catalog_source_enrichment_attempts a
          where a.work_id=l.work_id and a.field_name='genre_ids' and a.source=v_source
            and a.status in ('succeeded','no_value','unmapped')
        )
        and not exists (
          select 1 from public.catalog_source_enrichment_attempts a
          where a.work_id=l.work_id and a.field_name='genre_ids' and a.source=v_source
            and a.status='failed' and (a.attempt_count >= 3 or coalesce(a.next_retry_at,now()) > now())
        )
      )
      or
      (
        coalesce(cardinality(w.theme_ids),0)=0
        and not exists (
          select 1 from public.catalog_source_enrichment_attempts a
          where a.work_id=l.work_id and a.field_name='theme_ids' and a.source=v_source
            and a.status in ('succeeded','no_value','unmapped')
        )
        and not exists (
          select 1 from public.catalog_source_enrichment_attempts a
          where a.work_id=l.work_id and a.field_name='theme_ids' and a.source=v_source
            and a.status='failed' and (a.attempt_count >= 3 or coalesce(a.next_retry_at,now()) > now())
        )
      )
      or
      (
        w.movement_id is null
        and not exists (
          select 1 from public.catalog_source_enrichment_attempts a
          where a.work_id=l.work_id and a.field_name='movement_id' and a.source=v_source
            and a.status in ('succeeded','no_value','unmapped')
        )
        and not exists (
          select 1 from public.catalog_source_enrichment_attempts a
          where a.work_id=l.work_id and a.field_name='movement_id' and a.source=v_source
            and a.status='failed' and (a.attempt_count >= 3 or coalesce(a.next_retry_at,now()) > now())
        )
      )
    order by l.priority_bucket, l.work_id
    limit greatest(1, least(coalesce(p_limit,20),50))
  )
  select array_agg(work_id order by priority_bucket,work_id),
         array_agg(qid order by priority_bucket,work_id)
    into v_work_ids, v_qids
  from eligible;

  v_count := coalesce(array_length(v_work_ids,1),0);
  if v_count=0 then
    return query select 0,0,0,0,0,0,0;
    return;
  end if;

  v_url := 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=claims&ids=' || array_to_string(v_qids,'%7C');
  v_resp := public._author_enrich_http_get_retry(v_url);
  if v_resp.status < 200 or v_resp.status >= 300 then
    v_failed := v_count;
    return query select v_count,0,0,0,0,0,v_failed;
    return;
  end if;

  begin
    v_claims_body := v_resp.content::jsonb;
  exception when others then
    v_failed := v_count;
    return query select v_count,0,0,0,0,0,v_failed;
    return;
  end;

  for i in 1..v_count loop
    v_entity := v_claims_body->'entities'->v_qids[i];
    if v_entity is not null then
      foreach v_property in array array['P136','P135','P921'] loop
        v_target_qids := public._wikidata_claim_target_qids(v_entity,v_property);
        if cardinality(v_target_qids)>0 then
          foreach v_target_qid in array v_target_qids loop
            if not (v_target_qid = any(v_all_target_qids)) then
              v_all_target_qids := array_append(v_all_target_qids,v_target_qid);
            end if;
          end loop;
        end if;
      end loop;
    end if;
  end loop;

  if cardinality(v_all_target_qids)>0 then
    v_url := 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels&languages=en&ids=' || array_to_string(v_all_target_qids,'%7C');
    v_resp := public._author_enrich_http_get_retry(v_url);
    if v_resp.status < 200 or v_resp.status >= 300 then
      v_failed := v_count;
      return query select v_count,0,0,0,0,0,v_failed;
      return;
    end if;
    begin
      v_labels_body := v_resp.content::jsonb;
    exception when others then
      v_failed := v_count;
      return query select v_count,0,0,0,0,0,v_failed;
      return;
    end;
  end if;

  for i in 1..v_count loop
    select * into v_work from public.works where id=v_work_ids[i];
    v_entity := v_claims_body->'entities'->v_qids[i];

    foreach v_field in array array['genre_ids','theme_ids','movement_id'] loop
      v_property := case v_field when 'genre_ids' then 'P136' when 'theme_ids' then 'P921' else 'P135' end;
      v_category := case v_field when 'genre_ids' then 'genre' when 'theme_ids' then 'theme' else 'movement' end;

      v_should_process := case v_field
        when 'genre_ids' then coalesce(cardinality(v_work.genre_ids),0)=0
        when 'theme_ids' then coalesce(cardinality(v_work.theme_ids),0)=0
        else v_work.movement_id is null
      end;
      if not v_should_process then continue; end if;

      select * into v_attempt
      from public.catalog_source_enrichment_attempts a
      where a.work_id=v_work_ids[i] and a.field_name=v_field and a.source=v_source;
      if found and v_attempt.status in ('succeeded','no_value','unmapped') then continue; end if;
      if found and v_attempt.status='failed' and (v_attempt.attempt_count>=3 or coalesce(v_attempt.next_retry_at,now())>now()) then continue; end if;

      v_target_qids := case when v_entity is null then array[]::text[] else public._wikidata_claim_target_qids(v_entity,v_property) end;
      v_mapped := array[]::text[];
      v_unmapped_labels := array[]::text[];

      if cardinality(v_target_qids)>0 then
        foreach v_target_qid in array v_target_qids loop
          v_label := v_labels_body->'entities'->v_target_qid->'labels'->'en'->>'value';
          if nullif(btrim(coalesce(v_label,'')),'') is null then
            v_unmapped_labels := array_append(v_unmapped_labels, v_target_qid || ':<no-en-label>');
            continue;
          end if;
          v_term_id := public._catalog_taxonomy_match_label('wikidata',v_category,v_label);
          if v_term_id is null then
            v_unmapped_labels := array_append(v_unmapped_labels, v_target_qid || ':' || v_label);
          elsif not (v_term_id = any(v_mapped)) then
            v_mapped := array_append(v_mapped,v_term_id);
          end if;
        end loop;
      end if;

      v_status := null;
      v_basis := null;
      v_value_text := null;

      if cardinality(v_target_qids)=0 then
        v_status := 'no_value';
        v_no_value := v_no_value + 1;
      elsif cardinality(v_mapped)=0 then
        v_status := 'unmapped';
        v_unmapped := v_unmapped + 1;
      elsif v_field='movement_id' and cardinality(v_mapped)<>1 then
        v_status := 'unmapped';
        v_unmapped := v_unmapped + 1;
        v_unmapped_labels := v_unmapped_labels || array['multiple-canonical-movements:' || array_to_string(v_mapped,',')];
      else
        v_status := 'succeeded';
        if v_field='genre_ids' then
          if not p_dry_run then update public.works set genre_ids=v_mapped where id=v_work_ids[i] and coalesce(cardinality(genre_ids),0)=0; end if;
          v_genre_ok := v_genre_ok + 1;
          v_value_text := to_jsonb(v_mapped)::text;
        elsif v_field='theme_ids' then
          if not p_dry_run then update public.works set theme_ids=v_mapped where id=v_work_ids[i] and coalesce(cardinality(theme_ids),0)=0; end if;
          v_theme_ok := v_theme_ok + 1;
          v_value_text := to_jsonb(v_mapped)::text;
        else
          if not p_dry_run then update public.works set movement_id=v_mapped[1] where id=v_work_ids[i] and movement_id is null; end if;
          v_movement_ok := v_movement_ok + 1;
          v_value_text := v_mapped[1];
        end if;
        v_basis := 'Exact Wikisource workQid ' || v_qids[i] || ' -> Wikidata ' || v_property || ' English label(s) mapped only to canonical AN.KI ' || v_category || ' taxonomy: ' || array_to_string(v_mapped,', ');

        if not p_dry_run then
          insert into public.enrichment_provenance(entity_type,entity_id,field_name,value,source,source_ref,confidence,basis,fetched_at)
          values ('work',v_work_ids[i],v_field,v_value_text,'wikidata',v_qids[i],'high',v_basis,now())
          on conflict (entity_type,entity_id,field_name,source) do update set
            value=excluded.value, source_ref=excluded.source_ref, confidence=excluded.confidence,
            basis=excluded.basis, fetched_at=excluded.fetched_at;
        end if;
      end if;

      if not p_dry_run then
        insert into public.catalog_source_enrichment_attempts(
          work_id,field_name,source,source_ref,status,attempt_count,last_error,last_attempt_at,next_retry_at
        ) values (
          v_work_ids[i],v_field,v_source,v_qids[i],v_status,1,
          case when v_status='unmapped' then 'Unmapped Wikidata target labels: ' || array_to_string(v_unmapped_labels,' | ') else null end,
          now(),null
        )
        on conflict (work_id,field_name,source) do update set
          source_ref=excluded.source_ref,
          status=excluded.status,
          attempt_count=public.catalog_source_enrichment_attempts.attempt_count+1,
          last_error=excluded.last_error,
          last_attempt_at=now(),
          next_retry_at=null;
      end if;
    end loop;
  end loop;

  return query select v_count,v_genre_ok,v_theme_ok,v_movement_ok,v_no_value,v_unmapped,v_failed;
end;
$$;

revoke all on function public.enrich_wikisource_taxonomy(int,boolean) from public;
revoke all on function public.enrich_wikisource_taxonomy(int,boolean) from anon;
revoke all on function public.enrich_wikisource_taxonomy(int,boolean) from authenticated;
grant execute on function public.enrich_wikisource_taxonomy(int,boolean) to service_role;
