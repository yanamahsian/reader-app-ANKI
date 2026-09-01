-- Persistent Atlas Memory v1.
--
-- Atlas needs a durable, server-side memory substrate that is broader than
-- the current client-side connection calculation. This table mirrors the
-- visitor's meaningful durable reading objects (library state, progress,
-- bookmarks, annotations, Thought Threads and Thread evidence) into one
-- normalized, RLS-protected stream. It does not invent concepts or run AI.
-- Later Atlas inference can build on these verified first-party signals.

create table if not exists public.atlas_memory_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (
    signal_type in ('library', 'progress', 'bookmark', 'highlight', 'note', 'thread', 'thread_evidence')
  ),
  source_type text not null check (
    source_type in ('user_library', 'reader_progress', 'reader_bookmarks', 'annotations', 'thought_threads', 'thought_thread_items')
  ),
  source_id text not null,
  work_id text,
  edition_id text,
  page_index integer check (page_index is null or page_index >= 0),
  label text,
  excerpt text,
  note_text text,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint atlas_memory_signals_source_key unique (user_id, source_type, source_id)
);

alter table public.atlas_memory_signals enable row level security;

revoke all privileges on table public.atlas_memory_signals from anon;
revoke all privileges on table public.atlas_memory_signals from authenticated;
grant select on table public.atlas_memory_signals to authenticated;

create policy atlas_memory_signals_select_own
  on public.atlas_memory_signals
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create index if not exists atlas_memory_signals_user_occurred_idx
  on public.atlas_memory_signals (user_id, occurred_at desc);

create index if not exists atlas_memory_signals_user_work_occurred_idx
  on public.atlas_memory_signals (user_id, work_id, occurred_at desc)
  where work_id is not null;

create index if not exists atlas_memory_signals_user_type_occurred_idx
  on public.atlas_memory_signals (user_id, signal_type, occurred_at desc);

create or replace function public.atlas_memory_upsert_signal(
  p_user_id uuid,
  p_signal_type text,
  p_source_type text,
  p_source_id text,
  p_work_id text,
  p_edition_id text,
  p_page_index integer,
  p_label text,
  p_excerpt text,
  p_note_text text,
  p_payload jsonb,
  p_occurred_at timestamptz,
  p_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.atlas_memory_signals (
    user_id,
    signal_type,
    source_type,
    source_id,
    work_id,
    edition_id,
    page_index,
    label,
    excerpt,
    note_text,
    payload,
    occurred_at,
    updated_at
  )
  values (
    p_user_id,
    p_signal_type,
    p_source_type,
    p_source_id,
    p_work_id,
    p_edition_id,
    p_page_index,
    nullif(btrim(coalesce(p_label, '')), ''),
    nullif(btrim(coalesce(p_excerpt, '')), ''),
    nullif(btrim(coalesce(p_note_text, '')), ''),
    coalesce(p_payload, '{}'::jsonb),
    coalesce(p_occurred_at, now()),
    coalesce(p_updated_at, now())
  )
  on conflict (user_id, source_type, source_id) do update
  set signal_type = excluded.signal_type,
      work_id = excluded.work_id,
      edition_id = excluded.edition_id,
      page_index = excluded.page_index,
      label = excluded.label,
      excerpt = excluded.excerpt,
      note_text = excluded.note_text,
      payload = excluded.payload,
      occurred_at = excluded.occurred_at,
      updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.atlas_memory_upsert_signal(
  uuid, text, text, text, text, text, integer, text, text, text, jsonb, timestamptz, timestamptz
) from public, anon, authenticated;

create or replace function public.atlas_memory_delete_signal(
  p_user_id uuid,
  p_source_type text,
  p_source_id text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.atlas_memory_signals
  where user_id = p_user_id
    and source_type = p_source_type
    and source_id = p_source_id;
$$;

revoke all on function public.atlas_memory_delete_signal(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.atlas_memory_sync_annotation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.atlas_memory_delete_signal(old.user_id, 'annotations', old.id::text);
    return old;
  end if;

  perform public.atlas_memory_upsert_signal(
    new.user_id,
    case when nullif(btrim(coalesce(new.note_text, '')), '') is null then 'highlight' else 'note' end,
    'annotations',
    new.id::text,
    new.work_id,
    new.edition_id,
    new.page_index,
    null,
    new.quote_text,
    new.note_text,
    jsonb_build_object(
      'start_offset', new.start_offset,
      'end_offset', new.end_offset,
      'context_before', new.context_before,
      'context_after', new.context_after
    ),
    new.updated_at,
    new.updated_at
  );
  return new;
end;
$$;

create or replace function public.atlas_memory_sync_library()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.atlas_memory_delete_signal(old.user_id, 'user_library', old.id::text);
    return old;
  end if;

  perform public.atlas_memory_upsert_signal(
    new.user_id,
    'library',
    'user_library',
    new.id::text,
    new.work_id,
    new.last_edition_id,
    null,
    new.status,
    null,
    null,
    jsonb_build_object(
      'status', new.status,
      'last_language', new.last_language,
      'added_at', new.added_at
    ),
    new.updated_at,
    new.updated_at
  );
  return new;
end;
$$;

create or replace function public.atlas_memory_sync_progress()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_id text;
begin
  if tg_op = 'DELETE' then
    perform public.atlas_memory_delete_signal(old.user_id, 'reader_progress', old.id::text);
    return old;
  end if;

  select e.work_id into v_work_id
  from public.editions e
  where e.id = new.edition_id;

  perform public.atlas_memory_upsert_signal(
    new.user_id,
    'progress',
    'reader_progress',
    new.id::text,
    v_work_id,
    new.edition_id,
    new.page,
    null,
    null,
    null,
    jsonb_build_object('page', new.page),
    new.updated_at,
    new.updated_at
  );
  return new;
end;
$$;

create or replace function public.atlas_memory_sync_bookmark()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_id text;
begin
  if tg_op = 'DELETE' then
    perform public.atlas_memory_delete_signal(old.user_id, 'reader_bookmarks', old.id::text);
    return old;
  end if;

  select e.work_id into v_work_id
  from public.editions e
  where e.id = new.edition_id;

  perform public.atlas_memory_upsert_signal(
    new.user_id,
    'bookmark',
    'reader_bookmarks',
    new.id::text,
    v_work_id,
    new.edition_id,
    new.page_index,
    new.chapter_title,
    null,
    null,
    '{}'::jsonb,
    new.updated_at,
    new.updated_at
  );
  return new;
end;
$$;

create or replace function public.atlas_memory_sync_thread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.atlas_memory_delete_signal(old.user_id, 'thought_threads', old.id::text);
    return old;
  end if;

  perform public.atlas_memory_upsert_signal(
    new.user_id,
    'thread',
    'thought_threads',
    new.id::text,
    null,
    null,
    null,
    new.title,
    new.question,
    new.synthesis_note,
    '{}'::jsonb,
    new.updated_at,
    new.updated_at
  );
  return new;
end;
$$;

create or replace function public.atlas_memory_sync_thread_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_work_id text;
  v_edition_id text;
  v_page_index integer;
  v_quote text;
begin
  if tg_op = 'DELETE' then
    perform public.atlas_memory_delete_signal(old.user_id, 'thought_thread_items', old.id::text);
    return old;
  end if;

  select a.work_id, a.edition_id, a.page_index, a.quote_text
    into v_work_id, v_edition_id, v_page_index, v_quote
  from public.annotations a
  where a.id = new.annotation_id;

  perform public.atlas_memory_upsert_signal(
    new.user_id,
    'thread_evidence',
    'thought_thread_items',
    new.id::text,
    v_work_id,
    v_edition_id,
    v_page_index,
    null,
    v_quote,
    null,
    jsonb_build_object(
      'thread_id', new.thread_id,
      'annotation_id', new.annotation_id,
      'position', new.position
    ),
    new.created_at,
    new.created_at
  );
  return new;
end;
$$;

revoke all on function public.atlas_memory_sync_annotation() from public, anon, authenticated;
revoke all on function public.atlas_memory_sync_library() from public, anon, authenticated;
revoke all on function public.atlas_memory_sync_progress() from public, anon, authenticated;
revoke all on function public.atlas_memory_sync_bookmark() from public, anon, authenticated;
revoke all on function public.atlas_memory_sync_thread() from public, anon, authenticated;
revoke all on function public.atlas_memory_sync_thread_item() from public, anon, authenticated;

drop trigger if exists atlas_memory_annotations_trg on public.annotations;
create trigger atlas_memory_annotations_trg
after insert or update or delete on public.annotations
for each row execute function public.atlas_memory_sync_annotation();

drop trigger if exists atlas_memory_library_trg on public.user_library;
create trigger atlas_memory_library_trg
after insert or update or delete on public.user_library
for each row execute function public.atlas_memory_sync_library();

drop trigger if exists atlas_memory_progress_trg on public.reader_progress;
create trigger atlas_memory_progress_trg
after insert or update or delete on public.reader_progress
for each row execute function public.atlas_memory_sync_progress();

drop trigger if exists atlas_memory_bookmarks_trg on public.reader_bookmarks;
create trigger atlas_memory_bookmarks_trg
after insert or update or delete on public.reader_bookmarks
for each row execute function public.atlas_memory_sync_bookmark();

drop trigger if exists atlas_memory_threads_trg on public.thought_threads;
create trigger atlas_memory_threads_trg
after insert or update or delete on public.thought_threads
for each row execute function public.atlas_memory_sync_thread();

drop trigger if exists atlas_memory_thread_items_trg on public.thought_thread_items;
create trigger atlas_memory_thread_items_trg
after insert or update or delete on public.thought_thread_items
for each row execute function public.atlas_memory_sync_thread_item();

-- Backfill the persistent memory substrate from all durable reading state that
-- already existed before this migration. Re-running is safe because every
-- source object has one natural Atlas-memory row.
insert into public.atlas_memory_signals (
  user_id, signal_type, source_type, source_id, work_id, edition_id, page_index,
  label, excerpt, note_text, payload, occurred_at, updated_at
)
select
  a.user_id,
  case when nullif(btrim(coalesce(a.note_text, '')), '') is null then 'highlight' else 'note' end,
  'annotations', a.id::text, a.work_id, a.edition_id, a.page_index,
  null, a.quote_text, a.note_text,
  jsonb_build_object(
    'start_offset', a.start_offset,
    'end_offset', a.end_offset,
    'context_before', a.context_before,
    'context_after', a.context_after
  ),
  a.updated_at, a.updated_at
from public.annotations a
on conflict (user_id, source_type, source_id) do nothing;

insert into public.atlas_memory_signals (
  user_id, signal_type, source_type, source_id, work_id, edition_id, page_index,
  label, excerpt, note_text, payload, occurred_at, updated_at
)
select
  ul.user_id, 'library', 'user_library', ul.id::text, ul.work_id, ul.last_edition_id, null,
  ul.status, null, null,
  jsonb_build_object('status', ul.status, 'last_language', ul.last_language, 'added_at', ul.added_at),
  ul.updated_at, ul.updated_at
from public.user_library ul
on conflict (user_id, source_type, source_id) do nothing;

insert into public.atlas_memory_signals (
  user_id, signal_type, source_type, source_id, work_id, edition_id, page_index,
  label, excerpt, note_text, payload, occurred_at, updated_at
)
select
  rp.user_id, 'progress', 'reader_progress', rp.id::text, e.work_id, rp.edition_id, rp.page,
  null, null, null, jsonb_build_object('page', rp.page), rp.updated_at, rp.updated_at
from public.reader_progress rp
left join public.editions e on e.id = rp.edition_id
on conflict (user_id, source_type, source_id) do nothing;

insert into public.atlas_memory_signals (
  user_id, signal_type, source_type, source_id, work_id, edition_id, page_index,
  label, excerpt, note_text, payload, occurred_at, updated_at
)
select
  rb.user_id, 'bookmark', 'reader_bookmarks', rb.id::text, e.work_id, rb.edition_id, rb.page_index,
  rb.chapter_title, null, null, '{}'::jsonb, rb.updated_at, rb.updated_at
from public.reader_bookmarks rb
left join public.editions e on e.id = rb.edition_id
on conflict (user_id, source_type, source_id) do nothing;

insert into public.atlas_memory_signals (
  user_id, signal_type, source_type, source_id, work_id, edition_id, page_index,
  label, excerpt, note_text, payload, occurred_at, updated_at
)
select
  tt.user_id, 'thread', 'thought_threads', tt.id::text, null, null, null,
  tt.title, tt.question, tt.synthesis_note, '{}'::jsonb, tt.updated_at, tt.updated_at
from public.thought_threads tt
on conflict (user_id, source_type, source_id) do nothing;

insert into public.atlas_memory_signals (
  user_id, signal_type, source_type, source_id, work_id, edition_id, page_index,
  label, excerpt, note_text, payload, occurred_at, updated_at
)
select
  ti.user_id, 'thread_evidence', 'thought_thread_items', ti.id::text,
  a.work_id, a.edition_id, a.page_index, null, a.quote_text, null,
  jsonb_build_object('thread_id', ti.thread_id, 'annotation_id', ti.annotation_id, 'position', ti.position),
  ti.created_at, ti.created_at
from public.thought_thread_items ti
left join public.annotations a on a.id = ti.annotation_id
on conflict (user_id, source_type, source_id) do nothing;
