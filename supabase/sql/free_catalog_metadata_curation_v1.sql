-- FREE CATALOG METADATA CURATION v1
--
-- Zero-cost editorial pass over the currently enabled Free corpus.
-- This deliberately does not touch covers. It fills only obvious missing
-- metadata on a small, curated set already in Free and records historically
-- non-applicable publication years for the Homeric epics as accepted_missing.
-- Moby-Dick's second Work is intentionally NOT edited here because production
-- currently contains two Gutenberg Work identities for the same title; that is
-- an identity-reconciliation task, not a metadata-fill task.

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Роман о самоуверенной свахе, чьи попытки устроить чужую жизнь заставляют её пересмотреть собственные чувства и суждения.'
    else description end,
  country_id = coalesce(country_id, 'english-literature')
where id = 'emma';

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Роман о воспитании, зависимости и нравственном выборе внутри английской семьи и её социальных правил.'
    else description end,
  country_id = coalesce(country_id, 'english-literature')
where id = 'mansfield-park';

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Иронический роман о воображении, взрослении и столкновении готических фантазий с повседневной реальностью.'
    else description end,
  country_id = coalesce(country_id, 'english-literature')
where id = 'northanger-abbey';

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Роман о втором шансе, несостоявшемся выборе и любви, к которой герои возвращаются спустя годы.'
    else description end,
  country_id = coalesce(country_id, 'english-literature')
where id = 'persuasion';

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Роман о двух сёстрах, чьи противоположные представления о чувствах и благоразумии испытываются любовью, деньгами и общественными условностями.'
    else description end,
  publication_year = coalesce(publication_year, 1811),
  century_id = coalesce(century_id, '19'),
  country_id = coalesce(country_id, 'english-literature')
where id = 'sense-and-sensibility';

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Сатирическая история об американской семье, поселившейся в английском замке, где даже старое привидение сталкивается с практичностью нового мира.'
    else description end,
  publication_year = coalesce(publication_year, 1887),
  century_id = coalesce(century_id, '19'),
  country_id = coalesce(country_id, 'irish-literature'),
  genre_ids = case when coalesce(cardinality(genre_ids), 0) <= 1 then array['short-story','gothic-fiction','satire']::text[] else genre_ids end,
  theme_ids = case when coalesce(cardinality(theme_ids), 0) = 0 then array['death','family']::text[] else theme_ids end
where id = 'the-canterville-ghost';

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Комедия о двойных именах, брачных расчётах и светских условностях, превращающая викторианскую серьёзность в игру.'
    else description end,
  publication_year = coalesce(publication_year, 1895),
  century_id = coalesce(century_id, '19'),
  country_id = coalesce(country_id, 'irish-literature'),
  genre_ids = case when coalesce(cardinality(genre_ids), 0) <= 1 then array['drama','comedy','satire']::text[] else genre_ids end,
  theme_ids = case when coalesce(cardinality(theme_ids), 0) = 0 then array['identity','marriage','class']::text[] else theme_ids end
where id = 'the-importance-of-being-earnest-a-trivial-comedy-for-serious';

update public.works
set
  description = case when nullif(btrim(coalesce(description, '')), '') is null
    then 'Полуавтобиографический роман о бегстве моряка на остров Нуку-Хива, столкновении с иной культурой и европейском взгляде на «цивилизацию».'
    else description end,
  country_id = coalesce(country_id, 'american-literature'),
  genre_ids = case when coalesce(cardinality(genre_ids), 0) = 0 then array['novel','adventure-fiction','travel-writing']::text[] else genre_ids end,
  theme_ids = case when coalesce(cardinality(theme_ids), 0) = 0 then array['colonialism','civilization','freedom','nature']::text[] else theme_ids end
where id = 'typee-a-romance-of-the-south-seas';

insert into public.catalog_enrichment_field_decisions(work_id, field_name, state, reason, updated_at)
values
  ('iliad', 'publication_year', 'accepted_missing', 'Ancient oral epic: a single publication year is not historically meaningful; century metadata is the appropriate representation.', now()),
  ('odyssey', 'publication_year', 'accepted_missing', 'Ancient oral epic: a single publication year is not historically meaningful; century metadata is the appropriate representation.', now()),
  ('moby-dick-or-the-whale-2', 'description', 'review', 'Duplicate Work identity exists for Moby-Dick with Gutenberg editions #15 and #2701; reconcile Work identity before enriching metadata.', now())
on conflict (work_id, field_name) do update set
  state = excluded.state,
  reason = excluded.reason,
  updated_at = excluded.updated_at;
