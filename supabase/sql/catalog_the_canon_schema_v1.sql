-- THE CANON v1 -- editorial reading-architecture layer inside Atlas.
--
-- NOT "school curriculum" / "required reading". The Canon is a curated
-- intellectual map for deep adult reading: traditions -> epochs ->
-- movements -> reading paths -> works. It is an editorial product
-- surface, not a recommendation algorithm and not a generated list.
--
-- Three new tables, minimal on purpose (audited the existing schema
-- first -- see report section 4 -- and reused what already exists
-- rather than duplicating it):
--
--   canon_collections  Top-level Canon areas. Can be a national/language
--                       tradition (Russian Literature), an epoch/movement
--                       (Ancient World, Modernism), a form (The Novel,
--                       Tragedy), or a theme (War, Faith & Doubt). These
--                       are PEERS, not levels of one strict taxonomy --
--                       nothing in this schema privileges "tradition"
--                       over "theme". None are hardcoded here; the pilot
--                       seed (catalog_the_canon_pilot_russian_novel_v1.sql)
--                       adds exactly one as a real row.
--
--   canon_paths         Curated reading sequences ("Reading Paths"), e.g.
--                       "The Russian Novel: 19th Century", "Greek
--                       Tragedy". A Path optionally sits under one
--                       Collection (collection_id, nullable) or stands
--                       independently.
--
--   canon_path_works    The actual many-to-many join: which of the
--                       existing public.works rows belong to which Path,
--                       with curated order/stage/importance/prerequisite/
--                       rationale. This is the piece that makes "one book,
--                       many reading paths" (e.g. War and Peace inside
--                       Russian Literature, The Novel, War, Realism and a
--                       Tolstoy path all at once) a normal, unremarkable
--                       fact of the data model instead of a special case.
--
-- Deliberately NOT created: a separate Canon copy of Works, and a fourth
-- "canon_work_metadata" table. Checked first whether Canon needs its own
-- general per-work metadata -- it doesn't: publication_status='published'
-- works already carry description, genre_ids, theme_ids, movement_id,
-- epoch_id, country_id, and Atlas's own concept graph builds further
-- context from those same work_ids independently. The only metadata that
-- is genuinely Canon's own is PATH-relative (this work's place/stage/
-- rationale IN THIS reading path), which is exactly what
-- canon_path_works holds. Every work_id referenced here must already
-- exist in public.works (enforced by foreign key) -- Canon never creates
-- a Work, and edition/translation selection remains entirely the
-- existing Library/Reader layer's responsibility; Canon operates at the
-- Work level only.
--
-- i18n: the existing content-level i18n columns in this schema
-- (taxonomy_terms.label/label_en, atlas_semantic_concepts.label_en/
-- label_ru) each hardcode exactly the two languages that happened to be
-- needed when they were written. The product's actual supported
-- interface locales (src/i18n/locale.ts: SUPPORTED_LOCALES) are six --
-- en, es, de, fr, ru, uk -- and that list is expected to grow. Copying
-- the label/label_en pattern here would either under-serve those other
-- four languages or need a schema migration every time a locale is
-- added. Instead every curated text field gets a `<field>` +
-- `<field>_i18n jsonb` pair: `<field>` is a required plain-text English
-- fallback (so ordering/search/display/the pilot seed always has one
-- guaranteed value, no jsonb parsing required), and `<field>_i18n` is an
-- open `{"<locale>": "text", ...}` map that can gain a new language via
-- a plain UPDATE, never a migration. This intentionally does NOT build
-- the schema around Russian, even though the pilot content happens to be
-- Russian literature.
--
-- Editorial governance (requirement G): every row carries `status`
-- (draft/published/archived, mirroring the exact check-constraint style
-- already used by public.works.publication_status) plus an `id` that IS
-- its own stable slug (matching the existing works.id/taxonomy_terms.id/
-- authors.id convention of human-readable text primary keys, not
-- surrogate UUIDs) and a `position` integer for curated ordering. Adding
-- a new Collection or Path later is a data INSERT, never a migration.
--
-- Performance / RLS (requirement I): no view, no correlated subselect in
-- any hot path. Public (anon+authenticated) read access is granted only
-- to already-published rows, following the exact precedent already
-- live in this schema for anki_home_catalog/anki_home_features (a plain
-- USING-clause SELECT policy gating on a status/expiry column -- Supabase
-- already grants table-level CRUD to anon/authenticated by default in
-- this project, same as those two tables, so RLS is the only real gate
-- here too). No INSERT/UPDATE/DELETE policy is created for any of the
-- three tables, matching the existing works/editions/taxonomy_terms
-- convention: RLS enabled with zero write policies means only
-- service_role (which bypasses RLS entirely, as in every Supabase
-- project) can write -- i.e. editorial tooling / migrations only, never
-- the client directly.

create table public.canon_collections (
  id text primary key,
  title text not null,
  title_i18n jsonb not null default '{}'::jsonb,
  description text,
  description_i18n jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status = any (array['draft','published','archived'])),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_collections_title_i18n_is_object
    check (jsonb_typeof(title_i18n) = 'object'),
  constraint canon_collections_description_i18n_is_object
    check (description_i18n is null or jsonb_typeof(description_i18n) = 'object')
);

comment on table public.canon_collections is
  'The Canon (inside Atlas): top-level areas -- literary traditions, epochs, movements, forms, or intellectual themes (e.g. Russian Literature, Ancient World, Modernism, The Novel, War, Faith & Doubt). Peers, not a strict single taxonomy; a Path may sit under any one of these or under none. Never "school curriculum" / "required reading" framing -- this is a curated map for deep adult reading. Editorial content only, no user data. Public reads (anon+authenticated) only status=published rows via RLS; all writes are service_role/admin-tooling only.';
comment on column public.canon_collections.id is 'Stable slug, also the primary key (matches works.id/taxonomy_terms.id convention). Never reused across unrelated content once published.';
comment on column public.canon_collections.title is 'Required plain-text fallback title (English by convention). Always non-null so basic display/ordering never needs to touch title_i18n.';
comment on column public.canon_collections.title_i18n is 'Optional locale overrides, e.g. {"ru": "Русская литература"}. Keys are not constrained to SUPPORTED_LOCALES so a new interface language needs no migration here.';

create table public.canon_paths (
  id text primary key,
  collection_id text references public.canon_collections(id) on delete set null,
  title text not null,
  title_i18n jsonb not null default '{}'::jsonb,
  description text,
  description_i18n jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status = any (array['draft','published','archived'])),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_paths_title_i18n_is_object
    check (jsonb_typeof(title_i18n) = 'object'),
  constraint canon_paths_description_i18n_is_object
    check (description_i18n is null or jsonb_typeof(description_i18n) = 'object')
);

comment on table public.canon_paths is
  'The Canon (inside Atlas): curated reading sequences ("Reading Paths"), e.g. "The Russian Novel: 19th Century", "Greek Tragedy", "From Pushkin to Dostoevsky". Optionally nested under one canon_collections row (collection_id, nullable -- a Path may stand independently of any Collection). A Path is a curated, deterministic ordering of works (see canon_path_works) -- Atlas personalization is layered on top of this structure later (which works the user already read, saved, or has strong concept-graph evidence for) and must never rewrite the curated structure itself. Public reads (anon+authenticated) only status=published rows whose parent collection, if any, is also published; all writes are service_role/admin-tooling only.';
comment on column public.canon_paths.collection_id is 'Optional parent Collection. v1 scope note: this is many-Paths-to-one-Collection, not many-to-many -- the many-to-many requirement in the spec is about Work<->Path (see canon_path_works), which this does satisfy. A Path needing to surface under more than one Collection is a clean additive migration later (a canon_path_collections join table) with zero change to canon_path_works; not built now because nothing in the pilot needs it yet.';

create index canon_paths_collection_id_idx on public.canon_paths(collection_id);
create index canon_paths_status_idx on public.canon_paths(status);

create table public.canon_path_works (
  id uuid primary key default gen_random_uuid(),
  path_id text not null references public.canon_paths(id) on delete cascade,
  work_id text not null references public.works(id) on delete restrict,
  position integer not null,
  reading_stage text
    check (reading_stage is null or reading_stage = any (array['entry','intermediate','advanced'])),
  is_core boolean,
  prerequisite_work_id text references public.works(id) on delete set null,
  rationale text,
  rationale_i18n jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canon_path_works_unique_work unique (path_id, work_id),
  constraint canon_path_works_unique_position unique (path_id, position),
  constraint canon_path_works_rationale_i18n_is_object
    check (jsonb_typeof(rationale_i18n) = 'object'),
  constraint canon_path_works_prerequisite_not_self
    check (prerequisite_work_id is null or prerequisite_work_id <> work_id)
);

comment on table public.canon_path_works is
  'THE many-to-many join between canon_paths and public.works. The same work_id may appear in any number of Paths -- e.g. War and Peace can sit in a "Russian Literature" path, a "19th Century Novel" path, a "War" path, and a Tolstoy path simultaneously; each membership is its own row here, in its own Path, with its own position/stage/rationale. No Work row is ever duplicated or copied -- work_id is a plain foreign key into the existing catalog. position is the curated order within THIS path only (not a global ordering). reading_stage intentionally covers both "difficulty" and "estimated reading stage" from the original brief as a single field (entry/intermediate/advanced) -- on inspection those were one concept wearing two names, and adding two near-duplicate columns would have been exactly the kind of unneeded complexity the brief itself warned against. is_core and prerequisite_work_id are both optional and independent: is_core marks a work as essential/central to this path (null = not specified, not "no"); prerequisite_work_id optionally points at another work (conventionally, though not database-enforced, one also present in the same path) that a reader should encounter first -- this single pointer is deliberately enough to derive both "read before" (the pointed-to work) and "read after" (any row in the same path whose prerequisite_work_id points at this one) for a future UI, with no extra columns. "Why this work matters" / historical-context / Atlas-graph-connections prose is deliberately NOT modelled as columns yet -- nothing needs to store that text today (requirement C only asks for the architecture to allow it later); when it is needed, the natural extension is either a nullable jsonb `context` column here or a small 1:1 companion table keyed on this table''s id, added additively without touching anything built in this migration.';
comment on column public.canon_path_works.rationale is 'Short editorial note on why this work sits here, in this path, at this position. Plain, non-AI-generated text -- never a model-authored blurb.';

create index canon_path_works_work_id_idx on public.canon_path_works(work_id);
create index canon_path_works_prerequisite_idx on public.canon_path_works(prerequisite_work_id) where prerequisite_work_id is not null;

alter table public.canon_collections enable row level security;
alter table public.canon_paths enable row level security;
alter table public.canon_path_works enable row level security;

create policy "Public can read published Canon collections"
  on public.canon_collections
  for select
  to anon, authenticated
  using (status = 'published');

create policy "Public can read published Canon paths"
  on public.canon_paths
  for select
  to anon, authenticated
  using (
    status = 'published'
    and (
      collection_id is null
      or exists (
        select 1 from public.canon_collections c
        where c.id = canon_paths.collection_id and c.status = 'published'
      )
    )
  );

create policy "Public can read published Canon path works"
  on public.canon_path_works
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.canon_paths p
      where p.id = canon_path_works.path_id
        and p.status = 'published'
        and (
          p.collection_id is null
          or exists (
            select 1 from public.canon_collections c
            where c.id = p.collection_id and c.status = 'published'
          )
        )
    )
  );
