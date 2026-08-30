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
export async function listThoughtThreads(): Promise<ThoughtThread[]> {
  const { headers } = await authContext();

  const [threadsResponse, itemsResponse] = await Promise.all([
    fetch(
      `${THREADS_ENDPOINT}?select=id,user_id,title,question,synthesis_note,created_at,updated_at&order=updated_at.desc`,
      { headers }
    ),
    fetch(
      `${ITEMS_ENDPOINT}?select=thread_id,annotation_id,position,created_at&order=position.asc,created_at.asc`,
      { headers }
    )
  ]);

  await throwOnError(threadsResponse, "list-threads");
  await throwOnError(itemsResponse, "list-items");

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

// Atomic metadata + membership replacement. This avoids showing success after only half of an
// edit has reached Supabase. Unlike create, 0/1 items are legal so a Thread can survive source
// annotation deletion without destroying the user's synthesis.
export async function replaceThoughtThread(threadId: string, input: ThoughtThreadInput): Promise<void> {
  const { headers } = await authContext();
  const response = await fetch(`${RPC_ENDPOINT}/replace_thought_thread`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_thread_id: threadId,
      p_title: input.title,
      p_question: input.question,
      p_synthesis_note: input.synthesisNote,
      p_annotation_ids: input.annotationIds
    })
  });
  await throwOnError(response, "replace");
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
// server-controlled discriminant, not a parsed message string. 42501 is
// also what create_thought_thread/replace_thought_thread already raise
// for "Authentication required", reused here for the same meaning.
//
// CORRECTION PASS: an expired/invalid/missing Bearer JWT can be
// rejected by PostgREST itself BEFORE the RPC ever runs -- in that
// case append_annotation_to_thought_thread() never executes, so its
// own "auth.uid() is null" -> 42501 path is never reached at all, and
// the error body instead carries one of PostgREST's OWN authentication
// error codes (source: PostgREST's error reference, "Authentication"
// group -- https://docs.postgrest.org/en/stable/references/errors.html):
//   PGRST301 -- "JWT couldn't be decoded or it is invalid" (expired/malformed)
//   PGRST302 -- request without Bearer auth while the anonymous role is disabled
//   PGRST303 -- JWT claims validation/parsing failed
// All three are genuinely "please sign in again" cases, so they map to
// the same not_authenticated kind as 42501. PGRST300 ("no JWT secret
// configured on the server") is deliberately NOT included -- that is a
// server misconfiguration no amount of re-authenticating fixes, so it
// is left to fall through to "generic" rather than telling the visitor
// their session expired.
const APPEND_ERROR_CODE_KIND: Record<string, ThoughtThreadAppendErrorKind> = {
  "42501": "not_authenticated",
  "PGRST301": "not_authenticated",
  "PGRST302": "not_authenticated",
  "PGRST303": "not_authenticated",
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

  // Preferred rule: a known PostgREST/RPC SQLSTATE code wins when present;
  // otherwise fall back to the HTTP status itself. This matters because a
  // PostgREST-level pre-RPC rejection (expired/invalid/missing Bearer JWT)
  // can arrive with an unexpected or empty JSON body -- no `code` field at
  // all -- yet PostgREST still reports it as HTTP 401. Treating bare 401
  // as not_authenticated even without a recognized `code` closes that
  // gap. Deliberately NOT done for 403: PostgREST/RLS also uses 403 for
  // ordinary "not permitted" cases unrelated to session expiry (e.g. RLS
  // denial with a valid token), so a bare 403 stays "generic" rather than
  // being misreported as "session expired".
  const kind = (detail?.code && APPEND_ERROR_CODE_KIND[detail.code])
    || (response.status === 401 ? "not_authenticated" : "generic");
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
