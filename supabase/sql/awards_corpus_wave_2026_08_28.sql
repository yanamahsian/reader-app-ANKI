-- Awards corpus wave, seeded to production on 2026-08-28.
-- Goal: refill the exhausted autonomous literary-corpus queue with major prize winners
-- that had zero ready content, prioritizing Nobel laureates and early Pulitzer Novel winners.
--
-- This is data seeding only. It does not bypass existing identity, ingestion, normalization,
-- translator, rights, or readiness gates. Death years are intentionally NOT hardcoded here:
-- existing enrichment is responsible for confirming them before DE rights are opened.

begin;

insert into public.authors (id,name,alternative_names) values
('sully-prudhomme','Sully Prudhomme',array['René François Armand Prudhomme','Rene Francois Armand Prudhomme']),
('frederic-mistral','Frédéric Mistral',array['Frederic Mistral']),
('jose-echegaray','José Echegaray',array['Jose Echegaray','José Echegaray y Eizaguirre','Jose Echegaray y Eizaguirre']),
('rudolf-eucken','Rudolf Eucken',array['Rudolf Christoph Eucken']),
('paul-heyse','Paul Heyse',array['Paul Johann Ludwig von Heyse']),
('verner-von-heidenstam','Verner von Heidenstam',array['Carl Gustaf Verner von Heidenstam']),
('karl-adolph-gjellerup','Karl Adolph Gjellerup',array['Karl Gjellerup']),
('henrik-pontoppidan','Henrik Pontoppidan',array[]::text[]),
('carl-spitteler','Carl Spitteler',array['Carl Friedrich Georg Spitteler']),
('jacinto-benavente','Jacinto Benavente',array['Jacinto Benavente y Martínez','Jacinto Benavente y Martinez']),
('erik-axel-karlfeldt','Erik Axel Karlfeldt',array['Erik Karlfeldt']),
('ivan-bunin','Ivan Bunin',array['Ivan Alekseyevich Bunin','Иван Бунин','Иван Алексеевич Бунин']),
('eugene-oneill','Eugene O''Neill',array['Eugene Gladstone O''Neill','Eugene O’Neill']),
('ernest-poole','Ernest Poole',array['Ernest Cook Poole']),
('booth-tarkington','Booth Tarkington',array['Newton Booth Tarkington']),
('margaret-wilson','Margaret Wilson',array[]::text[]),
('edna-ferber','Edna Ferber',array[]::text[]),
('louis-bromfield','Louis Bromfield',array['Lewis Brumfield']),
('thornton-wilder','Thornton Wilder',array['Thornton Niven Wilder']),
('julia-peterkin','Julia Peterkin',array['Julia Mood Peterkin']),
('oliver-la-farge','Oliver La Farge',array['Oliver Hazard Perry La Farge','Oliver LaFarge'])
on conflict (id) do nothing;

insert into public.master_corpus_authors
(display_name,search_names,sections,corpus_scope,original_language,priority,canonical_author_id,status,notes)
values
('Sully Prudhomme',array['Sully Prudhomme','René François Armand Prudhomme','Rene Francois Armand Prudhomme'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','fr',10,'sully-prudhomme','ready-for-discovery','Awards wave: Nobel Prize in Literature 1901.'),
('Frédéric Mistral',array['Frédéric Mistral','Frederic Mistral'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','oc',12,'frederic-mistral','ready-for-discovery','Awards wave: Nobel Prize in Literature 1904. Occitan source availability may be limited.'),
('José Echegaray',array['José Echegaray','Jose Echegaray','José Echegaray y Eizaguirre'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','es',13,'jose-echegaray','ready-for-discovery','Awards wave: Nobel Prize in Literature 1904.'),
('Rudolf Eucken',array['Rudolf Eucken','Rudolf Christoph Eucken'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','de',16,'rudolf-eucken','ready-for-discovery','Awards wave: Nobel Prize in Literature 1908.'),
('Paul Heyse',array['Paul Heyse','Paul Johann Ludwig von Heyse'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','de',17,'paul-heyse','ready-for-discovery','Awards wave: Nobel Prize in Literature 1910.'),
('Verner von Heidenstam',array['Verner von Heidenstam','Carl Gustaf Verner von Heidenstam'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','sv',19,'verner-von-heidenstam','ready-for-discovery','Awards wave: Nobel Prize in Literature 1916.'),
('Karl Adolph Gjellerup',array['Karl Adolph Gjellerup','Karl Gjellerup'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','da',20,'karl-adolph-gjellerup','ready-for-discovery','Awards wave: Nobel Prize in Literature 1917.'),
('Henrik Pontoppidan',array['Henrik Pontoppidan'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','da',21,'henrik-pontoppidan','ready-for-discovery','Awards wave: Nobel Prize in Literature 1917.'),
('Carl Spitteler',array['Carl Spitteler','Carl Friedrich Georg Spitteler'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','de',22,'carl-spitteler','ready-for-discovery','Awards wave: Nobel Prize in Literature 1919.'),
('Jacinto Benavente',array['Jacinto Benavente','Jacinto Benavente y Martínez','Jacinto Benavente y Martinez'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','es',23,'jacinto-benavente','ready-for-discovery','Awards wave: Nobel Prize in Literature 1922.'),
('Erik Axel Karlfeldt',array['Erik Axel Karlfeldt','Erik Karlfeldt'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','sv',28,'erik-axel-karlfeldt','ready-for-discovery','Awards wave: Nobel Prize in Literature 1931.'),
('Ivan Bunin',array['Ivan Bunin','Ivan Alekseyevich Bunin','Иван Бунин','Иван Алексеевич Бунин'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','ru',30,'ivan-bunin','ready-for-discovery','Awards wave: Nobel Prize in Literature 1933.'),
('Eugene O''Neill',array['Eugene O''Neill','Eugene Gladstone O''Neill','Eugene O’Neill'],array['Nobel Prize in Literature','Awards wave 2026-08-28'],'standard','en',31,'eugene-oneill','ready-for-discovery','Awards wave: Nobel Prize in Literature 1936.'),
('Ernest Poole',array['Ernest Poole','Ernest Cook Poole'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',50,'ernest-poole','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1918, His Family.'),
('Booth Tarkington',array['Booth Tarkington','Newton Booth Tarkington'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',51,'booth-tarkington','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1919 and 1922.'),
('Margaret Wilson',array['Margaret Wilson'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',54,'margaret-wilson','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1924, The Able McLaughlins.'),
('Edna Ferber',array['Edna Ferber'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',55,'edna-ferber','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1925, So Big.'),
('Louis Bromfield',array['Louis Bromfield','Lewis Brumfield'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',57,'louis-bromfield','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1927, Early Autumn.'),
('Thornton Wilder',array['Thornton Wilder','Thornton Niven Wilder'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',58,'thornton-wilder','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1928, The Bridge of San Luis Rey.'),
('Julia Peterkin',array['Julia Peterkin','Julia Mood Peterkin'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',59,'julia-peterkin','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1929, Scarlet Sister Mary.'),
('Oliver La Farge',array['Oliver La Farge','Oliver Hazard Perry La Farge','Oliver LaFarge'],array['Pulitzer Prize — Novel','Awards wave 2026-08-28'],'standard','en',60,'oliver-la-farge','ready-for-discovery','Awards wave: Pulitzer Prize for Novel 1930, Laughing Boy.')
on conflict (display_name) do nothing;

-- Retry previously blocked zero-content authors after the Wikisource/identity pipeline upgrades.
update public.master_corpus_authors
set status='ready-for-discovery', updated_at=now()
where canonical_author_id in (
  'bjrnstjerne-bjrnson','henryk-sienkiewicz','romain-rolland-music',
  'wladyslaw-reymont','john-galsworthy','edith-wharton'
)
and status='blocked'
and not exists (
  select 1 from public.master_corpus_candidates c where c.master_author_id=master_corpus_authors.id
);

-- Retry only transient 429 failures for Carducci; keep content-quality failures untouched.
update public.master_corpus_candidates c
set status='discovered', attempts=0, last_error=null, processing_started_at=null,
    next_attempt_at=null, updated_at=now()
from public.master_corpus_authors m
where c.master_author_id=m.id
  and m.canonical_author_id='giosue-carducci'
  and c.status='failed'
  and c.last_error like 'Wikisource parse 429:%';

update public.master_corpus_authors
set status='ingesting', priority=15, updated_at=now()
where canonical_author_id='giosue-carducci'
  and exists (
    select 1 from public.master_corpus_candidates c
    where c.master_author_id=master_corpus_authors.id and c.status='discovered'
  );

commit;
