-- Expand only high-confidence Wikidata wording aliases observed in the live
-- Wikisource corpus, then reopen previously-unmapped taxonomy attempts once so
-- the improved dictionary can be applied. Unknown/ambiguous labels stay unmapped.

insert into public.catalog_taxonomy_source_aliases(source,category,source_label_normalized,term_id,note)
values
  ('wikidata','genre','short novel','novella','Observed Wikidata label; direct literary-form equivalent'),
  ('wikidata','genre','travel literature','travel-writing','Observed Wikidata wording variant'),
  ('wikidata','genre','travel book','travel-writing','Observed Wikidata wording variant'),
  ('wikidata','genre','religious literature','religious-work','Observed Wikidata wording variant'),
  ('wikidata','genre','biblical commentary','religious-work','Observed Wikidata work-type wording'),
  ('wikidata','genre','psychological novel','psychological-fiction','Observed Wikidata wording variant'),
  ('wikidata','genre','diary','diary-journal','Observed Wikidata wording variant'),
  ('wikidata','genre','horror literature','horror','Observed Wikidata wording variant'),
  ('wikidata','genre','romantic fiction','romance-fiction','Observed Wikidata wording variant'),
  ('wikidata','genre','lyric poetry','poetry','Observed Wikidata poetry subtype'),
  ('wikidata','genre','satirical fiction','satire','Observed Wikidata wording variant'),
  ('wikidata','genre','philosophy','philosophical-work','Observed Wikidata P136 label; AN.KI canonical work type'),
  ('wikidata','movement','literary realism','realism','Observed Wikidata movement wording variant')
on conflict (source,category,source_label_normalized) do update set
  term_id=excluded.term_id,
  note=excluded.note;

delete from public.catalog_source_enrichment_attempts
where source='wikidata-wikisource-qid-taxonomy'
  and status='unmapped'
  and field_name in ('genre_ids','movement_id');
