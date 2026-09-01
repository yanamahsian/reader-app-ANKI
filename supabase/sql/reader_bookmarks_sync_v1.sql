-- Account-synced Reader bookmarks.
-- Guest bookmarks intentionally remain in localStorage; authenticated users
-- read/write only their own rows through PostgREST + RLS.
create table if not exists public.reader_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition_id text not null references public.editions(id) on delete cascade,
  page_index integer not null check (page_index >= 0),
  chapter_title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reader_bookmarks_user_edition_page_key unique (user_id, edition_id, page_index)
);

alter table public.reader_bookmarks enable row level security;

revoke all privileges on table public.reader_bookmarks from anon;
revoke all privileges on table public.reader_bookmarks from authenticated;
grant select, insert, update, delete on table public.reader_bookmarks to authenticated;

create policy reader_bookmarks_select_own
  on public.reader_bookmarks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy reader_bookmarks_insert_own
  on public.reader_bookmarks
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy reader_bookmarks_update_own
  on public.reader_bookmarks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy reader_bookmarks_delete_own
  on public.reader_bookmarks
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists reader_bookmarks_user_edition_created_idx
  on public.reader_bookmarks (user_id, edition_id, created_at desc);
