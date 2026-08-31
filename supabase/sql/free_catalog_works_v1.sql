-- FREE / LIBRARY CATALOG BOUNDARY v1 -- free_catalog_works
--
-- Server-owned source of truth for "which works are in the Free tier".
-- Free = the existing curated seed (src/catalog/books.ts +
-- src/catalog/batch50.ts, ~76 works), NOT the full catalog_ready corpus
-- (4173 works as of 2026-08-31). Library/Atlas/Academy plans get the
-- full catalog_ready corpus in the caller's jurisdiction; guests and
-- Free-plan users get only the works enabled in this table. See
-- omnia-book-content (the actual security boundary) and
-- omnia-library-catalog (the discovery/UX boundary) for how this is
-- consumed -- this table itself grants nothing on its own.
--
-- Deliberately NOT hardcoded into any Edge Function: this table is the
-- single place Free-tier catalog membership is edited (by a future
-- admin tool or a reviewed migration), never a literal id list baked
-- into deployed function source.
--
-- POPULATION POLICY -- READ BEFORE EDITING:
-- Every row inserted below comes from FREE_CORPUS_MAPPING_REPORT.md's
-- "exact" classification ONLY (35 of the 76 current seed works). That
-- report checked each seed item against live production by a strong,
-- non-guessable identifier -- either exact (id, title, author, language)
-- agreement for src/catalog/books.ts (which round-trips through
-- omnia-catalog's merge-by-id and so shares its own id with the live
-- works.id), or an exact Project Gutenberg book-number match
-- (editions.source_id='gutenberg' AND editions.external_id=<id>) for
-- src/catalog/batch50.ts, which uses a different id scheme than its own
-- live work_id. The report's "probable" (3: title+author match but via
-- a different, unverified edition/source than the seed vouches for) and
-- "missing" (38: no matching work exists in production yet, checked both
-- by external id and by exact title) items are intentionally NOT here.
-- Do not add a work_id to this table that isn't backed by that report
-- (or a successor report reviewed the same way) -- approximate/guessed
-- ids are explicitly forbidden by this task's own instructions.
create table if not exists public.free_catalog_works (
  work_id text primary key references public.works(id),
  enabled boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now()
);

create index if not exists free_catalog_works_enabled_sort_idx
  on public.free_catalog_works(sort_order)
  where enabled;

comment on table public.free_catalog_works is
  'Server-owned Free-tier catalog membership. A work_id row here (enabled=true) is readable by guests and Free-plan users via omnia-book-content, independent of and in addition to that endpoint''s existing rights/jurisdiction checks. Library/Atlas/Academy plans bypass this table entirely (full catalog_ready corpus). Populated ONLY from FREE_CORPUS_MAPPING_REPORT.md''s exact-match rows -- see that report before editing.';

alter table public.free_catalog_works enable row level security;
revoke all privileges on table public.free_catalog_works from anon, authenticated;

insert into public.free_catalog_works (work_id, enabled, sort_order) values
  ('war-and-peace', true, 1),
  ('anna-karenina', true, 2),
  ('death-of-ivan-ilyich', true, 3),
  ('crime-and-punishment', true, 4),
  ('brothers-karamazov', true, 5),
  ('faust', true, 6),
  ('sorrows-of-young-werther', true, 7),
  ('hamlet', true, 8),
  ('romeo-and-juliet', true, 9),
  ('divine-comedy', true, 10),
  ('beyond-good-and-evil', true, 11),
  ('thus-spoke-zarathustra', true, 12),
  ('the-antichrist', true, 13),
  ('mrs-dalloway', true, 14),
  ('to-the-lighthouse', true, 15),
  ('picture-of-dorian-gray', true, 16),
  ('huckleberry-finn', true, 17),
  ('pride-and-prejudice', true, 18),
  ('iliad', true, 19),
  ('odyssey', true, 20),
  ('dead-souls', true, 21),
  ('the-overcoat', true, 22),
  ('eugene-onegin', true, 23),
  ('the-captains-daughter', true, 24),
  ('evening-album', true, 25),
  ('the-metamorphosis', true, 26),
  ('sense-and-sensibility', true, 27),
  ('emma', true, 28),
  ('mansfield-park', true, 29),
  ('northanger-abbey', true, 30),
  ('persuasion', true, 31),
  ('moby-dick-or-the-whale-2', true, 32),
  ('typee-a-romance-of-the-south-seas', true, 33),
  ('the-importance-of-being-earnest-a-trivial-comedy-for-serious', true, 34),
  ('the-canterville-ghost', true, 35)
on conflict (work_id) do nothing;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.free_catalog_works where enabled;
  if v_count < 35 then
    raise exception
      'free_catalog_works backfill incomplete: expected at least 35 enabled rows (per FREE_CORPUS_MAPPING_REPORT.md''s exact-match set), found %. Refusing to proceed -- an under-populated Free corpus must not go live silently.',
      v_count;
  end if;
end $$;
