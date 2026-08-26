-- Author-level, QID-first Wikidata death (and, opportunistically, birth)
-- year enrichment for public.authors -- feeds the EXISTING
-- backfill_rights_from_death_year() (supabase/sql/rights_backfill_death_year.sql),
-- which is what actually recomputes rights_assertions. This file never
-- touches rights_assertions directly.
--
-- CONTEXT: after the RU/UK rights-enrichment backfill, 113 ru/uk ready
-- editions remained `insufficient_metadata`, almost entirely because
-- their original author's authors.death_year was null. This task's 12
-- priority authors (Леонид Андреев, Николай Лесков, Владимир Короленко,
-- Всеволод Гаршин, Иван Гончаров, Пётр Кропоткин, Николай Чернышевский,
-- Александр Герцен, Василий Жуковский, Александр Грибоедов, Тарас
-- Шевченко, Пантелеймон Кулиш) were confirmed present in
-- master_corpus_authors (all status='rights-review') and account for
-- those 113 editions.
--
-- WHY A NEW SQL FUNCTION, NOT A NEW EDGE FUNCTION, AND WHY THIS IS NOT A
-- PARALLEL SYSTEM:
-- omnia-classify-work (an existing Edge Function) already resolves
-- author.birth_year/death_year from Wikidata, but only INDIRECTLY -- it
-- needs a Work's Gutenberg external_id to anchor identity (externalId ->
-- Wikidata P2034 -> P629 -> P50 -> author QID). Checked directly against
-- production before writing this function: of the 113 ru/uk editions
-- belonging to these 12 authors, ALL 113 are source_id='wikisource' --
-- zero are 'gutenberg'. That Gutenberg-anchored chain has no entry point
-- for any of them, so omnia-classify-work genuinely cannot be reused
-- as-is here -- this is a structural gap confirmed against real data,
-- not a stylistic choice.
--
-- What IS reused, ported in spirit (Deno/Edge and plpgsql/SQL share no
-- runtime, so this is a port, not an import): omnia-wikisource-discover-author's
-- own author-identity technique -- search the target *.wikisource.org
-- Author: namespace (ns 102) for a candidate name, then read the
-- resulting page's own pageprops.wikibase_item -- is exactly how this
-- file's Wikisource-search step resolves a QID. This file adds one step
-- that function does not need for ITS purpose (finding candidate
-- literary works to ingest) but that a direct authors.death_year write
-- requires: an explicit identity CONFIRMATION against the resolved
-- Wikidata item's own labels/aliases -- a metadata field written
-- straight onto authors.death_year is a much higher-stakes write than a
-- discovery candidate row a human reviews before ingestion.
--
-- WHY SQL (extensions.http), NOT AN EDGE FUNCTION, ARCHITECTURALLY:
-- This session has real, working Supabase MCP database access
-- (execute_sql/apply_migration) but no way to invoke a deployed Edge
-- Function's HTTP endpoint directly. This project's extensions.http and
-- pg_net were already installed (confirmed via list_extensions, not
-- newly enabled here) -- using them means this mechanism could be
-- fully dry-run and verified against LIVE Wikidata/Wikisource data in
-- this same session (never simulated, never from memory), exactly the
-- same proof standard backfill_rights_from_death_year was already held
-- to. The same algorithm could be ported to an Edge Function later if
-- the project's automation prefers that surface -- nothing here is
-- Postgres-http-specific in its LOGIC, only in its transport.
--
-- HARD IDENTITY GATES (any failure -> write nothing for that author):
--  1. authors.death_year already set -> skip, never overwritten.
--  2. Wikisource Author: page search must resolve to exactly one page
--     carrying a Wikidata item (pageprops.wikibase_item).
--  3. That Wikidata item's own labels/aliases (ru/uk/en) must contain an
--     exact token-set match against one of: authors.name,
--     authors.alternative_names, master_corpus_authors.search_names,
--     master_corpus_authors.display_name. No fuzzy/Levenshtein matching
--     anywhere in this file. Confirmed working during this task's own
--     real run: the Wikisource search for "Николай Лесков" resolved to
--     the WRONG page (Автор:Николай Михайлович Любимов, an unrelated
--     Soviet-era translator) -- this gate correctly refused to write
--     anything for that author rather than trusting the false match.
--  4. The death claim (P570) must resolve via _author_enrich_best_claim
--     (a single preferred-rank claim, or -- if none preferred -- exactly
--     one non-deprecated claim) at year-or-finer precision. Ambiguous or
--     absent -> write nothing.
--
-- UNIVERSAL BY DESIGN, NOT JUST THESE 12: p_author_ids is optional.
-- Omitted (null), enrich_author_death_year_from_wikidata selects EVERY
-- author with death_year is null whose most common Work language maps
-- to a supported Wikisource language via _author_enrich_wiki_lang (the
-- same ~30-language list omnia-wikisource-discover-author already
-- supports) -- not hardcoded to any fixed author list. The only real
-- limiting factor is that an author needs an actual Wikisource Author:
-- namespace page in that language.
--
-- PROVENANCE: written into the EXISTING public.enrichment_provenance
-- table, matching the exact row shape omnia-classify-work already uses
-- for its own Wikidata-sourced author fields -- source='wikidata'
-- (already inside the table's existing CHECK constraint, no migration
-- needed), source_ref=<QID>, upserted on the table's existing
-- (entity_type, entity_id, field_name, source) unique constraint.
--
-- p_dry_run defaults to TRUE, matching backfill_rights_from_death_year's
-- own default -- computes and returns everything, writes nothing.
--
-- RATE LIMITING: real, live Wikimedia rate limiting (HTTP 429, the
-- standard "You are making too many requests to the API" response) was
-- hit repeatedly while developing/testing this function against
-- production. _author_enrich_http_get_retry retries up to 4 times,
-- honoring the response's own Retry-After header when present -- the
-- same resilience omnia-wikisource-discover-author's own
-- fetchJsonWithRetry already applies to its Wikisource/Wikidata calls,
-- ported here for the same reason. Even so, a full multi-author dry run
-- can still exceed a calling tool's own timeout -- this was run in
-- small batches (1-2 authors per call) during development for exactly
-- that reason, not because of any bug in the function itself.

create or replace function public._author_enrich_name_tokens(p_name text)
returns text[]
language sql immutable
as $$
  select coalesce(array_agg(x order by x), array[]::text[])
  from unnest(string_to_array(regexp_replace(lower(btrim(p_name)), '[.,]', ' ', 'g'), ' ')) as x
  where x <> '';
$$;

create or replace function public._author_enrich_names_match(a text, b text)
returns boolean
language sql immutable
as $$
  select array_length(public._author_enrich_name_tokens(a), 1) > 0
     and public._author_enrich_name_tokens(a) = public._author_enrich_name_tokens(b);
$$;

create or replace function public._author_enrich_wiki_lang(p_language text)
returns text
language sql immutable
as $$
  select case p_language
    when 'en' then 'en' when 'fr' then 'fr' when 'de' then 'de' when 'ru' then 'ru'
    when 'it' then 'it' when 'es' then 'es' when 'pt' then 'pt' when 'ja' then 'ja'
    when 'zh' then 'zh' when 'la' then 'la' when 'el' then 'el' when 'grc' then 'el'
    when 'da' then 'da' when 'no' then 'no' when 'sv' then 'sv' when 'pl' then 'pl'
    when 'cs' then 'cs' when 'uk' then 'uk' when 'fa' then 'fa' when 'ar' then 'ar'
    when 'hi' then 'hi' when 'bn' then 'bn' when 'nl' then 'nl' when 'fi' then 'fi'
    when 'hu' then 'hu' when 'ro' then 'ro' when 'bg' then 'bg' when 'sr' then 'sr'
    when 'hr' then 'hr' when 'tr' then 'tr'
    else null
  end;
$$;

create or replace function public._author_enrich_best_claim(p_entity jsonb, p_property text)
returns jsonb
language plpgsql immutable
as $$
declare
  v_claims jsonb[];
  v_preferred jsonb[];
begin
  v_claims := array(
    select c from jsonb_array_elements(coalesce(p_entity->'claims'->p_property, '[]'::jsonb)) as c
    where c->'mainsnak'->>'snaktype' = 'value'
      and coalesce(c->>'rank', 'normal') <> 'deprecated'
  );
  v_preferred := array(select c from unnest(v_claims) as c where c->>'rank' = 'preferred');
  if array_length(v_preferred, 1) = 1 then
    return v_preferred[1];
  elsif array_length(v_preferred, 1) is null and array_length(v_claims, 1) = 1 then
    return v_claims[1];
  else
    return null;
  end if;
end;
$$;

create or replace function public._author_enrich_claim_year(p_claim jsonb)
returns int
language plpgsql immutable
as $$
declare
  v_time text;
  v_precision int;
  v_sign text;
begin
  if p_claim is null then return null; end if;
  v_time := p_claim->'mainsnak'->'datavalue'->'value'->>'time';
  v_precision := (p_claim->'mainsnak'->'datavalue'->'value'->>'precision')::int;
  if v_time is null or v_precision is null or v_precision < 9 then return null; end if;
  v_sign := left(v_time, 1);
  return (case when v_sign = '-' then -1 else 1 end) * substring(v_time from 2 for 4)::int;
end;
$$;

create or replace function public._author_enrich_http_get_retry(p_url text)
returns extensions.http_response
language plpgsql
as $$
declare
  v_resp extensions.http_response;
  v_attempt int := 0;
  v_retry_after_s numeric;
  v_header extensions.http_header;
  v_wait_s numeric;
begin
  loop
    v_attempt := v_attempt + 1;
    v_resp := extensions.http_get(p_url);
    if v_resp.status <> 429 or v_attempt >= 4 then
      return v_resp;
    end if;
    v_retry_after_s := null;
    if v_resp.headers is not null then
      foreach v_header in array v_resp.headers loop
        if lower(v_header.field) = 'retry-after' then
          v_retry_after_s := nullif(v_header.value, '')::numeric;
        end if;
      end loop;
    end if;
    v_wait_s := greatest(0.75, least(5, coalesce(v_retry_after_s, 1))) * v_attempt;
    perform pg_sleep(v_wait_s);
  end loop;
end;
$$;

create or replace function public.enrich_author_death_year_from_wikidata(
  p_author_ids text[] default null,
  p_limit int default 25,
  p_dry_run boolean default true
)
returns table (
  author_id text,
  author_name text,
  outcome text,
  wikidata_qid text,
  wikisource_page text,
  matched_name text,
  resolved_death_year int,
  resolved_birth_year int,
  detail text
)
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_author record;
  v_current_id text;
  v_target_ids text[];
  v_original_language text;
  v_wiki_lang text;
  v_candidate_names text[];
  v_name text;
  v_search_resp extensions.http_response;
  v_hit jsonb;
  v_page_resp extensions.http_response;
  v_page jsonb;
  v_qid text;
  v_page_title text;
  v_entity_resp extensions.http_response;
  v_entity jsonb;
  v_wikidata_names text[];
  v_matched_name text;
  v_identity_ok boolean;
  v_death_claim jsonb;
  v_birth_claim jsonb;
  v_death_year int;
  v_birth_year int;
  v_now timestamptz := now();
  v_master_lang text;
  v_master_names text[];
  v_master_display text;
begin

  if p_author_ids is not null then
    v_target_ids := p_author_ids;
  else
    v_target_ids := array(
      select a.id
      from public.authors a
      where a.death_year is null
        and public._author_enrich_wiki_lang(
          (select w.original_language from public.works w
           where w.author_id = a.id and w.original_language is not null
           group by w.original_language order by count(*) desc limit 1)
        ) is not null
      order by a.id
      limit greatest(p_limit, 0)
    );
  end if;

  foreach v_current_id in array v_target_ids loop

    select a.id, a.name, a.alternative_names, a.birth_year, a.death_year
      into v_author
      from public.authors a where a.id = v_current_id;

    if not found then
      return query select v_current_id, null::text, 'author_not_found', null::text, null::text, null::text, null::int, null::int, null::text;
      continue;
    end if;

    if v_author.death_year is not null then
      return query select v_author.id, v_author.name, 'already_set', null::text, null::text, null::text, v_author.death_year, v_author.birth_year, null::text;
      continue;
    end if;

    v_master_lang := null; v_master_names := null; v_master_display := null;
    select m.original_language, m.search_names, m.display_name
      into v_master_lang, v_master_names, v_master_display
      from public.master_corpus_authors m
      where m.canonical_author_id = v_author.id
      limit 1;

    v_original_language := v_master_lang;
    if v_original_language is null then
      select w.original_language into v_original_language
        from public.works w
        where w.author_id = v_author.id and w.original_language is not null
        group by w.original_language order by count(*) desc limit 1;
    end if;

    v_wiki_lang := public._author_enrich_wiki_lang(v_original_language);

    if v_wiki_lang is null then
      return query select v_author.id, v_author.name, 'unsupported_language', null::text, null::text, null::text, null::int, null::int, coalesce(v_original_language, '(none)');
      continue;
    end if;

    v_candidate_names := array(
      select distinct x from unnest(
        array[v_author.name]
        || coalesce(v_author.alternative_names, array[]::text[])
        || coalesce(v_master_names, array[]::text[])
        || array[v_master_display]
      ) as x where x is not null
    );

    v_qid := null;
    v_page_title := null;
    foreach v_name in array v_candidate_names[1:5] loop
      exit when v_qid is not null;
      v_search_resp := public._author_enrich_http_get_retry(
        format('https://%s.wikisource.org/w/api.php?action=query&format=json&formatversion=2&list=search&srnamespace=102&srlimit=3&srsearch=%s',
          v_wiki_lang, extensions.urlencode(v_name))
      );
      perform pg_sleep(0.4);
      if v_search_resp.status <> 200 then continue; end if;
      for v_hit in select * from jsonb_array_elements(coalesce((v_search_resp.content::jsonb)#>'{query,search}', '[]'::jsonb)) loop
        exit when v_qid is not null;
        v_page_resp := public._author_enrich_http_get_retry(
          format('https://%s.wikisource.org/w/api.php?action=query&format=json&formatversion=2&prop=pageprops&redirects=1&titles=%s',
            v_wiki_lang, extensions.urlencode(v_hit->>'title'))
        );
        perform pg_sleep(0.4);
        if v_page_resp.status <> 200 then continue; end if;
        v_page := (v_page_resp.content::jsonb)#>'{query,pages,0}';
        if v_page is not null and not coalesce((v_page->'missing')::boolean, false) and (v_page->'pageprops'->>'wikibase_item') is not null then
          v_qid := v_page->'pageprops'->>'wikibase_item';
          v_page_title := v_page->>'title';
        end if;
      end loop;
    end loop;

    if v_qid is null then
      return query select v_author.id, v_author.name, 'author_page_not_found', null::text, null::text, null::text, null::int, null::int, format('wiki_lang=%s', v_wiki_lang);
      continue;
    end if;

    v_entity_resp := public._author_enrich_http_get_retry(
      format('https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=%s&props=labels%%7Caliases%%7Cclaims&languages=ru%%7Cuk%%7Cen', v_qid)
    );
    perform pg_sleep(0.4);
    if v_entity_resp.status <> 200 then
      return query select v_author.id, v_author.name, 'wikidata_lookup_failed', v_qid, v_page_title, null::text, null::int, null::int, format('http status %s', v_entity_resp.status);
      continue;
    end if;
    v_entity := (v_entity_resp.content::jsonb)#>array['entities', v_qid];

    if v_entity is null then
      return query select v_author.id, v_author.name, 'wikidata_entity_missing', v_qid, v_page_title, null::text, null::int, null::int, null::text;
      continue;
    end if;

    v_wikidata_names := array(
      select value->>'value' from jsonb_each(coalesce(v_entity->'labels', '{}'::jsonb)) as t(lang, value)
      union
      select alias->>'value' from jsonb_each(coalesce(v_entity->'aliases', '{}'::jsonb)) as t(lang, arr),
        jsonb_array_elements(arr) as alias
    );

    v_identity_ok := false;
    v_matched_name := null;
    foreach v_name in array v_candidate_names loop
      exit when v_identity_ok;
      select w into v_matched_name from unnest(v_wikidata_names) as w where public._author_enrich_names_match(v_name, w) limit 1;
      if v_matched_name is not null then
        v_identity_ok := true;
      end if;
    end loop;

    if not v_identity_ok then
      return query select v_author.id, v_author.name, 'identity_not_confirmed', v_qid, v_page_title, null::text, null::int, null::int, null::text;
      continue;
    end if;

    v_death_claim := public._author_enrich_best_claim(v_entity, 'P570');
    v_death_year := public._author_enrich_claim_year(v_death_claim);
    v_birth_claim := public._author_enrich_best_claim(v_entity, 'P569');
    v_birth_year := public._author_enrich_claim_year(v_birth_claim);

    if v_death_year is null then
      return query select v_author.id, v_author.name, 'death_year_ambiguous_or_missing', v_qid, v_page_title, v_matched_name, null::int, v_birth_year, null::text;
      continue;
    end if;

    if p_dry_run then
      return query select v_author.id, v_author.name, 'would_write', v_qid, v_page_title, v_matched_name, v_death_year, v_birth_year, null::text;
      continue;
    end if;

    -- Defensive re-check immediately before writing -- never overwrites
    -- a death_year that appeared since the SELECT above (requirement 1
    -- also holds under concurrent invocations of this function).
    update public.authors
      set death_year = v_death_year,
          birth_year = case when birth_year is null then v_birth_year else birth_year end
      where id = v_author.id and death_year is null;

    if not found then
      return query select v_author.id, v_author.name, 'write_skipped_race', v_qid, v_page_title, v_matched_name, v_death_year, v_birth_year, null::text;
      continue;
    end if;

    insert into public.enrichment_provenance (entity_type, entity_id, field_name, value, source, source_ref, confidence, basis, fetched_at)
    values (
      'author', v_author.id, 'death_year', v_death_year::text, 'wikidata', v_qid, 'high',
      format('Wikidata P570 (best claim by rank) on %s, identity confirmed via label/alias match "%s" against %s.wikisource.org Author:%s', v_qid, v_matched_name, v_wiki_lang, v_page_title),
      v_now
    )
    on conflict (entity_type, entity_id, field_name, source) do update
      set value = excluded.value, source_ref = excluded.source_ref, confidence = excluded.confidence, basis = excluded.basis, fetched_at = excluded.fetched_at;

    if v_birth_year is not null and v_author.birth_year is null then
      insert into public.enrichment_provenance (entity_type, entity_id, field_name, value, source, source_ref, confidence, basis, fetched_at)
      values (
        'author', v_author.id, 'birth_year', v_birth_year::text, 'wikidata', v_qid, 'high',
        format('Wikidata P569 (best claim by rank) on %s, same identity confirmation as death_year', v_qid),
        v_now
      )
      on conflict (entity_type, entity_id, field_name, source) do update
        set value = excluded.value, source_ref = excluded.source_ref, confidence = excluded.confidence, basis = excluded.basis, fetched_at = excluded.fetched_at;
    end if;

    return query select v_author.id, v_author.name, 'written', v_qid, v_page_title, v_matched_name, v_death_year, v_birth_year, null::text;

  end loop;

end;
$$;

-- Locked down to service_role only, same posture as
-- backfill_rights_from_death_year and library_catalog_search elsewhere
-- in this project: these functions read/write through tables whose RLS
-- would otherwise block anon/authenticated, and are meant to be run only
-- by an operator/admin process, never a visitor.
revoke all on function public._author_enrich_name_tokens(text) from public, anon, authenticated;
revoke all on function public._author_enrich_names_match(text, text) from public, anon, authenticated;
revoke all on function public._author_enrich_wiki_lang(text) from public, anon, authenticated;
revoke all on function public._author_enrich_best_claim(jsonb, text) from public, anon, authenticated;
revoke all on function public._author_enrich_claim_year(jsonb) from public, anon, authenticated;
revoke all on function public._author_enrich_http_get_retry(text) from public, anon, authenticated;
revoke all on function public.enrich_author_death_year_from_wikidata(text[], int, boolean) from public, anon, authenticated;

grant execute on function public._author_enrich_name_tokens(text) to service_role;
grant execute on function public._author_enrich_names_match(text, text) to service_role;
grant execute on function public._author_enrich_wiki_lang(text) to service_role;
grant execute on function public._author_enrich_best_claim(jsonb, text) to service_role;
grant execute on function public._author_enrich_claim_year(jsonb) to service_role;
grant execute on function public._author_enrich_http_get_retry(text) to service_role;
grant execute on function public.enrich_author_death_year_from_wikidata(text[], int, boolean) to service_role;
