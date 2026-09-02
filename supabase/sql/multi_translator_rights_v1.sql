-- MULTI-TRANSLATOR RIGHTS v1
-- Extends the existing translator_enrichment/backfill path to editions
-- whose translator_name contains multiple semicolon-separated translators.
-- Every translator must be independently resolved and past DE life+70 before
-- the edition receives public-domain/DE.

create table if not exists public.edition_translators (
  edition_id text not null references public.editions(id) on delete cascade,
  position integer not null,
  translator_author_id text not null references public.authors(id),
  translator_name text not null,
  created_at timestamptz not null default now(),
  primary key (edition_id, position),
  unique (edition_id, translator_author_id)
);

alter table public.edition_translators enable row level security;
revoke all on public.edition_translators from anon, authenticated;
grant select, insert, update, delete on public.edition_translators to service_role;
create index if not exists edition_translators_author_idx on public.edition_translators(translator_author_id);

create or replace function public.multi_translator_rights_tick(
  p_edition_limit int default 8,
  p_death_year_limit int default 8
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  e record; raw_name text; clean_name text; display_name text; matched_id text;
  author_slug text; pos int; linked_count int := 0; scaffolded_count int := 0;
  enriched_count int := 0; confirmed_count int := 0; enrich_ids text[]; er record;
  current_year int := extract(year from now())::int;
begin
  for e in
    select ed.id, ed.language, ed.translator_name
    from editions ed
    where ed.ingestion_status='ready' and ed.is_original=false
      and ed.translator_name like '%;%'
      and not exists (select 1 from edition_translators et where et.edition_id=ed.id)
    order by ed.updated_at, ed.id
    limit greatest(p_edition_limit,0)
  loop
    pos := 0;
    foreach raw_name in array regexp_split_to_array(e.translator_name, '\s*;\s*') loop
      clean_name := btrim(raw_name);
      if clean_name = '' then continue; end if;
      pos := pos + 1; matched_id := null;

      select a.id into matched_id from authors a
      where public._author_enrich_names_match(clean_name,a.name)
      order by a.id limit 1;

      if matched_id is null then
        select m.canonical_author_id into matched_id from master_corpus_authors m
        where m.canonical_author_id is not null
          and public._author_enrich_names_match(clean_name,m.display_name)
        order by m.priority,m.display_name limit 1;
      end if;

      if matched_id is null then
        display_name := public._translator_enrich_display_name(clean_name);
        author_slug := public._translator_enrich_slug(display_name);
        matched_id := 'translator-' || author_slug;
        if exists(select 1 from authors a where a.id=matched_id and not public._author_enrich_names_match(clean_name,a.name)) then
          matched_id := matched_id || '-' || substr(md5(clean_name),1,8);
        end if;
        insert into authors(id,name,death_year) values(matched_id,display_name,null) on conflict(id) do nothing;
        insert into master_corpus_authors(display_name,search_names,sections,corpus_scope,original_language,priority,canonical_author_id,status,notes)
        values(display_name,array[clean_name],array['rights-check'],'rights-check',e.language,999,matched_id,'rights-review','Scaffolded by multi_translator_rights_tick for deterministic translator death-year enrichment.')
        on conflict(display_name) do nothing;
        scaffolded_count := scaffolded_count + 1;
      else
        insert into authors(id,name,death_year)
        select matched_id, public._translator_enrich_display_name(clean_name), null
        where not exists(select 1 from authors a where a.id=matched_id);
      end if;

      insert into edition_translators(edition_id,position,translator_author_id,translator_name)
      values(e.id,pos,matched_id,clean_name) on conflict do nothing;
      linked_count := linked_count + 1;
    end loop;
  end loop;

  select array_agg(x.translator_author_id) into enrich_ids
  from (
    select et.translator_author_id, count(*) n
    from edition_translators et join authors a on a.id=et.translator_author_id
    where a.death_year is null
      and (a.death_year_enrichment_attempted_at is null or a.death_year_enrichment_attempted_at < now()-interval '7 days')
    group by et.translator_author_id
    order by count(*) desc, et.translator_author_id
    limit greatest(p_death_year_limit,0)
  ) x;

  if enrich_ids is not null and array_length(enrich_ids,1)>0 then
    for er in select * from public.enrich_author_death_year_from_wikidata(enrich_ids,array_length(enrich_ids,1),false) loop
      enriched_count := enriched_count + 1;
      if er.resolved_death_year is null then
        update authors set death_year_enrichment_attempted_at=now() where id=er.author_id;
      end if;
    end loop;
  end if;

  with eligible as (
    select ed.id edition_id,a.id author_id,a.name author_name,a.death_year author_death_year,
      jsonb_agg(jsonb_build_object('translator_author_id',ta.id,'translator_name',et.translator_name,'translator_death_year',ta.death_year) order by et.position) translators
    from editions ed join works w on w.id=ed.work_id join authors a on a.id=w.author_id
    join edition_translators et on et.edition_id=ed.id join authors ta on ta.id=et.translator_author_id
    where ed.ingestion_status='ready' and ed.is_original=false
      and a.death_year is not null and current_year >= a.death_year+71
    group by ed.id,a.id,a.name,a.death_year
    having bool_and(ta.death_year is not null and current_year >= ta.death_year+71)
  ), updated as (
    update rights_assertions ra set status='public-domain', asserted_at=now(), rights_metadata=jsonb_build_object(
      'assessment','de-life-plus-70-multi-translator','basis','original-and-all-translator-death-years','author_id',el.author_id,'author_name',el.author_name,'author_death_year',el.author_death_year,'translators',el.translators,'rule','current_year >= death_year + 71 for original author and every translator','current_year_at_assessment',current_year,'computed_by','multi_translator_rights_tick')
    from eligible el where ra.edition_id=el.edition_id and ra.jurisdiction='DE' and ra.status='unknown'
    returning ra.edition_id
  ), inserted as (
    insert into rights_assertions(edition_id,status,jurisdiction,rights_metadata)
    select el.edition_id,'public-domain','DE',jsonb_build_object(
      'assessment','de-life-plus-70-multi-translator','basis','original-and-all-translator-death-years','author_id',el.author_id,'author_name',el.author_name,'author_death_year',el.author_death_year,'translators',el.translators,'rule','current_year >= death_year + 71 for original author and every translator','current_year_at_assessment',current_year,'computed_by','multi_translator_rights_tick')
    from eligible el where not exists(select 1 from rights_assertions ra where ra.edition_id=el.edition_id and ra.jurisdiction='DE')
    returning edition_id
  )
  select (select count(*) from updated)+(select count(*) from inserted) into confirmed_count;

  return jsonb_build_object('ok',true,'translator_links_written',linked_count,'translator_authors_scaffolded',scaffolded_count,'death_year_attempts',enriched_count,'rights_newly_confirmed_public_domain',confirmed_count);
end;
$$;

revoke all on function public.multi_translator_rights_tick(int,int) from public,anon,authenticated;
grant execute on function public.multi_translator_rights_tick(int,int) to service_role;

select cron.schedule('multi-translator-rights-every-10-minutes','3,13,23,33,43,53 * * * *',$$select public.multi_translator_rights_tick(8,6);$$);
