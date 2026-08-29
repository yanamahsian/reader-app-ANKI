-- THOUGHT THREADS v1 — explicit user-created intellectual links between saved annotations.
--
-- A Thought Thread is not an automatic Atlas connection and not a tag/folder. The user
-- explicitly chooses saved annotations from their own Reading Memory and gives the group
-- a title, optional guiding question, and optional synthesis note.
--
-- Deletion semantics:
--   * deleting a thread deletes only thought_thread_items (ON DELETE CASCADE), never annotations;
--   * deleting an annotation removes only the corresponding relation item;
--   * a thread is intentionally allowed to remain with 0/1 surviving items so its title,
--     question and synthesis are not destroyed when source memory is later deleted.
--
-- Security invariant:
-- thought_thread_items carries user_id and has composite foreign keys to BOTH the thread
-- and the annotation. Therefore an authenticated user cannot link somebody else's annotation
-- into their own thread even by bypassing the frontend and calling PostgREST directly.

create table public.thought_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  question text,
  synthesis_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint thought_threads_title_check check (char_length(btrim(title)) between 1 and 200),
  constraint thought_threads_id_user_id_key unique (id, user_id)
);

-- Existing annotations.id is already globally unique as the primary key. This additional
-- composite uniqueness is solely the relational anchor that lets thought_thread_items prove
-- annotation ownership with a foreign key, rather than trusting client-supplied user_id.
alter table public.annotations
  add constraint annotations_id_user_id_key unique (id, user_id);

create table public.thought_thread_items (
  thread_id uuid not null,
  annotation_id uuid not null,
  user_id uuid not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (thread_id, annotation_id),
  constraint thought_thread_items_position_check check (position >= 0),
  constraint thought_thread_items_thread_owner_fk
    foreign key (thread_id, user_id)
    references public.thought_threads(id, user_id)
    on delete cascade,
  constraint thought_thread_items_annotation_owner_fk
    foreign key (annotation_id, user_id)
    references public.annotations(id, user_id)
    on delete cascade
);

create index thought_threads_user_updated_idx
  on public.thought_threads(user_id, updated_at desc);
create index thought_thread_items_user_idx
  on public.thought_thread_items(user_id);
create index thought_thread_items_annotation_idx
  on public.thought_thread_items(annotation_id);

alter table public.thought_threads enable row level security;
alter table public.thought_thread_items enable row level security;

create policy thought_threads_select_own on public.thought_threads
  for select using (auth.uid() = user_id);
create policy thought_threads_insert_own on public.thought_threads
  for insert with check (auth.uid() = user_id);
create policy thought_threads_update_own on public.thought_threads
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy thought_threads_delete_own on public.thought_threads
  for delete using (auth.uid() = user_id);

create policy thought_thread_items_select_own on public.thought_thread_items
  for select using (auth.uid() = user_id);
create policy thought_thread_items_insert_own on public.thought_thread_items
  for insert with check (auth.uid() = user_id);
create policy thought_thread_items_update_own on public.thought_thread_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy thought_thread_items_delete_own on public.thought_thread_items
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.thought_threads to authenticated;
grant select, insert, update, delete on public.thought_thread_items to authenticated;

-- Atomic creation: the UI requires >=2 annotations and the database verifies that every
-- supplied annotation belongs to auth.uid() before creating anything. Duplicate ids are
-- collapsed while preserving their first position.
create or replace function public.create_thought_thread(
  p_title text,
  p_question text,
  p_synthesis_note text,
  p_annotation_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_thread_id uuid;
  v_expected integer;
  v_owned integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Thread title is required' using errcode = '22023';
  end if;

  select count(*) into v_expected
  from (
    select distinct annotation_id
    from unnest(coalesce(p_annotation_ids, '{}'::uuid[])) as selected(annotation_id)
  ) deduped;

  if v_expected < 2 then
    raise exception 'At least two annotations are required to create a Thought Thread'
      using errcode = '22023';
  end if;

  select count(*) into v_owned
  from public.annotations a
  where a.user_id = v_user_id
    and a.id = any(p_annotation_ids);

  if v_owned <> v_expected then
    raise exception 'One or more annotations are unavailable' using errcode = '42501';
  end if;

  insert into public.thought_threads(user_id, title, question, synthesis_note)
  values (
    v_user_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_question, '')), ''),
    nullif(btrim(coalesce(p_synthesis_note, '')), '')
  )
  returning id into v_thread_id;

  insert into public.thought_thread_items(thread_id, annotation_id, user_id, position)
  select v_thread_id, selected.annotation_id, v_user_id, (selected.first_ordinality - 1)::integer
  from (
    select annotation_id, min(ordinality) as first_ordinality
    from unnest(p_annotation_ids) with ordinality as input(annotation_id, ordinality)
    group by annotation_id
  ) selected
  order by selected.first_ordinality;

  return v_thread_id;
end;
$$;

-- Atomic edit/reorder. Unlike creation, replacement may contain 0/1 items because a Thread
-- is allowed to survive after source annotations disappear or the user removes relations.
create or replace function public.replace_thought_thread(
  p_thread_id uuid,
  p_title text,
  p_question text,
  p_synthesis_note text,
  p_annotation_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_expected integer;
  v_owned integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Thread title is required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.thought_threads t
    where t.id = p_thread_id and t.user_id = v_user_id
  ) then
    raise exception 'Thought Thread not found' using errcode = '42501';
  end if;

  select count(*) into v_expected
  from (
    select distinct annotation_id
    from unnest(coalesce(p_annotation_ids, '{}'::uuid[])) as selected(annotation_id)
  ) deduped;

  select count(*) into v_owned
  from public.annotations a
  where a.user_id = v_user_id
    and a.id = any(coalesce(p_annotation_ids, '{}'::uuid[]));

  if v_owned <> v_expected then
    raise exception 'One or more annotations are unavailable' using errcode = '42501';
  end if;

  update public.thought_threads
  set title = btrim(p_title),
      question = nullif(btrim(coalesce(p_question, '')), ''),
      synthesis_note = nullif(btrim(coalesce(p_synthesis_note, '')), ''),
      updated_at = now()
  where id = p_thread_id and user_id = v_user_id;

  delete from public.thought_thread_items
  where thread_id = p_thread_id and user_id = v_user_id;

  insert into public.thought_thread_items(thread_id, annotation_id, user_id, position)
  select p_thread_id, selected.annotation_id, v_user_id, (selected.first_ordinality - 1)::integer
  from (
    select annotation_id, min(ordinality) as first_ordinality
    from unnest(coalesce(p_annotation_ids, '{}'::uuid[])) with ordinality as input(annotation_id, ordinality)
    group by annotation_id
  ) selected
  order by selected.first_ordinality;
end;
$$;

revoke all on function public.create_thought_thread(text, text, text, uuid[]) from public, anon;
revoke all on function public.replace_thought_thread(uuid, text, text, text, uuid[]) from public, anon;
grant execute on function public.create_thought_thread(text, text, text, uuid[]) to authenticated;
grant execute on function public.replace_thought_thread(uuid, text, text, text, uuid[]) to authenticated;
