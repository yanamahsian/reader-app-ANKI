-- Idempotent RU/UK German-rights backfill based on original author's death year.
-- Dry-run by default; translations are never auto-confirmed without translator death-year evidence.

create or replace function public.backfill_rights_from_death_year(
  p_dry_run boolean default true
)
returns table (
  edition_id text,
  work_id text,
  work_title text,
  author_id text,
  author_name text,
  language text,
  is_original boolean,
  translator_name text,
  author_death_year int,
  outcome text,
  reason text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current_year int := extract(year from now())::int;
begin
  return query
  with candidates as (
    select
      e.id as c_edition_id,
      e.work_id as c_work_id,
      w.title as c_work_title,
      a.id as c_author_id,
      a.name as c_author_name,
      e.language as c_language,
      e.is_original as c_is_original,
      e.translator_name as c_translator_name,
      a.death_year as c_author_death_year,
      exists (
        select 1 from rights_assertions ra
        where ra.edition_id = e.id
          and ra.status = 'public-domain'
          and ra.jurisdiction = 'DE'
      ) as c_already_confirmed
    from editions e
    join works w on w.id = e.work_id
    join authors a on a.id = w.author_id
    where e.language in ('ru', 'uk')
      and e.ingestion_status = 'ready'
  )
  select
    c.c_edition_id,
    c.c_work_id,
    c.c_work_title,
    c.c_author_id,
    c.c_author_name,
    c.c_language,
    c.c_is_original,
    c.c_translator_name,
    c.c_author_death_year,
    case
      when c.c_already_confirmed then 'already_confirmed'
      when c.c_is_original is null then 'needs_review'
      when c.c_is_original = true and c.c_translator_name is not null then 'conflict'
      when c.c_is_original = true and c.c_author_death_year is null then 'insufficient_metadata'
      when c.c_is_original = true and v_current_year >= c.c_author_death_year + 71 then 'confirmed_public_domain'
      when c.c_is_original = true then 'needs_review'
      when c.c_is_original = false and c.c_translator_name is null then 'insufficient_metadata'
      else 'insufficient_metadata'
    end as outcome,
    case
      when c.c_already_confirmed
        then 'A public-domain/DE assertion already exists for this edition -- idempotent no-op.'
      when c.c_is_original is null
        then 'editions.is_original is not set -- cannot tell original from translation without guessing.'
      when c.c_is_original = true and c.c_translator_name is not null
        then 'Marked is_original=true but also carries a translator_name -- contradictory edition metadata.'
      when c.c_is_original = true and c.c_author_death_year is null
        then 'Original edition, but authors.death_year is not on record.'
      when c.c_is_original = true and v_current_year >= c.c_author_death_year + 71
        then c.c_author_name || ' died ' || c.c_author_death_year || ' -- public domain in Germany since Jan 1, ' || (c.c_author_death_year + 71) || '.'
      when c.c_is_original = true
        then c.c_author_name || ' died ' || c.c_author_death_year || ' -- still under German copyright until Dec 31, ' || (c.c_author_death_year + 70) || '.'
      when c.c_is_original = false and c.c_translator_name is null
        then 'Translation edition with no recorded translator_name -- cannot assess.'
      else 'Translation edition has no server-side translator death-year evidence -- cannot auto-confirm.'
    end as reason
  from candidates c
  order by c.c_language, c.c_author_name, c.c_edition_id;

  if not p_dry_run then
    insert into rights_assertions (edition_id, status, jurisdiction, rights_metadata)
    select
      e.id,
      'public-domain',
      'DE',
      jsonb_build_object(
        'assessment', 'de-life-plus-70',
        'basis', 'original-author-death-year',
        'author_id', a.id,
        'author_name', a.name,
        'author_death_year', a.death_year,
        'rule', 'current_year >= death_year + 71',
        'current_year_at_assessment', v_current_year,
        'computed_by', 'backfill_rights_from_death_year'
      )
    from editions e
    join works w on w.id = e.work_id
    join authors a on a.id = w.author_id
    where e.language in ('ru', 'uk')
      and e.ingestion_status = 'ready'
      and e.is_original = true
      and e.translator_name is null
      and a.death_year is not null
      and v_current_year >= a.death_year + 71
      and not exists (
        select 1 from rights_assertions ra
        where ra.edition_id = e.id
          and ra.status = 'public-domain'
          and ra.jurisdiction = 'DE'
      );
  end if;
end;
$$;

revoke all on function public.backfill_rights_from_death_year(boolean) from public;
revoke all on function public.backfill_rights_from_death_year(boolean) from anon;
revoke all on function public.backfill_rights_from_death_year(boolean) from authenticated;
grant execute on function public.backfill_rights_from_death_year(boolean) to service_role;
