-- THE CANON v1 pilot content: exactly one Collection and one Reading Path,
-- to validate the schema against real data before any further rollout.
--
-- Every work_id below was verified live against public.works immediately
-- before writing this file (see report section 9/10 for the exact query
-- and full result set). Only works with publication_status='published'
-- were used -- i.e. works actually available to read today, not raw
-- unreviewed ingestion rows. This deliberately excludes two otherwise
-- obvious candidates that exist in the catalog but are not yet
-- published: Goncharov's "Oblomov" (ws-q842074) and Lermontov's "A Hero
-- of Our Time" (ws-q1304649) -- both real Works, both draft. Including a
-- work the Reader can't actually open yet would make the pilot path
-- untestable end-to-end, so they were left out rather than forced in for
-- coverage. Turgenev has no Work in the catalog at all (searched by
-- author name, no match) and so is correctly absent, per the brief's own
-- "if it really exists" condition.
--
-- Order is a curated reading progression, not chronological and not
-- alphabetical (publication years here run 1833, 1836, 1842, 1842, 1866,
-- 1886, 1869, 1877, 1880 -- not the path order): start with Pushkin, the
-- founding figure of the tradition; Gogol next as his direct successor
-- and the acknowledged origin of the "little man" theme that Dostoevsky
-- inherits; a short Tolstoy work as a bridge before his two long novels;
-- Dostoevsky's two major novels bracket the path, with his earlier,
-- more accessible novel before his late, hardest one.

insert into public.canon_collections (id, title, title_i18n, description, description_i18n, status, position)
values (
  'russian-literature',
  'Russian Literature',
  '{"ru": "Русская литература"}'::jsonb,
  'The literary tradition of Russia, from the poet who founded its modern language to the novels that reshaped world fiction.',
  '{"ru": "Русская литературная традиция — от поэта, заложившего основы современного языка, до романов, изменивших мировую прозу."}'::jsonb,
  'published',
  0
);

insert into public.canon_paths (id, collection_id, title, title_i18n, description, description_i18n, status, position)
values (
  'russian-novel-19th-century',
  'russian-literature',
  'The Russian Novel: 19th Century',
  '{"ru": "Русский роман: XIX век"}'::jsonb,
  'A curated route through the founding century of the Russian novel: from Pushkin''s prose origins, through Gogol''s "little man", to the two great psychological and philosophical novelists, Tolstoy and Dostoevsky.',
  '{"ru": "Маршрут через век, в который сложился русский роман: от прозы Пушкина через гоголевского «маленького человека» — к двум главным психологическим и философским романистам, Толстому и Достоевскому."}'::jsonb,
  'published',
  0
);

-- Verified real work_id values (public.works, publication_status='published').
insert into public.canon_path_works
  (path_id, work_id, position, reading_stage, is_core, prerequisite_work_id, rationale, rationale_i18n)
values
  (
    'russian-novel-19th-century', 'the-captains-daughter', 1, 'entry', null, null,
    'A short, clear historical novella and the natural gateway into 19th-century Russian prose -- Pushkin at his most accessible.',
    '{"ru": "Короткая и ясная историческая повесть — естественная точка входа в русскую прозу XIX века, Пушкин в наиболее доступной форме."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'eugene-onegin', 2, 'entry', true, null,
    'The foundational work of the Russian novel tradition itself -- what Belinsky called "an encyclopedia of Russian life". Everything after it answers it in some way.',
    '{"ru": "Основополагающее произведение самой традиции русского романа — то, что Белинский назвал «энциклопедией русской жизни». Всё последующее так или иначе отвечает этому тексту."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'the-overcoat', 3, 'entry', null, null,
    'The acknowledged origin of the "little man" theme; a short story that directly sets up Dostoevsky''s Petersburg fiction.',
    '{"ru": "Признанный источник темы «маленького человека»; короткая повесть, напрямую подготавливающая петербургскую прозу Достоевского."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'dead-souls', 4, 'intermediate', true, 'the-overcoat',
    'A longer, structurally unusual satirical "poema" -- deepens Gogol before moving on to the novelists he influenced.',
    '{"ru": "Более крупная и структурно необычная сатирическая «поэма» — углубляет Гоголя перед переходом к романистам, на которых он повлиял."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'crime-and-punishment', 5, 'intermediate', true, 'the-overcoat',
    'Dostoevsky''s most accessible major novel, and a direct thematic descendant of the Petersburg "little man" tradition set up by Gogol.',
    '{"ru": "Самый доступный из больших романов Достоевского и прямой тематический наследник петербургской традиции «маленького человека», заданной Гоголем."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'death-of-ivan-ilyich', 6, 'intermediate', null, null,
    'A short, late Tolstoy novella on death and a wasted life -- a deliberate bridge before his two long novels.',
    '{"ru": "Короткая поздняя повесть Толстого о смерти и растраченной жизни — намеренный мост перед двумя его большими романами."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'war-and-peace', 7, 'advanced', true, 'death-of-ivan-ilyich',
    'Tolstoy''s historical panorama; best approached once his voice and pacing are already familiar from the shorter work.',
    '{"ru": "Историческая панорама Толстого; лучше подходить к ней, уже освоившись с его голосом и темпом по более короткой вещи."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'anna-karenina', 8, 'advanced', true, 'war-and-peace',
    'Tolstoy''s other major novel, read here after War and Peace, once the scale of his fiction is no longer unfamiliar.',
    '{"ru": "Второй большой роман Толстого; читается здесь после «Войны и мира», когда масштаб его прозы уже не в новинку."}'::jsonb
  ),
  (
    'russian-novel-19th-century', 'brothers-karamazov', 9, 'advanced', true, 'crime-and-punishment',
    'Dostoevsky''s late, culminating novel -- the natural endpoint of the path, best read after his earlier and more accessible Crime and Punishment.',
    '{"ru": "Поздний, итоговый роман Достоевского — естественная точка завершения маршрута; лучше читать после более раннего и доступного «Преступления и наказания»."}'::jsonb
  );
