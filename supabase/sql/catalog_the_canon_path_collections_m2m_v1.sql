-- THE CANON v1 follow-up: Path <-> Collection many-to-many, and a pilot
-- path rename/id correction.
--
-- PART 1 -- Path <-> Collection many-to-many
-- -------------------------------------------
-- canon_paths.collection_id (a single nullable FK) was too narrow: one
-- Reading Path should be able to sit under several Canon areas at once
-- ("The Russian Novel: 19th Century" under Russian Literature, The
-- Novel, and 19th Century simultaneously). A single FK column cannot
-- express that; a join table can.
--
-- New table public.canon_path_collections is the actual many-to-many:
-- any (path_id, collection_id) pair may exist at most once (composite
-- primary key), and a path or a collection may appear in any number of
-- rows. `position` is the curated order of this Path within THIS
-- Collection's own listing specifically -- distinct from
-- canon_paths.position, which remains a standalone/global ordering hint
-- for the Path itself, independent of any Collection it happens to sit
-- under (that distinction only became meaningful once a Path could sit
-- under more than one Collection at a time).
--
-- canon_paths.collection_id is DROPPED in this migration, not merely
-- deprecated: no application code reads it yet (Canon has no UI or API
-- layer built so far -- see the v1 report, section 8), so nothing
-- external depends on it, and a clean schema now is strictly better than
-- carrying a column that would otherwise need an explicit future removal
-- migration and a "which one wins" reconciliation story with the new
-- join table for no benefit to anyone.
--
-- RLS consequence, stated explicitly: canon_paths visibility used to
-- also depend on its one collection's status (a path nested under a
-- draft collection was hidden even if published itself). With
-- collection_id gone, a Path's own status is now the sole authority
-- over whether the Path itself is publicly visible -- Collections are
-- categorisation tags on a published Path, not a containment hierarchy
-- controlling its visibility. A canon_path_collections *association* row
-- is still only visible when BOTH sides are published, so a draft
-- Collection's tag never leaks through a published Path (and vice
-- versa). canon_path_works keeps exactly the same visibility rule as
-- before, simplified to drop the now-nonexistent collection check: a
-- membership row is visible iff its Path is published.
--
-- PART 2 -- pilot path rename
-- ----------------------------
-- The pilot path's title said "The Russian Novel: 19th Century" but its
-- 9 works include a short story (The Overcoat) and a novella (The Death
-- of Ivan Ilyich) -- not novels. Renamed to "Russian Literature: The
-- Nineteenth Century" / "Русская литература: XIX век", which the actual
-- work list supports without exaggeration. Since nothing external
-- references the old id yet, the stable id is corrected too (rather than
-- kept as a permanent mismatch with the corrected title):
-- russian-novel-19th-century -> russian-literature-19th-century.
-- Renaming a text primary key referenced by two child tables is done as
-- insert-new-row -> repoint children -> delete-old-row within one
-- transaction, since neither child FK is ON UPDATE CASCADE (a direct
-- UPDATE of the parent id would fail immediately against existing
-- child rows otherwise).
--
-- The 9 works themselves, their order, stage, is_core and prerequisite
-- values are UNCHANGED -- this migration only touches the path's own
-- identity/title/description and its collection linkage.

create table public.canon_path_collections (
  path_id text not null references public.canon_paths(id) on delete cascade,
  collection_id text not null references public.canon_collections(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (path_id, collection_id)
);

comment on table public.canon_path_collections is
  'Many-to-many join between canon_paths and canon_collections. A Reading Path may belong to any number of Canon areas at once (e.g. "Russian Literature: The Nineteenth Century" tagged under Russian Literature, The Novel, and 19th Century simultaneously) -- this table is what makes that an ordinary fact of the data rather than a forced single choice. position orders this Path within THIS Collection''s own listing; it has no meaning outside that (path_id, collection_id) pair. Public reads (anon+authenticated) only rows where both the Path and the Collection are published; writes are service_role/admin-tooling only, same as the other two Canon tables.';

create index canon_path_collections_collection_id_idx on public.canon_path_collections(collection_id);

alter table public.canon_path_collections enable row level security;

create policy "Public can read published Canon path collection links"
  on public.canon_path_collections
  for select
  to anon, authenticated
  using (
    exists (select 1 from public.canon_paths p where p.id = canon_path_collections.path_id and p.status = 'published')
    and exists (select 1 from public.canon_collections c where c.id = canon_path_collections.collection_id and c.status = 'published')
  );

-- Rename the pilot path's stable id + title/description (works and their
-- per-path metadata are untouched).
insert into public.canon_paths (id, collection_id, title, title_i18n, description, description_i18n, status, position, created_at, updated_at)
select
  'russian-literature-19th-century',
  collection_id,
  'Russian Literature: The Nineteenth Century',
  '{"ru": "Русская литература: XIX век"}'::jsonb,
  'A curated route through nineteenth-century Russian literature: from Pushkin''s prose origins, through Gogol''s "little man", to the two great psychological and philosophical novelists, Tolstoy and Dostoevsky.',
  '{"ru": "Маршрут через русскую литературу XIX века: от прозы Пушкина через гоголевского «маленького человека» — к двум главным психологическим и философским романистам, Толстому и Достоевскому."}'::jsonb,
  status,
  position,
  created_at,
  now()
from public.canon_paths
where id = 'russian-novel-19th-century';

update public.canon_path_works
set path_id = 'russian-literature-19th-century'
where path_id = 'russian-novel-19th-century';

-- Migrate the existing single collection link into the new join table
-- before the old column is dropped.
insert into public.canon_path_collections (path_id, collection_id, position)
select id, collection_id, 0
from public.canon_paths
where id = 'russian-literature-19th-century' and collection_id is not null;

delete from public.canon_paths where id = 'russian-novel-19th-century';

-- Replace the two RLS policies that referenced canon_paths.collection_id
-- before dropping the column itself.
drop policy "Public can read published Canon paths" on public.canon_paths;
create policy "Public can read published Canon paths"
  on public.canon_paths
  for select
  to anon, authenticated
  using (status = 'published');

drop policy "Public can read published Canon path works" on public.canon_path_works;
create policy "Public can read published Canon path works"
  on public.canon_path_works
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.canon_paths p
      where p.id = canon_path_works.path_id and p.status = 'published'
    )
  );

alter table public.canon_paths drop column collection_id;

comment on table public.canon_paths is
  'The Canon (inside Atlas): curated reading sequences ("Reading Paths"), e.g. "Russian Literature: The Nineteenth Century", "Greek Tragedy", "From Pushkin to Dostoevsky". Belongs to zero or more canon_collections rows via the canon_path_collections join table (many-to-many -- see that table''s comment). A Path is a curated, deterministic ordering of works (see canon_path_works) -- Atlas personalization is layered on top of this structure later and must never rewrite the curated structure itself. Public reads (anon+authenticated) only status=published rows via RLS -- a Path''s own status is now the sole visibility authority; Collection membership is categorisation, not containment. All writes are service_role/admin-tooling only.';
