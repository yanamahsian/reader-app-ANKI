-- Applied to production as migration: thought_threads_optimistic_concurrency_v1
--
-- THOUGHT THREAD OPTIMISTIC CONCURRENCY v1 -- closes the last stale-overwrite
-- window in the Thought Thread feature: the Atlas full Thread editor.
--
-- Reader -> Thought Thread Bridge v1 already made single-annotation appends
-- race-free via append_annotation_to_thought_thread's row lock (see
-- thought_threads_append_annotation_migration.sql). That RPC is UNCHANGED by
-- this migration -- not touched, not re-created, not re-granted.
--
-- The remaining risk was replace_thought_thread, which the Atlas editor
-- still calls for full metadata + membership edits. Its OLD shape:
--   1. UI opens a Thread, holding a CLIENT-SIDE snapshot of its fields.
--   2. UI edits locally for an arbitrary amount of time (no lock held).
--   3. UI calls replace_thought_thread(thread_id, title, question,
--      synthesis_note, annotation_ids) -- no notion of "which version was
--      this edit based on".
--   4. The RPC unconditionally UPDATEs metadata, DELETEs every existing
--      thought_thread_items row, and INSERTs whatever array it was given.
-- If ANYTHING else wrote to the same Thread between step 1 and step 3 --
-- most concretely, Reader's own atomic append adding a new annotation --
-- that write is silently destroyed the instant step 4 lands, because the
-- snapshot step 3 sends was never aware of it. This is the canonical
-- lost-update race, and until this migration nothing prevented it.
--
-- FIX: optimistic concurrency control keyed on thought_threads.updated_at,
-- the column every write to a Thread already bumps (both
-- replace_thought_thread itself and append_annotation_to_thought_thread).
-- No new column, no integer version counter -- updated_at is already a
-- monotonically-advancing, per-row, transaction-timestamped value with
-- microsecond precision that every writer already maintains, and the API
-- layer already returns it verbatim (as the exact string PostgREST/Postgres
-- produced) on every listThoughtThreads() read. That is a sufficient
-- optimistic-concurrency token: the editor captures the updated_at it saw
-- when it opened the Thread and must echo it back unchanged at save time.
--
-- replace_thought_thread's SIGNATURE changes (a 6th parameter,
-- p_expected_updated_at, is now REQUIRED) -- this is a genuine, deliberate
-- backward-incompatible replacement, not an additive overload: the OLD
-- 5-argument signature is explicitly DROPPED below, not left callable
-- alongside the new one. Leaving it callable would mean any caller that
-- simply omitted the new parameter could silently bypass OCC entirely,
-- which would defeat the entire point of this migration. The single real
-- caller (src/features/atlas/AtlasView.tsx's handleSaveThread()) is updated
-- in the same commit as this migration, so there is no live caller left on
-- the old signature to break.
--
-- Two error-code corrections bundled into this same rewrite, both required
-- for the new typed client-side classification (ThoughtThreadReplaceError)
-- to actually work, not scope creep:
--   * "Thread not found" used to raise errcode 42501 (the SAME code used
--     for "not authenticated"), which would have made a not-found Thread
--     misclassify as a session-expiry on the client. Now raises AK001,
--     the exact code append_annotation_to_thought_thread already uses for
--     the identical meaning ("Thread no longer exists / not yours").
--   * "One or more annotations are unavailable" used to raise 42501 too,
--     for the same reason. Now raises AK002, matching
--     append_annotation_to_thought_thread's own existing meaning.
--   * New: a genuine optimistic-concurrency conflict raises AK003 --
--     never previously used by any function in this schema.
-- 42501 is now reserved, consistently across both RPCs, for exactly one
-- meaning: "not authenticated" (auth.uid() is null). This is what lets the
-- client's already-shared isAuthRejection() helper (src/api/thoughtThreads.ts)
-- classify replace's auth failures without any new, duplicated code list.
create or replace function public.replace_thought_thread(
  p_thread_id uuid,
  p_title text,
  p_question text,
  p_synthesis_note text,
  p_annotation_ids uuid[],
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_locked_thread_id uuid;
  v_current_updated_at timestamptz;
  v_expected integer;
  v_owned integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null then
    raise exception 'Thread title is required' using errcode = '22023';
  end if;

  -- Row lock FIRST, combined with the ownership check and the version
  -- read, in ONE statement -- exactly the pattern
  -- append_annotation_to_thought_thread already established. Doing the
  -- ownership check and the lock as two separate statements would
  -- reopen a TOCTOU gap between them; doing them together means the
  -- v_current_updated_at value read here is guaranteed to be the true,
  -- currently-committed value, held stable for the rest of this
  -- transaction (a concurrent writer trying to touch this same Thread
  -- row -- including a concurrent append -- blocks until this
  -- transaction commits or rolls back).
  select t.id, t.updated_at into v_locked_thread_id, v_current_updated_at
  from public.thought_threads t
  where t.id = p_thread_id and t.user_id = v_user_id
  for update;

  if v_locked_thread_id is null then
    raise exception 'Thought Thread not found or no longer available' using errcode = 'AK001';
  end if;

  -- THE optimistic-concurrency check. IS DISTINCT FROM (rather than <>)
  -- deliberately treats a null p_expected_updated_at as a guaranteed
  -- conflict rather than a silently-skipped comparison -- there is no
  -- legitimate caller that has "no version to compare", so a missing
  -- token must never be treated as a pass. Comparison is a plain
  -- timestamptz equality: p_expected_updated_at is expected to be the
  -- exact string the client previously received from a real read of
  -- this same column (see src/api/thoughtThreads.ts and
  -- src/features/atlas/AtlasView.tsx -- passed through unmodified, never
  -- reformatted via a client-side Date object, which would risk
  -- silently truncating the sub-millisecond precision timestamptz
  -- actually carries).
  --
  -- On conflict: raise immediately, BEFORE any UPDATE/DELETE/INSERT
  -- below. The row lock taken above is released when this exception
  -- aborts the transaction -- nothing about the Thread (title,
  -- question, synthesis_note, items, positions, updated_at) is written,
  -- exactly as required. AK003 is a new, distinct, stable SQLSTATE,
  -- never reused by any other exception in this schema.
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception 'Thought Thread was modified since it was opened for editing' using errcode = 'AK003';
  end if;

  -- From here on this is the SAME full-replace semantics
  -- replace_thought_thread has always had -- unchanged validation order,
  -- unchanged annotation-ownership rule, unchanged delete+reinsert
  -- membership replacement, unchanged 0/1-item legality. Only now
  -- provably gated on the version check above.
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
    raise exception 'One or more annotations are unavailable' using errcode = 'AK002';
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

-- The OLD 5-argument overload is a genuinely different signature to
-- Postgres/PostgREST -- CREATE OR REPLACE above does not remove it. It
-- must be dropped explicitly, or it would remain live as an
-- OCC-bypassing back door (any caller that simply omits the 6th
-- argument would silently skip the version check entirely).
drop function if exists public.replace_thought_thread(uuid, text, text, text, uuid[]);

revoke all on function public.replace_thought_thread(uuid, text, text, text, uuid[], timestamptz) from public, anon;
grant execute on function public.replace_thought_thread(uuid, text, text, text, uuid[], timestamptz) to authenticated;
