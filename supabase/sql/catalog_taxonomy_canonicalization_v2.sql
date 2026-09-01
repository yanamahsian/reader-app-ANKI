-- CATALOG TAXONOMY CANONICALIZATION v2
--
-- Keeps legacy classifier outputs readable while ensuring future writes use
-- canonical taxonomy ids. Also backfills century_id deterministically from an
-- already-confirmed publication_year where the matching century taxonomy term
-- exists.

create or replace function public._canonicalize_catalog_genre_ids(p_ids text[])
returns text[]
language sql
immutable
as $$
  with mapped as (
    select
      case x
        when 'philosophy' then 'philosophical-fiction'
        when 'epic-poem' then 'epic-poetry'
        when 'poem' then 'poetry'
        else x
      end as id,
      ord
    from unnest(coalesce(p_ids, array[]::text[])) with ordinality as u(x, ord)
    where nullif(btrim(x), '') is not null
  ), dedup as (
    select id, min(ord) as first_ord
    from mapped
    group by id
  )
  select coalesce(array_agg(id order by first_ord), array[]::text[])
  from dedup;
$$;

create or replace function public._canonicalize_catalog_genres_trigger()
returns trigger
language plpgsql
as $$
begin
  new.genre_ids := public._canonicalize_catalog_genre_ids(new.genre_ids);
  return new;
end;
$$;

drop trigger if exists trg_canonicalize_catalog_genres on public.works;
create trigger trg_canonicalize_catalog_genres
before insert or update of genre_ids on public.works
for each row execute function public._canonicalize_catalog_genres_trigger();

update public.works
set genre_ids = public._canonicalize_catalog_genre_ids(genre_ids)
where genre_ids && array['philosophy','epic-poem','poem']::text[];

update public.enrichment_provenance
set
  value = replace(replace(replace(value, '"epic-poem"', '"epic-poetry"'), '"philosophy"', '"philosophical-fiction"'), '"poem"', '"poetry"'),
  basis = replace(replace(replace(basis, '-> epic-poem', '-> epic-poetry'), '-> philosophy', '-> philosophical-fiction'), '-> poem', '-> poetry')
where entity_type = 'work'
  and field_name = 'genre_ids'
  and (
    value like '%"epic-poem"%' or value like '%"philosophy"%' or value like '%"poem"%'
    or basis like '%-> epic-poem%' or basis like '%-> philosophy%' or basis like '%-> poem%'
  );

update public.works w
set century_id = case
  when w.publication_year < 0 then concat(ceil(abs(w.publication_year)::numeric / 100)::int, '-bc')
  else ceil(w.publication_year::numeric / 100)::int::text
end
where w.publication_year is not null
  and w.century_id is null
  and exists (
    select 1
    from public.taxonomy_terms t
    where t.category = 'century'
      and t.id = case
        when w.publication_year < 0 then concat(ceil(abs(w.publication_year)::numeric / 100)::int, '-bc')
        else ceil(w.publication_year::numeric / 100)::int::text
      end
  );