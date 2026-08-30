import {
  getSession,
  getValidAccessToken,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from "../auth/supabaseAuth";

const THREADS_ENDPOINT = `${SUPABASE_URL}/rest/v1/thought_threads`;
const ITEMS_ENDPOINT = `${SUPABASE_URL}/rest/v1/thought_thread_items`;
const RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc`;

export interface ThoughtThread {
  id: string;
  title: string;
  question: string | null;
  synthesisNote: string | null;
  annotationIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ThreadRow {
  id: string;
  user_id: string;
  title: string;
  question: string | null;
  synthesis_note: string | null;
  created_at: string;
  updated_at: string;
}

interface ThreadItemRow {
  thread_id: string;
  annotation_id: string;
  position: number;
  created_at: string;
}

const NOT_AUTHENTICATED = "Не авторизован.";

async function authContext(extra?: Record<string, string>): Promise<{
  headers: Record<string, string>;
  userId: string;
}> {
  const session = getSession();
  const token = await getValidAccessToken();
  if (!session || !token) throw new Error(NOT_AUTHENTICATED);

  return {
    userId: session.user.id,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra
    }
  };
}

async function throwOnError(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => "");
  console.error(`thoughtThreads ${action} failed (${response.status}):`, detail);
  throw new Error(`Не удалось выполнить действие с нитью мысли (${action}).`);
}

// MERGE-GATE CORRECTION: the single, shared definition of "this response
// means the visitor needs to sign in again" -- used by BOTH
// appendAnnotationToThoughtThread() below and listThoughtThreads() (see
// throwOnLoadError below it), so the two paths can never drift apart on
// what counts as an auth rejection. Deliberately NOT duplicated as a
// second PGRST301/302/303 list anywhere else in this file or in
// src/features/reader/threadBridge.ts.
//
// PGRST301/PGRST302/PGRST303 are PostgREST's own pre-RPC/pre-query
// rejection codes for an expired/invalid/missing Bearer JWT (verified
// against PostgREST's error reference -- see the longer citation further
// below, kept there since that is where these codes were first
// introduced in this file). 42501 is the SQLSTATE our own RPCs raise for
// "auth.uid() is null" and is also Postgres's native "insufficient
// privilege" code, so it is treated the same way here. A bare HTTP 401
// with no recognized `code` at all (empty/unparseable body) also counts
// -- PostgREST reports its own pre-RPC/pre-query rejections as 401
// regardless of whether the body could be parsed. A bare 403 is
// deliberately NOT included: PostgREST/RLS also use 403 for ordinary
// "not permitted" cases with a perfectly valid token, so treating any
// 403 as session-expiry would be a false positive, not a fix.
const AUTH_REJECTION_CODES = new Set(["42501", "PGRST301", "PGRST302", "PGRST303"]);

function isAuthRejection(status: number, code: string | undefined): boolean {
  return (!!code && AUTH_REJECTION_CODES.has(code)) || status === 401;
}

// MERGE-GATE CORRECTION: listThoughtThreads()'s own stable, typed
// failure discriminant -- mirrors ThoughtThreadAppendError further below
// (same two-value "not_authenticated" | "generic" shape covers
// everything a caller here needs; there is no per-item AK001/AK002
// equivalent for a plain list load). Exists so
// src/features/reader/threadBridge.ts's list() can classify a
// PostgREST-level pre-query JWT rejection exactly the same way
// addAnnotation() already classifies a PostgREST-level pre-RPC one,
// without comparing user-visible Russian message text as the primary
// mechanism.
export type ThoughtThreadLoadErrorKind = "not_authenticated" | "generic";

export class ThoughtThreadLoadError extends Error {
  readonly kind: ThoughtThreadLoadErrorKind;
  constructor(kind: ThoughtThreadLoadErrorKind, message: string) {
    super(message);
    this.name = "ThoughtThreadLoadError";
    this.kind = kind;
  }
}

const LOAD_FAILURE_MESSAGE = "Не удалось загрузить нити мысли.";

// Same responsibility as throwOnError() above, but for listThoughtThreads()
// specifically: classifies the failure via isAuthRejection() instead of
// always producing an undiscriminated generic Error. throwOnError() itself
// is left untouched -- it is still shared by create/replace/add-item/
// remove-item/delete, none of which this correction pass touches or needs
// typed auth classification for.
async function throwOnLoadError(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const detail = await response.json().catch(() => null) as { code?: string } | null;
  console.error(`thoughtThreads ${action} failed (${response.status}):`, detail?.code ?? "");
  if (isAuthRejection(response.status, detail?.code)) {
    throw new ThoughtThreadLoadError("not_authenticated", NOT_AUTHENTICATED);
  }
  throw new ThoughtThreadLoadError("generic", LOAD_FAILURE_MESSAGE);
}

function fromRows(thread: ThreadRow, items: ThreadItemRow[]): ThoughtThread {
  return {
    id: thread.id,
    title: thread.title,
    question: thread.question,
    synthesisNote: thread.synthesis_note,
    annotationIds: items
      .filter(item => item.thread_id === thread.id)
      .sort((left, right) => left.position - right.position || left.created_at.localeCompare(right.created_at))
      .map(item => item.annotation_id),
    createdAt: thread.created_at,
    updatedAt: thread.updated_at
  };
}

// Two requests total, never N+1: one for all of the current user's Thread rows and one for
// all relation rows. RLS on both tables supplies the user filter, while the API combines them
// locally so a Thread that has lost all annotations still survives and renders its synthesis.
//
// MERGE-GATE CORRECTION: this is the symmetric fix to appendAnnotationToThoughtThread()'s own
// PostgREST-pre-RPC-JWT-rejection handling. Both the initial picker load (this function) and
// the later atomic append must recognize the SAME class of server-side rejection the SAME way,
// via ThoughtThreadLoadError's typed "not_authenticated" kind -- never via an undiscriminated
// generic Error, and never by duplicating the PGRST301/302/303 list anywhere else (see
// isAuthRejection() above, the single shared source of truth for both paths). A local
// missing-session/token failure, a PostgREST-level pre-query JWT rejection on EITHER request,
// and a rejection on both requests all resolve to the exact same ThoughtThreadLoadError kind,
// so a caller only ever needs to check one shape regardless of where the failure happened.
// An ordinary 403/500/network failure still resolves to "generic" -- 0 Threads remains
// reachable only via two genuinely successful, empty responses, never as a stand-in for a
// swallowed auth failure.
export async function listThoughtThreads(): Promise<ThoughtThread[]> {

  let headers: Record<string, string>;
  try {
    ({ headers } = await authContext());
  } catch {
    throw new ThoughtThreadLoadError("not_authenticated", NOT_AUTHENTICATED);
  }

  let threadsResponse: Response;
  let itemsResponse: Response;
  try {
    [threadsResponse, itemsResponse] = await Promise.all([
      fetch(
        `${THREADS_ENDPOINT}?select=id,user_id,title,question,synthesis_note,created_at,updated_at&order=updated_at.desc`,
        { headers }
      ),
      fetch(
        `${ITEMS_ENDPOINT}?select=thread_id,annotation_id,position,created_at&order=position.asc,created_at.asc`,
        { headers }
      )
    ]);
  } catch (networkError) {
    console.error("thoughtThreads list network failure:", networkError);
    throw new ThoughtThreadLoadError("generic", LOAD_FAILURE_MESSAGE);
  }

  await throwOnLoadError(threadsResponse, "list-threads");
  await throwOnLoadError(itemsResponse, "list-items");

  const threads = (await threadsResponse.json()) as ThreadRow[];
  const items = (await itemsResponse.json()) as ThreadItemRow[];
  return threads.map(thread => fromRows(thread, items));
}

export interface ThoughtThreadInput {
  title: string;
  question: string | null;
  synthesisNote: string | null;
  annotationIds: string[];
}

// Creation is one database transaction. The RPC verifies >=2 distinct annotations and proves
// that every annotation belongs to auth.uid() before inserting either the Thread or its items.
export async function createThoughtThread(input: ThoughtThreadInput): Promise<string> {
  const { headers } = await authContext();
  const response = await fetch(`${RPC_ENDPOINT}/create_thought_thread`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_title: input.title,
      p_question: input.question,
      p_synthesis_note: input.synthesisNote,
      p_annotation_ids: input.annotationIds
    })
  });
  await throwOnError(response, "create");
  const id = (await response.json()) as string;
  if (!id) throw new Error("Не удалось создать нить мысли.");
  return id;
}

// THOUGHT THREAD OPTIMISTIC CONCURRENCY v1: a stable, dedicated
// discriminant for replaceThoughtThread()'s failure modes -- mirrors
// ThoughtThreadAppendError's own shape (same reasoning: a caller here,
// src/features/atlas/AtlasView.tsx's Thread editor, needs to tell
// "session expired" apart from "Thread no longer exists" apart from
// "annotation no longer available" apart from "someone else changed this
// Thread since you opened it" apart from an ordinary network/server
// failure, and matching message text is fragile). "conflict" is new:
// there was never a stale-overwrite possibility for this RPC before, so
// no prior kind covers it.
export type ThoughtThreadReplaceErrorKind =
  | "not_authenticated"
  | "thread_unavailable"
  | "annotation_unavailable"
  | "conflict"
  | "generic";

export class ThoughtThreadReplaceError extends Error {
  readonly kind: ThoughtThreadReplaceErrorKind;
  constructor(kind: ThoughtThreadReplaceErrorKind, message: string) {
    super(message);
    this.name = "ThoughtThreadReplaceError";
    this.kind = kind;
  }
}

// Mirrors the distinct, stable SQLSTATEs replace_thought_thread's own SQL
// raises (see supabase/sql/thought_threads_optimistic_concurrency_migration.sql).
// AK001/AK002 are the SAME codes append_annotation_to_thought_thread
// already uses for the same two meanings (replace_thought_thread used to
// raise plain 42501 for both -- the SAME code reserved for
// "not authenticated" -- which would have made a not-found Thread or an
// unavailable annotation misclassify as a session expiry here; that was
// fixed as part of introducing this typed classification, not left as
// latent ambiguity). AK003 is new: a genuine optimistic-concurrency
// conflict, never raised by any other function in this schema. The
// auth-specific codes are deliberately NOT listed here -- see
// isAuthRejection() above, the single shared source of truth also used
// by appendAnnotationToThoughtThread() and listThoughtThreads().
const REPLACE_ERROR_CODE_KIND: Record<string, ThoughtThreadReplaceErrorKind> = {
  "AK001": "thread_unavailable",
  "AK002": "annotation_unavailable",
  "AK003": "conflict"
};

const REPLACE_FAILURE_MESSAGE = "Не удалось сохранить нить мысли.";

// Atomic metadata + membership replacement, now gated on optimistic
// concurrency control: expectedUpdatedAt must be the exact updated_at
// string this caller most recently read for this Thread (never
// reformatted through a client-side Date object, which would risk
// truncating precision the server compares exactly). If the Thread's
// current updated_at no longer matches -- someone else (another Atlas
// editor, or Reader's own atomic append) saved a change since this
// caller last read the Thread -- the server performs NO write at all
// (see replace_thought_thread's own SQL) and this throws a "conflict"
// kind instead. 0/1 items remain legal, same as before, so a Thread can
// survive source annotation deletion without destroying the user's
// synthesis.
export async function replaceThoughtThread(
  threadId: string,
  input: ThoughtThreadInput,
  expectedUpdatedAt: string
): Promise<void> {

  let headers: Record<string, string>;
  try {
    ({ headers } = await authContext());
  } catch {
    throw new ThoughtThreadReplaceError("not_authenticated", NOT_AUTHENTICATED);
  }

  let response: Response;
  try {
    response = await fetch(`${RPC_ENDPOINT}/replace_thought_thread`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_thread_id: threadId,
        p_title: input.title,
        p_question: input.question,
        p_synthesis_note: input.synthesisNote,
        p_annotation_ids: input.annotationIds,
        p_expected_updated_at: expectedUpdatedAt
      })
    });
  } catch (networkError) {
    console.error("thoughtThreads replace network failure:", networkError);
    throw new ThoughtThreadReplaceError("generic", REPLACE_FAILURE_MESSAGE);
  }

  if (response.ok) return;

  const detail = await response.json().catch(() => null) as { code?: string } | null;
  console.error(`thoughtThreads replace failed (${response.status}):`, detail?.code ?? "");

  // Same precedence as appendAnnotationToThoughtThread(): isAuthRejection()
  // first (covers a PostgREST-level pre-RPC JWT rejection too, not just
  // the RPC's own 42501), then the RPC-specific code map, then generic.
  const kind: ThoughtThreadReplaceErrorKind = isAuthRejection(response.status, detail?.code)
    ? "not_authenticated"
    : (detail?.code && REPLACE_ERROR_CODE_KIND[detail.code]) || "generic";
  throw new ThoughtThreadReplaceError(kind, REPLACE_FAILURE_MESSAGE);

}

// Explicit low-level relation operations are available for future smaller interactions. The
// composite foreign keys in SQL still prove that thread, annotation and user_id all have the
// same owner, even if a caller bypasses this frontend entirely.
export async function addAnnotationToThoughtThread(
  threadId: string,
  annotationId: string,
  position = 0
): Promise<void> {
  const { headers, userId } = await authContext({ Prefer: "return=minimal" });
  const response = await fetch(ITEMS_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      thread_id: threadId,
      annotation_id: annotationId,
      user_id: userId,
      position
    })
  });
  await throwOnError(response, "add-item");
}

// READER -> THOUGHT THREAD BRIDGE v1, CORRECTION PASS: a stable,
// dedicated discriminant for appendAnnotationToThoughtThread()'s failure
// modes -- deliberately NOT the generic user-visible Russian string
// throwOnError() produces elsewhere in this file, because a caller here
// (src/features/reader/threadBridge.ts) needs to tell "session expired"
// apart from "Thread no longer exists" apart from "annotation no longer
// available" apart from an ordinary network/server failure, and matching
// message text is fragile. "not_authenticated" also covers the ordinary
// local case (no session / token refresh failed, same as authContext()
// throws everywhere else in this file) so callers only ever need to
// switch on ONE error shape regardless of whether the failure happened
// before or during the request.
export type ThoughtThreadAppendErrorKind =
  | "not_authenticated"
  | "thread_unavailable"
  | "annotation_unavailable"
  | "generic";

export class ThoughtThreadAppendError extends Error {
  readonly kind: ThoughtThreadAppendErrorKind;
  constructor(kind: ThoughtThreadAppendErrorKind, message: string) {
    super(message);
    this.name = "ThoughtThreadAppendError";
    this.kind = kind;
  }
}

// Mirrors the distinct, stable SQLSTATEs
// append_annotation_to_thought_thread's own SQL raises (see
// supabase/sql/thought_threads_append_annotation_migration.sql) --
// PostgREST surfaces a raised PL/pgSQL exception's SQLSTATE verbatim as
// the RPC error response body's `code` field, so this is a genuine
// server-controlled discriminant, not a parsed message string.
//
// MERGE-GATE CORRECTION: the auth-specific codes (42501, and PostgREST's
// own PGRST301/302/303 pre-RPC rejection codes, plus the bare-401
// fallback) used to live in THIS map. They have moved to the single
// shared isAuthRejection() helper defined near throwOnError() above,
// which is now also used by listThoughtThreads()'s own auth
// classification (see throwOnLoadError() above) -- so the two paths
// read from exactly one source of truth for "what counts as an auth
// rejection" and can never drift apart. This map now only needs to
// carry the codes that are NOT about authentication: AK001/AK002.
const APPEND_ERROR_CODE_KIND: Record<string, ThoughtThreadAppendErrorKind> = {
  "AK001": "thread_unavailable",
  "AK002": "annotation_unavailable"
};

const APPEND_FAILURE_MESSAGE = "Не удалось выполнить действие с нитью мысли (append).";

// Atomic single-annotation append via append_annotation_to_thought_thread
// (security definer, row-locked on the Thread -- see that RPC's own SQL
// for the full atomicity/ownership/ordering/idempotency proof). Adds
// exactly one thought_thread_item and, only when that item is new, bumps
// thought_threads.updated_at -- title/question/synthesisNote and every
// other existing item are left completely untouched, unlike
// replaceThoughtThread (still the correct call for the actual Thread
// editor's full metadata+membership edits). Idempotent: calling this
// again for an annotation already in the Thread resolves successfully
// without a duplicate row or a second updated_at bump.
export async function appendAnnotationToThoughtThread(threadId: string, annotationId: string): Promise<void> {

  let headers: Record<string, string>;
  try {
    ({ headers } = await authContext());
  } catch {
    throw new ThoughtThreadAppendError("not_authenticated", NOT_AUTHENTICATED);
  }

  let response: Response;
  try {
    response = await fetch(`${RPC_ENDPOINT}/append_annotation_to_thought_thread`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_thread_id: threadId, p_annotation_id: annotationId })
    });
  } catch (networkError) {
    console.error("thoughtThreads append network failure:", networkError);
    throw new ThoughtThreadAppendError("generic", APPEND_FAILURE_MESSAGE);
  }

  if (response.ok) return;

  // Only the SQLSTATE `code` is read from the body -- never annotation
  // quote/note text or Thread title/question, none of which this RPC's
  // error response would even carry, but kept minimal on principle to
  // match this file's existing logging discipline.
  const detail = await response.json().catch(() => null) as { code?: string } | null;
  console.error(`thoughtThreads append failed (${response.status}):`, detail?.code ?? "");

  // isAuthRejection() (defined near throwOnError() above, shared with
  // listThoughtThreads()'s own throwOnLoadError()) is checked FIRST: it
  // covers 42501, PostgREST's own PGRST301/302/303 pre-RPC rejection
  // codes, and a bare HTTP 401 with an unexpected/empty body. Only once
  // that is ruled out do AK001/AK002 get a chance -- so an auth
  // rejection can never be shadowed by an unrelated code collision, and
  // there is exactly one place (isAuthRejection) that decides what
  // counts as "please sign in again" for both the append and list paths.
  const kind: ThoughtThreadAppendErrorKind = isAuthRejection(response.status, detail?.code)
    ? "not_authenticated"
    : (detail?.code && APPEND_ERROR_CODE_KIND[detail.code]) || "generic";
  throw new ThoughtThreadAppendError(kind, APPEND_FAILURE_MESSAGE);

}

export async function removeAnnotationFromThoughtThread(threadId: string, annotationId: string): Promise<void> {
  const { headers } = await authContext({ Prefer: "return=minimal" });
  const response = await fetch(
    `${ITEMS_ENDPOINT}?thread_id=eq.${encodeURIComponent(threadId)}&annotation_id=eq.${encodeURIComponent(annotationId)}`,
    { method: "DELETE", headers }
  );
  await throwOnError(response, "remove-item");
}

export async function deleteThoughtThread(threadId: string): Promise<void> {
  const { headers } = await authContext({ Prefer: "return=minimal" });
  const response = await fetch(`${THREADS_ENDPOINT}?id=eq.${encodeURIComponent(threadId)}`, {
    method: "DELETE",
    headers
  });
  await throwOnError(response, "delete");
}
