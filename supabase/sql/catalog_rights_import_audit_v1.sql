-- Curated rights audit registry for editions that may be imported into AN.KI
-- for Germany/EU distribution. This is intentionally separate from the
-- provider's own US public-domain assertion.

create table if not exists public.catalog_rights_import_audit (
  source_id text not null references public.sources(id) on delete cascade,
  external_id text not null,
  jurisdiction text not null,
  rights_status text not null check (rights_status in ('public-domain','open-license','restricted','unknown')),
  author_name text,
  translator_name text,
  translator_death_year integer,
  basis text not null,
  evidence_url text,
  audited_at timestamptz not null default now(),
  primary key (source_id, external_id, jurisdiction)
);

alter table public.catalog_rights_import_audit enable row level security;
revoke all on table public.catalog_rights_import_audit from anon, authenticated;
grant select, insert, update, delete on table public.catalog_rights_import_audit to service_role;

insert into public.catalog_rights_import_audit
  (source_id, external_id, jurisdiction, rights_status, author_name, translator_name, translator_death_year, basis, evidence_url)
values
  ('gutenberg','2650','DE','public-domain','Marcel Proust',null,null,'Author died 1922; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/2650'),
  ('gutenberg','58698','DE','public-domain','Marcel Proust',null,null,'Author died 1922; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/58698'),
  ('gutenberg','64145','DE','public-domain','Marcel Proust',null,null,'Author died 1922; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/64145'),
  ('gutenberg','60720','DE','public-domain','Marcel Proust',null,null,'Author died 1922; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/60720'),
  ('gutenberg','7178','DE','public-domain','Marcel Proust','C. K. Scott Moncrieff',1930,'Translator died 1930; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/7178'),
  ('gutenberg','63532','DE','public-domain','Marcel Proust','C. K. Scott Moncrieff',1930,'Translator died 1930; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/63532'),
  ('gutenberg','73425','DE','public-domain','Marcel Proust','C. K. Scott Moncrieff',1930,'Translator died 1930; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/73425'),
  ('gutenberg','14155','DE','public-domain','Gustave Flaubert',null,null,'Author died 1880; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/14155'),
  ('gutenberg','2413','DE','public-domain','Gustave Flaubert','Eleanor Marx-Aveling',1898,'Translator died 1898; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/2413'),
  ('gutenberg','15711','DE','public-domain','Gustave Flaubert','Arthur Schurig',1929,'Translator died 1929; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/15711'),
  ('gutenberg','14157','DE','public-domain','Gustave Flaubert',null,null,'Author died 1880; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/14157'),
  ('gutenberg','14156','DE','public-domain','Gustave Flaubert',null,null,'Author died 1880; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/14156'),
  ('gutenberg','26812','DE','public-domain','Gustave Flaubert',null,null,'Author died 1880; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/26812'),
  ('gutenberg','12065','DE','public-domain','Gustave Flaubert',null,null,'Author died 1880; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/12065'),
  ('gutenberg','66285','DE','public-domain','Gustave Flaubert','Ciro Bayo',1939,'Translator died 1939; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/66285'),
  ('gutenberg','15995','DE','public-domain','Gustave Flaubert','Arthur Schurig',1929,'Translator died 1929; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/15995'),
  ('gutenberg','52225','DE','public-domain','Gustave Flaubert','Lafcadio Hearn',1904,'Translator died 1904; German/EU life+70 term expired.','https://www.gutenberg.org/ebooks/52225')
on conflict (source_id, external_id, jurisdiction) do update
set rights_status = excluded.rights_status,
    author_name = excluded.author_name,
    translator_name = excluded.translator_name,
    translator_death_year = excluded.translator_death_year,
    basis = excluded.basis,
    evidence_url = excluded.evidence_url,
    audited_at = now();
