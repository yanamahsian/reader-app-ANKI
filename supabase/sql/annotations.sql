-- annotations — NEW table. ALREADY APPLIED to the live database directly
-- via the Supabase MCP (migration "20260826141420
-- add_annotations_for_notes_and_highlights"), matching this repo's
-- established convention (see author_death_year_enrichment.sql,
-- library_language_facets.sql, rights_backfill_death_year.sql) of every
-- applied migration also existing here as a committed .sql file. This is a
-- verbatim mirror of that migration's own statements — SOURCE
-- REPRODUCIBILITY only, so GitHub stays the reproducible record of what
-- production actually has instead of production silently running ahead of
-- the repository. Do NOT re-apply this file; the table already exists.

-- NOTES + HIGHLIGHTS PHASE: one table for both highlights and notes.
-- A highlight is a row with note_text = null; adding a comment just
-- populates note_text on the same row -- no separate "kind" column,
-- no separate highlights/notes tables. This mirrors the existing
-- user_library/reader_progress convention (flat columns, no JSONB,
-- RLS via auth.uid() = user_id on every operation, no service_role
-- needed from the frontend).
--
-- EDITION-SPECIFIC, NOT WORK-LEVEL: work_id + edition_id are both
-- required and both plain TEXT (matching public.works.id /
-- public.editions.id, which are TEXT, not UUID -- see those tables'
-- own schema). work_id alone would let two different translations of
-- the same Work share one incoherent set of highlights; edition_id
-- alone would make "show me everything I've saved on this Work,
-- across translations" require a second lookup. Both are stored
-- directly, no join required for either question.
--
-- ANCHOR MODEL: page_index is the reader's own GLOBAL FLAT page
-- index -- the exact same concept public.reader_progress.page and
-- the reader engine's own Bookmark.pageIndex already use. Confirmed
-- by reading src/features/reader/engine/pagination.ts and
-- readerEngine.ts: pagination is a pure, deterministic,
-- content-only character-count splitter computed once at
-- document-load time; changing font size / viewport / theme only
-- re-flattens the SAME already-paginated chapters
-- (readerEngine.ts's repaginate() calls flattenDocument again, never
-- paginateText again) and re-renders at the same page index. So
-- page_index is stable for a given Edition across every
-- device/font/viewport a visitor might use -- it only changes if the
-- Edition's underlying text itself is re-ingested, which is already
-- a "this Edition's content changed" event no anchor scheme could
-- survive anyway.
--
-- start_offset/end_offset are character offsets into that page's raw
-- text (FlatPage.rawText, the un-escaped, unwrapped source the HTML
-- is generated from -- see formatPage() in pagination.ts). No
-- structural chapter/paragraph/block id exists anywhere in this
-- pipeline (the normalized anki-json document is just
-- {chapters: [{title, text}]} -- confirmed via ankiJson.ts), so this
-- offset pair, together with quote_text as an immutable snapshot and
-- context_before/context_after for future fuzzy relocation, is the
-- minimally-sufficient anchor this project's actual data model
-- supports today. No UNIQUE constraint on the anchor: a reader may
-- genuinely want two different notes on the same fragment, or two
-- overlapping highlights, and this schema does not forbid that.
create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id text not null,
  edition_id text not null,
  quote_text text not null,
  note_text text,
  page_index integer not null,
  start_offset integer not null,
  end_offset integer not null,
  context_before text,
  context_after text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint annotations_page_index_check check (page_index >= 0),
  constraint annotations_offsets_check check (start_offset >= 0 and end_offset > start_offset)
);

alter table public.annotations enable row level security;

-- Same four-policy shape as user_library/reader_progress: every
-- operation scoped to auth.uid() = user_id, no exceptions, no
-- service_role bypass needed from the frontend.
create policy annotations_select_own on public.annotations
  for select using (auth.uid() = user_id);

create policy annotations_insert_own on public.annotations
  for insert with check (auth.uid() = user_id);

create policy annotations_update_own on public.annotations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy annotations_delete_own on public.annotations
  for delete using (auth.uid() = user_id);

-- Minimal useful indexes per the spec: edition-scoped Reader loads,
-- work-scoped "all my notes on this Work" lookups (used by the Notes
-- screen's own grouping), and updated_at for "most recently active
-- first" ordering (same convention as user_library's own listing).
create index annotations_user_id_idx on public.annotations using btree (user_id);
create index annotations_user_id_edition_id_idx on public.annotations using btree (user_id, edition_id);
create index annotations_user_id_work_id_idx on public.annotations using btree (user_id, work_id);
create index annotations_user_id_updated_at_idx on public.annotations using btree (user_id, updated_at desc);

grant select, insert, update, delete on public.annotations to authenticated;

-- NOT part of this migration's own statements, confirmed separately against
-- production (information_schema.role_table_grants): anon/postgres/
-- service_role also show up with table-level privileges on
-- public.annotations. That is this project's pre-existing, schema-wide
-- `alter default privileges ... grant ... to anon, authenticated,
-- service_role` applied automatically to every new public table (the same
-- default every other table in this schema already has) -- not a grant
-- this migration issued itself, and RLS's `auth.uid() = user_id` still
-- blocks anon on every one of those operations regardless.
