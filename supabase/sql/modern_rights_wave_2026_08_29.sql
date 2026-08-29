-- Modern rights wave, seeded to production on 2026-08-29.
-- Goal: prioritize the most recent high-value authors that can plausibly clear
-- Germany/EU life+70 copyright rules, while keeping the existing rights pipeline authoritative.
--
-- Legal boundary used only for candidate selection:
-- Germany UrhG §64: copyright expires 70 years after the author's death;
-- §69: the period runs from the end of the calendar year.
-- Therefore, in calendar year 2026, authors who died in 1955 or earlier can be candidates
-- for public-domain treatment, subject to work/edition/translation-specific checks.
--
-- Do NOT infer rights from Project Gutenberg US status. Existing deterministic rights,
-- translator, and readiness gates remain mandatory.

begin;

-- Legacy duplicate: two empty master rows pointed at the same canonical Colette author.
-- Keep one row so discovery's canonical_author_id lookup remains deterministic.
delete from public.master_corpus_authors
where id='82011aaa-df03-4b98-af91-77971f695c22'
  and canonical_author_id='colette'
  and not exists (
    select 1 from public.master_corpus_candidates c
    where c.master_author_id='82011aaa-df03-4b98-af91-77971f695c22'
  );

insert into public.authors (id,name,alternative_names) values
('paul-claudel','Paul Claudel',array[]::text[]),
('ferenc-molnar','Ferenc Molnár',array['Ferenc Molnar','Franz Molnar']),
('george-orwell','George Orwell',array['Eric Arthur Blair'])
on conflict (id) do update
set alternative_names=(
  select array(select distinct x
  from unnest(public.authors.alternative_names || excluded.alternative_names) x)
);

insert into public.master_corpus_authors
(display_name,search_names,sections,corpus_scope,original_language,priority,canonical_author_id,status,notes)
select * from (values
('Paul Claudel',array['Paul Claudel']::text[],array['Modern rights wave 2026-08-29','Literature']::text[],'standard','fr',1,'paul-claudel','ready-for-discovery','Modern rights wave: died 1955; selected at the current DE/EU life+70 boundary. Rights still must be confirmed by the existing deterministic pipeline.'),
('Hilaire Belloc',array['Hilaire Belloc','Joseph Hilaire Pierre René Belloc','Joseph Hilaire Pierre Rene Belloc']::text[],array['Modern rights wave 2026-08-29','Literature','History']::text[],'standard','en',4,'hilaire-belloc','ready-for-discovery','Modern rights wave: died 1953; source-rich modern public-domain candidate. Existing rights pipeline remains authoritative.'),
('Ferenc Molnár',array['Ferenc Molnár','Ferenc Molnar','Franz Molnar']::text[],array['Modern rights wave 2026-08-29','Literature','Drama']::text[],'standard','hu',6,'ferenc-molnar','ready-for-discovery','Modern rights wave: died 1952; substantial current Gutenberg availability. Existing rights pipeline remains authoritative.'),
('George Orwell',array['George Orwell','Eric Arthur Blair']::text[],array['Modern rights wave 2026-08-29','Literature','Essays']::text[],'standard','en',9,'george-orwell','ready-for-discovery','Modern rights wave: died 1950. Use supported sources only; do not bypass source, work-identity, or rights gates.')
) v(display_name,search_names,sections,corpus_scope,original_language,priority,canonical_author_id,status,notes)
where not exists (
  select 1 from public.master_corpus_authors m
  where m.canonical_author_id=v.canonical_author_id
);

update public.master_corpus_authors
set status='ready-for-discovery',priority=2,original_language='de',
    notes='Modern rights wave 2026-08-29: Albert Einstein (died 1955), current DE/EU boundary candidate; reactivated because current Gutenberg now has German source material. Rights remain subject to deterministic backfill.',
    updated_at=now()
where canonical_author_id='albert-einstein';

update public.master_corpus_authors
set status='ready-for-discovery',priority=3,original_language='fr',
    search_names=array['Colette','Sidonie-Gabrielle Colette','Gabrielle Colette'],
    notes='Modern rights wave 2026-08-29: Colette (died 1954); current Gutenberg has multiple French full texts. Rights remain subject to deterministic backfill.',
    updated_at=now()
where canonical_author_id='colette';

update public.master_corpus_authors
set status='ready-for-discovery',priority=5,original_language='en',
    notes='Modern rights wave 2026-08-29: John Dewey (died 1952); re-run discovery against current Gutenberg catalogue for modern philosophy/education corpus. Rights remain subject to deterministic backfill.',
    updated_at=now()
where canonical_author_id='john-dewey';

update public.master_corpus_authors
set status='ready-for-discovery',priority=7,original_language='en',
    notes='Modern rights wave 2026-08-29: Algernon Blackwood (died 1951); reactivated because current Gutenberg contains a substantial full-text corpus. Rights remain subject to deterministic backfill.',
    updated_at=now()
where canonical_author_id='algernon-blackwood';

update public.master_corpus_authors
set status='ready-for-discovery',priority=8,original_language='de',
    search_names=array['Heinrich Mann','Luiz Heinrich Mann'],
    notes='Modern rights wave 2026-08-29: Heinrich Mann (died 1950); corrected legacy original_language hu -> de and reactivated against current Gutenberg German corpus. Rights remain subject to deterministic backfill.',
    updated_at=now()
where canonical_author_id='heinrich-mann';

commit;

-- Confirm death years through the existing deterministic enrichment mechanism.
-- A failed enrichment attempt must leave rights unresolved rather than opening access.
select public.enrich_author_death_year_from_wikidata(
  array[
    'paul-claudel','albert-einstein','colette','hilaire-belloc','john-dewey',
    'ferenc-molnar','algernon-blackwood','george-orwell','heinrich-mann'
  ],
  20,
  false
);
