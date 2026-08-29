-- Applied to production as migration: thought_threads_v1_hardening
--
-- Claude's interrupted audit had already created the base thought_threads and
-- thought_thread_items tables (both empty). This migration records the exact v1 upgrade from
-- that live base: ownership-key hardening, stable item ordering, edit policy, and atomic RPCs.
-- It is intentionally a one-time migration, not an idempotent schema bootstrap.

alter table public.annotations
  add constraint annotations_id_user_id_key unique (id, user_id);

alter table public.thought_threads
  add constraint thought_threads_id_user_id_key unique (id, user_id);

alter table public.thought_threads
  add constraint thought_threads_title_length_check
  check (char_length(btrim(title)) <= 200);

alter table public.thought_thread_items
  add column position integer not null default 0;

alter table public.thought_thread_items
  add constraint thought_thread_items_position_check check (position >= 0);

alter table public.thought_thread_items
  add constraint thought_thread_items_thread_owner_fk
    foreign key (thread_id, user_id)
    references public.thought_threads(id, user_id)
    on delete cascade;

alter table public.thought_thread_items
  add constraint thought_thread_items_annotation_owner_fk
    foreign key (annotation_id, user_id)
    references public.annotations(id, user_id)
    on delete cascade;

create policy thought_thread_items_update_own on public.thought_thread_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant update on public.thought_thread_items to authenticated;

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
