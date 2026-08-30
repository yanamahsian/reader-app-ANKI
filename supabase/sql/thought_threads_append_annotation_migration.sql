-- Applied to production as migration: thought_threads_append_annotation_v1
--
-- READER -> THOUGHT THREAD BRIDGE v1, CORRECTION PASS: replaces the bridge's
-- earlier "fetch full Thread, append client-side, replace_thought_thread()"
-- write path with a single atomic append RPC.
--
-- The earlier path had a genuine TOCTOU / lost-update window: it read the
-- Thread's full annotationIds snapshot, then (moments later, after network
-- round trips) wrote that ENTIRE snapshot back via replace_thought_thread,
-- which deletes every existing thought_thread_items row for the Thread and
-- re-inserts the array it was given. Any OTHER write to the same Thread
-- landing inside that read-to-write gap -- another tab's own append, or an
-- edit from the Atlas Thread editor -- would be silently discarded the
-- moment this write landed, because the snapshot this call was built from
-- never saw it. Fresh-fetch-immediately-before-write (the earlier
-- mitigation) shrinks that window but cannot close it: TOCTOU is inherent
-- to any read/modify/replace-whole-collection pattern, no matter how
-- recent the read is.
--
-- append_annotation_to_thought_thread fixes this at the only place it can
-- actually be fixed: inside a single Postgres transaction, under a row
-- lock on the Thread itself, so two concurrent appends to the same Thread
-- serialize instead of racing, and neither can ever observe or produce a
-- lost update. It is a narrow, single-purpose primitive -- it ONLY adds
-- one relation row and (only when that row is new) bumps updated_at. It
-- never touches title/question/synthesis_note/other items, unlike
-- replace_thought_thread, which remains completely unchanged and is still
-- the correct RPC for the actual Thread editor (full metadata + membership
-- edits, reordering, removal).
create or replace function public.append_annotation_to_thought_thread(
  p_thread_id uuid,
  p_annotation_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_locked_thread_id uuid;
  v_already_member boolean;
  v_next_position integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Row lock on the Thread itself: any second concurrent call for the
  -- SAME thread_id (whether another append, or a future second append
  -- primitive) blocks here until this transaction commits or rolls
  -- back. That is what makes the duplicate-check and the position
  -- computation below race-free -- a concurrent append is never
  -- computing "next position" from a view of the table that is about
  -- to change out from under it, and two concurrent appends of the
  -- same annotation can never both decide "not yet a member".
  --
  -- This does NOT lock (or touch) thought_thread_items rows, and does
  -- NOT block replace_thought_thread()'s own full-Thread edits from a
  -- DIFFERENT transaction that isn't also trying to touch this same
  -- thought_threads row concurrently in an overlapping window --
  -- ownership is still re-verified in the same statement.
  select t.id into v_locked_thread_id
  from public.thought_threads t
  where t.id = p_thread_id and t.user_id = v_user_id
  for update;

  if v_locked_thread_id is null then
    -- Distinct, stable SQLSTATE (never reused by any other exception
    -- in this function) so the API layer can classify this precisely
    -- as "Thread no longer exists" without parsing message text --
    -- see src/api/thoughtThreads.ts's own appendAnnotationToThoughtThread.
    raise exception 'Thought Thread not found or no longer available' using errcode = 'AK001';
  end if;

  if not exists (
    select 1 from public.annotations a
    where a.id = p_annotation_id and a.user_id = v_user_id
  ) then
    raise exception 'Annotation not found or no longer available' using errcode = 'AK002';
  end if;

  select exists (
    select 1 from public.thought_thread_items i
    where i.thread_id = p_thread_id and i.annotation_id = p_annotation_id
  ) into v_already_member;

  -- Idempotent success: the visitor (or another tab) already added
  -- this exact annotation to this exact Thread. No duplicate row (the
  -- thought_thread_items_unique_pair constraint would reject one
  -- anyway), no item reordering, and -- deliberately -- no
  -- updated_at bump: nothing about the Thread's actual content
  -- changed as a result of THIS call, so it should not look like an
  -- edit just happened.
  if v_already_member then
    return;
  end if;

  select coalesce(max(position), -1) + 1
  into v_next_position
  from public.thought_thread_items
  where thread_id = p_thread_id;

  insert into public.thought_thread_items(thread_id, annotation_id, user_id, position)
  values (p_thread_id, p_annotation_id, v_user_id, v_next_position);

  -- Only updated_at -- title/question/synthesis_note and every other
  -- existing item are untouched by this statement.
  update public.thought_threads
  set updated_at = now()
  where id = p_thread_id and user_id = v_user_id;
end;
$$;

revoke all on function public.append_annotation_to_thought_thread(uuid, uuid) from public, anon;
grant execute on function public.append_annotation_to_thought_thread(uuid, uuid) to authenticated;
