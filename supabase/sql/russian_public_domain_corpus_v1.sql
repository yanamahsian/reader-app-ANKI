-- RUSSIAN PUBLIC-DOMAIN CORPUS v1
-- Prioritizes a first large Russian-language author wave whose author term
-- has expired in Germany under life+70 as of 2026. Translation rights remain
-- edition-specific and continue through the translator-rights pipeline.

with seed(id,name,birth_year,death_year,search_names) as (values
('pushkin','Александр Пушкин',1799,1837,array['Alexander Pushkin','Aleksandr Pushkin','Александр Пушкин']::text[]),
('dostoevsky','Фёдор Достоевский',1821,1881,array['Fyodor Dostoevsky','Fyodor Dostoyevsky','Fedor Dostoevsky','Фёдор Достоевский']::text[]),
('tolstoy','Лев Толстой',1828,1910,array['Leo Tolstoy','Lev Tolstoy','Лев Толстой']::text[]),
('gogol','Николай Гоголь',1809,1852,array['Nikolai Gogol','Nikolay Gogol','Николай Гоголь']::text[]),
('turgenev','Иван Тургенев',1818,1883,array['Ivan Turgenev','Ivan Sergeyevich Turgenev','Иван Тургенев']::text[]),
('chekhov','Антон Чехов',1860,1904,array['Anton Chekhov','Anton Pavlovich Chekhov','Антон Чехов']::text[]),
('lermontov','Михаил Лермонтов',1814,1841,array['Mikhail Lermontov','Mikhail Yuryevich Lermontov','Михаил Лермонтов']::text[]),
('mc-fb6a8f751c3008fc22a6','Николай Лесков',1831,1895,array['Nikolai Leskov','Nikolay Leskov','Николай Лесков']::text[]),
('mc-8154294b32e87410177a','Иван Гончаров',1812,1891,array['Ivan Goncharov','Ivan Aleksandrovich Goncharov','Иван Гончаров']::text[]),
('mc-cf4c4a6b1a79e84a9595','Иван Бунин',1870,1953,array['Ivan Bunin','Ivan Alekseyevich Bunin','Иван Бунин']::text[]),
('tsvetaeva','Марина Цветаева',1892,1941,array['Marina Tsvetaeva','Marina Cvetaeva','Марина Цветаева']::text[]),
('mc-00ca7c97918a89a129bc','Осип Мандельштам',1891,1938,array['Osip Mandelstam','Osip Mandelshtam','Осип Мандельштам']::text[]),
('mc-41defd85fae9dd724d76','Максим Горький',1868,1936,array['Maxim Gorky','Maksim Gorky','Максим Горький']::text[]),
('mc-9f415fa66f827c12cc13','Александр Куприн',1870,1938,array['Alexander Kuprin','Aleksandr Kuprin','Александр Куприн']::text[]),
('mc-8dcbc3ba7404153936a8','Александр Блок',1880,1921,array['Alexander Blok','Aleksandr Blok','Александр Блок']::text[]),
('mc-b67448e0905c197e1b98','Андрей Белый',1880,1934,array['Andrei Bely','Andrey Bely','Андрей Белый']::text[]),
('mc-652f1a73a0a95e23604e','Михаил Салтыков-Щедрин',1826,1889,array['Mikhail Saltykov-Shchedrin','Mikhail Saltykov Shchedrin','Михаил Салтыков-Щедрин']::text[]),
('nekrasov','Николай Некрасов',1821,1878,array['Nikolai Nekrasov','Nikolay Nekrasov','Николай Некрасов']::text[]),
('tyutchev','Фёдор Тютчев',1803,1873,array['Fyodor Tyutchev','Fedor Tyutchev','Фёдор Тютчев']::text[]),
('mc-3fbe9010f429dfc77fc3','Александр Герцен',1812,1870,array['Alexander Herzen','Aleksandr Herzen','Александр Герцен']::text[]),
('mc-ed4cc3512e8259f7353d','Николай Чернышевский',1828,1889,array['Nikolai Chernyshevsky','Nikolay Chernyshevsky','Николай Чернышевский']::text[]),
('mc-2a050600f19cba64a6ed','Леонид Андреев',1871,1919,array['Leonid Andreyev','Leonid Andreev','Леонид Андреев']::text[]),
('garshin','Всеволод Гаршин',1855,1888,array['Vsevolod Garshin','Всеволод Гаршин']::text[]),
('griboyedov','Александр Грибоедов',1795,1829,array['Alexander Griboyedov','Aleksandr Griboyedov','Александр Грибоедов']::text[]),
('zhukovsky','Василий Жуковский',1783,1852,array['Vasily Zhukovsky','Vasili Zhukovsky','Василий Жуковский']::text[]),
('peter-kropotkin','Пётр Кропоткин',1842,1921,array['Peter Kropotkin','Pyotr Kropotkin','Пётр Кропоткин']::text[]),
('mikhail-bulgakov','Михаил Булгаков',1891,1940,array['Mikhail Bulgakov','Mikhail Afanasyevich Bulgakov','Михаил Булгаков']::text[]),
('andrei-platonov','Андрей Платонов',1899,1951,array['Andrei Platonov','Andrey Platonov','Андрей Платонов']::text[]),
('vladimir-mayakovsky','Владимир Маяковский',1893,1930,array['Vladimir Mayakovsky','Vladimir Maiakovski','Владимир Маяковский']::text[]),
('yevgeny-zamyatin','Евгений Замятин',1884,1937,array['Yevgeny Zamyatin','Evgeny Zamyatin','Евгений Замятин']::text[]),
('alexander-ostrovsky','Александр Островский',1823,1886,array['Alexander Ostrovsky','Aleksandr Ostrovsky','Александр Островский']::text[]),
('fyodor-sologub','Фёдор Сологуб',1863,1927,array['Fyodor Sologub','Fedor Sologub','Фёдор Сологуб']::text[]),
('nikolai-gumilev','Николай Гумилёв',1886,1921,array['Nikolai Gumilev','Nikolay Gumilev','Николай Гумилёв']::text[]),
('dmitry-merezhkovsky','Дмитрий Мережковский',1865,1941,array['Dmitry Merezhkovsky','Dmitri Merezhkovsky','Дмитрий Мережковский']::text[]),
('zinaida-gippius','Зинаида Гиппиус',1869,1945,array['Zinaida Gippius','Zinaida Hippius','Зинаида Гиппиус']::text[]),
('alexander-green','Александр Грин',1880,1932,array['Alexander Grin','Alexander Green','Aleksandr Grin','Александр Грин']::text[]),
('mikhail-prishvin','Михаил Пришвин',1873,1954,array['Mikhail Prishvin','Mikhail Prishwin','Михаил Пришвин']::text[]),
('isaac-babel','Исаак Бабель',1894,1940,array['Isaac Babel','Isaak Babel','Исаак Бабель']::text[]),
('boris-pilnyak','Борис Пильняк',1894,1938,array['Boris Pilnyak','Boris Pilniak','Борис Пильняк']::text[]),
('alexander-belyaev','Александр Беляев',1884,1942,array['Alexander Belyaev','Aleksandr Belyaev','Александр Беляев']::text[])
), upsert_authors as (
  insert into public.authors(id,name,birth_year,death_year)
  select id,name,birth_year,death_year from seed
  on conflict(id) do update set name=excluded.name,
    birth_year=coalesce(public.authors.birth_year,excluded.birth_year),
    death_year=coalesce(public.authors.death_year,excluded.death_year)
  returning id
), upsert_master as (
  insert into public.master_corpus_authors(display_name,search_names,sections,corpus_scope,original_language,priority,canonical_author_id,status,notes)
  select name,search_names,array['literature'],'maximal','ru',-100,id,'ready-for-discovery',
    'Russian literature public-domain expansion v1; author death year <= 1955, original-language corpus prioritized. Translation rights remain edition-specific.'
  from seed
  on conflict(display_name) do update set search_names=excluded.search_names,sections=excluded.sections,
    corpus_scope='maximal',original_language='ru',priority=-100,canonical_author_id=excluded.canonical_author_id,
    status='ready-for-discovery',notes=excluded.notes,updated_at=now()
  returning canonical_author_id
)
insert into public.multilingual_catalog_backfill_queue(author_id,state,priority,updated_at)
select id,'pending',-100,now() from seed
on conflict(author_id) do update set state='pending',priority=-100,last_error=null,completed_at=null,updated_at=now();
