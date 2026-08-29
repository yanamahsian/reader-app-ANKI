-- Reading Memory / annotations — current production mirror.
--
-- The table already exists in production. This file records the live schema so the
-- repository remains reproducible; do not blindly re-run it against an environment
-- where public.annotations already exists.
--
-- One row is one saved fragment/highlight. note_text is optional: NULL means a saved
-- highlight without a personal note. Both work_id and edition_id are stored because
-- annotations belong to the exact text/translation while Notes can still group by Work.
-- start_offset/end_offset are nullable in the current live schema for compatibility with
-- earlier saved-fragment rows; new Reader saves provide both offsets.
--
-- annotations_id_user_id_key is intentionally redundant with the globally unique primary
-- key on id. Thought Threads v1 uses it as the composite ownership anchor for a relation
-- foreign key, so a client can never pair its own user_id with another user's annotation.

create table public.annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id text not null,
  edition_id text not null,
  quote_text text not null,
  note_text text,
  page_index integer not null,
  start_offset integer,
  end_offset integer,
  context_before text,
  context_after text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  book_title text,
  author text,
  constraint annotations_page_index_check check (page_index >= 0),
  constraint annotations_offsets_check check (start_offset >= 0 and end_offset > start_offset),
  constraint annotations_id_user_id_key unique (id, user_id)
);

alter table public.annotations enable row level security;

create policy annotations_select_own on public.annotations
  for select using (auth.uid() = user_id);
create policy annotations_insert_own on public.annotations
  for insert with check (auth.uid() = user_id);
create policy annotations_update_own on public.annotations
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy annotations_delete_own on public.annotations
  for delete using (auth.uid() = user_id);

create index annotations_user_id_idx on public.annotations using btree (user_id);
create index annotations_user_id_edition_id_idx on public.annotations using btree (user_id, edition_id);
create index annotations_user_id_work_id_idx on public.annotations using btree (user_id, work_id);
create index annotations_user_id_updated_at_idx on public.annotations using btree (user_id, updated_at desc);

grant select, insert, update, delete on public.annotations to authenticated;
