-- USER DATA RLS + PERFORMANCE HARDENING v1
-- Applied to production as migration: user_data_rls_performance_hardening_v1
-- Purpose: private user tables are authenticated-only at the grant layer; RLS remains
-- the ownership boundary. auth.uid() is evaluated once per statement, and missing
-- covering indexes are added for the active Library/Reader/Thought Thread relationships.

revoke all privileges on table public.annotations from anon;
revoke all privileges on table public.user_library from anon;
revoke all privileges on table public.reader_progress from anon;
revoke all privileges on table public.thought_threads from anon;
revoke all privileges on table public.thought_thread_items from anon;

alter policy annotations_select_own on public.annotations
  to authenticated using ((select auth.uid()) = user_id);
alter policy annotations_insert_own on public.annotations
  to authenticated with check ((select auth.uid()) = user_id);
alter policy annotations_update_own on public.annotations
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy annotations_delete_own on public.annotations
  to authenticated using ((select auth.uid()) = user_id);

alter policy user_library_select_own on public.user_library
  to authenticated using ((select auth.uid()) = user_id);
alter policy user_library_insert_own on public.user_library
  to authenticated with check ((select auth.uid()) = user_id);
alter policy user_library_update_own on public.user_library
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy user_library_delete_own on public.user_library
  to authenticated using ((select auth.uid()) = user_id);

alter policy reader_progress_select_own on public.reader_progress
  to authenticated using ((select auth.uid()) = user_id);
alter policy reader_progress_insert_own on public.reader_progress
  to authenticated with check ((select auth.uid()) = user_id);
alter policy reader_progress_update_own on public.reader_progress
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy reader_progress_delete_own on public.reader_progress
  to authenticated using ((select auth.uid()) = user_id);

alter policy thought_threads_select_own on public.thought_threads
  to authenticated using ((select auth.uid()) = user_id);
alter policy thought_threads_insert_own on public.thought_threads
  to authenticated with check ((select auth.uid()) = user_id);
alter policy thought_threads_update_own on public.thought_threads
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy thought_threads_delete_own on public.thought_threads
  to authenticated using ((select auth.uid()) = user_id);

alter policy thought_thread_items_select_own on public.thought_thread_items
  to authenticated using ((select auth.uid()) = user_id);
alter policy thought_thread_items_insert_own on public.thought_thread_items
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.thought_threads t
      where t.id = thought_thread_items.thread_id
        and t.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.annotations a
      where a.id = thought_thread_items.annotation_id
        and a.user_id = (select auth.uid())
    )
  );
alter policy thought_thread_items_update_own on public.thought_thread_items
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy thought_thread_items_delete_own on public.thought_thread_items
  to authenticated using ((select auth.uid()) = user_id);

create index if not exists reader_progress_edition_id_idx
  on public.reader_progress (edition_id);
create index if not exists user_library_work_id_idx
  on public.user_library (work_id);
create index if not exists user_library_last_edition_id_idx
  on public.user_library (last_edition_id)
  where last_edition_id is not null;
create index if not exists thought_thread_items_annotation_owner_idx
  on public.thought_thread_items (annotation_id, user_id);
create index if not exists thought_thread_items_thread_owner_idx
  on public.thought_thread_items (thread_id, user_id);
