// USER LIBRARY PHASE: "Моя библиотека" -- a real Supabase-backed personal
// shelf, not a localStorage-only mock (see the written report for the
// full requirement). Talks directly to PostgREST (public.user_library),
// the same pattern this project's rights/catalog tables deliberately do
// NOT use (they're service-role-only, read through Edge Functions --
// see omnia-library-catalog's own comment) but which IS the correct,
// standard shape for real end-user-owned rows: RLS itself restricts
// every request below to auth.uid() = user_id (see
// supabase/sql/user_library_and_reader_progress.sql), so no service-role
// key or Edge Function is needed just to let a signed-in visitor read or
// write their own rows.
import { getValidAccessToken } from "../auth/supabaseAuth";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../auth/supabaseAuth";
import { mergeLibraryPage } from "../catalog";
import type { Book as CatalogBook, Author } from "../catalog/types";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/user_library`;
const CATALOG_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-library-catalog`;

export type LibraryStatus = "want_to_read" | "reading" | "finished";

export interface LibraryEntry {
  id: string;
  workId: string;
  status: LibraryStatus;
  addedAt: string;
  updatedAt: string;
  lastEditionId: string | null;
  lastLanguage: string | null;
}

interface LibraryEntryRow {
  id: string;
  work_id: string;
  status: LibraryStatus;
  added_at: string;
  updated_at: string;
  last_edition_id: string | null;
  last_language: string | null;
}

function fromRow(row: LibraryEntryRow): LibraryEntry {
  return {
    id: row.id,
    workId: row.work_id,
    status: row.status,
    addedAt: row.added_at,
    updatedAt: row.updated_at,
    lastEditionId: row.last_edition_id,
    lastLanguage: row.last_language
  };
}

// Every function below throws a plain Error with this message when
// called while signed out -- callers (BookDetailView, MyLibraryView)
// are expected to already gate these actions on useAuth().isAuthenticated
// (requirement #4: no anonymous local shelf, no silent no-op), so this
// is a genuine "should never happen" guard, not the primary UX path for
// a guest visitor.
const NOT_AUTHENTICATED = "Не авторизован.";

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new Error(NOT_AUTHENTICATED);
  return {
    "apikey": SUPABASE_PUBLISHABLE_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function throwOnError(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  // PostgREST error bodies can carry internal detail (constraint names,
  // column names) -- logged for diagnosis, never surfaced verbatim to
  // the UI, same posture omnia-library-catalog's own serverErrorResponse
  // already takes for the equivalent server-side case.
  const detail = await response.text().catch(() => "");
  console.error(`user_library ${action} failed (${response.status}):`, detail);
  throw new Error(`Не удалось выполнить действие с библиотекой (${action}).`);
}

// Requirement #12 (idempotency): Prefer: resolution=ignore-duplicates
// turns this into INSERT ... ON CONFLICT (user_id, work_id) DO NOTHING
// at the database level -- a second "Добавить в библиотеку" click for
// the same Work is a genuine no-op, never a duplicate row, never an
// error, and critically never resets an already-'reading'/'finished'
// row back to 'want_to_read' (which a naive upsert-with-merge would do).
//
// BUG FOUND DURING LIVE SCENARIO C TESTING: `resolution=ignore-duplicates`
// alone, with no `?on_conflict=` query param, made PostgREST resolve the
// ON CONFLICT against this table's PRIMARY KEY (id) -- a fresh UUID every
// call, so it never actually conflicts -- rather than against the real
// unique(user_id, work_id) constraint this whole idempotency guarantee
// depends on. The plain INSERT then fell through to that unique
// constraint for real and PostgREST returned a genuine 409 (confirmed
// live: POSTing the same {user_id, work_id} twice raised
// `duplicate key value violates unique constraint
// "user_library_user_id_work_id_key"`), which throwOnError below would
// have surfaced as an error to a visitor's second "Добавить в
// библиотеку" click -- exactly the opposite of the no-op requirement.
// Appending `?on_conflict=user_id,work_id` tells PostgREST which
// constraint to resolve against, at which point the same live test
// returned 201 with an empty body, the correct idempotent no-op.
export async function addToLibrary(userId: string, workId: string): Promise<void> {
  const headers = await authHeaders({ "Prefer": "resolution=ignore-duplicates,return=minimal" });
  const response = await fetch(`${TABLE_ENDPOINT}?on_conflict=user_id,work_id`, {
    method: "POST",
    headers,
    body: JSON.stringify({ user_id: userId, work_id: workId })
  });
  await throwOnError(response, "add");
}

// Requirement #12: safe to call repeatedly -- DELETE by work_id matches
// zero or one row either way, RLS already restricts it to the caller's
// own rows, and a delete of zero rows is not an error. Deliberately does
// NOT touch reader_progress (see the migration's own header comment on
// why removal doesn't cascade into reading position).
export async function removeFromLibrary(workId: string): Promise<void> {
  const headers = await authHeaders({ "Prefer": "return=minimal" });
  const response = await fetch(`${TABLE_ENDPOINT}?work_id=eq.${encodeURIComponent(workId)}`, {
    method: "DELETE",
    headers
  });
  await throwOnError(response, "remove");
}

// Used by BookDetailView to render "Добавить в библиотеку" vs "В
// библиотеке" (and the current status, for the manual status control) --
// null means "not saved", not "unknown"/"loading" (callers track loading
// separately).
export async function getLibraryEntry(workId: string): Promise<LibraryEntry | null> {
  const headers = await authHeaders();
  const response = await fetch(
    `${TABLE_ENDPOINT}?work_id=eq.${encodeURIComponent(workId)}&select=*&limit=1`,
    { headers }
  );
  await throwOnError(response, "lookup");
  const rows = (await response.json()) as LibraryEntryRow[];
  return rows[0] ? fromRow(rows[0]) : null;
}

export interface ListLibraryOptions {
  status?: LibraryStatus;
}

// Ordered newest-activity-first (updated_at) -- a Work the visitor is
// actively progressing through (or just saved) surfaces above one they
// saved long ago and haven't touched since.
export async function listLibrary(options: ListLibraryOptions = {}): Promise<LibraryEntry[]> {
  const headers = await authHeaders();
  const params = new URLSearchParams({ select: "*", order: "updated_at.desc" });
  if (options.status) params.set("status", `eq.${options.status}`);
  const response = await fetch(`${TABLE_ENDPOINT}?${params.toString()}`, { headers });
  await throwOnError(response, "list");
  const rows = (await response.json()) as LibraryEntryRow[];
  return rows.map(fromRow);
}

// Manual status change (requirement #10 -- "finished" is something the
// reader sets themselves; this same function also covers moving a Work
// back to "Хочу прочитать"/"Читаю" by hand, which the automatic
// want_to_read -> reading transition below never does on its own).
export async function setLibraryStatus(workId: string, status: LibraryStatus): Promise<void> {
  const headers = await authHeaders({ "Prefer": "return=minimal" });
  const response = await fetch(`${TABLE_ENDPOINT}?work_id=eq.${encodeURIComponent(workId)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status, updated_at: new Date().toISOString() })
  });
  await throwOnError(response, "set-status");
}

// Requirement #9/#10: called once, right when the visitor actually
// opens the Reader on a specific Edition of a saved Work (see
// BookDetailView.tsx's "Читать" handler) -- never on merely viewing
// Book Detail. Two independent PATCHes, each scoped by the CURRENT
// status in its own WHERE clause, so together they implement exactly:
//   - want_to_read -> reading, the one automatic status transition this
//     phase makes (first PATCH; matches 0 rows if not currently
//     want_to_read, including "not saved at all" -- a real no-op, not
//     an error);
//   - last_edition_id/last_language kept current on every real read
//     regardless of status, including reading/finished (second PATCH) --
//     so "Продолжить чтение" always points at the truly last-read
//     edition, without ever silently reviving a 'finished' Work back to
//     'reading'.
// If the Work was never saved at all, both PATCHes match zero rows --
// reading an unsaved Work does not implicitly save it; requirement #12
// only asks for "Добавить в библиотеку" to be the explicit save action.
export async function recordRealRead(workId: string, editionId: string, language: string): Promise<void> {

  const nowIso = new Date().toISOString();
  const headers = await authHeaders({ "Prefer": "return=minimal" });

  const promoteToReading = fetch(
    `${TABLE_ENDPOINT}?work_id=eq.${encodeURIComponent(workId)}&status=eq.want_to_read`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        status: "reading",
        last_edition_id: editionId,
        last_language: language,
        updated_at: nowIso
      })
    }
  );

  const touchLastEdition = fetch(
    `${TABLE_ENDPOINT}?work_id=eq.${encodeURIComponent(workId)}&status=neq.want_to_read`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        last_edition_id: editionId,
        last_language: language,
        updated_at: nowIso
      })
    }
  );

  const [a, b] = await Promise.all([promoteToReading, touchLastEdition]);
  // Best-effort: a failure here should never block the visitor from
  // actually reading (the Reader is already opening/open by the time
  // this fires -- see the call site) -- logged, not thrown.
  if (!a.ok) console.error("user_library recordRealRead (promote) failed:", await a.text().catch(() => ""));
  if (!b.ok) console.error("user_library recordRealRead (touch) failed:", await b.text().catch(() => ""));

}

// USER LIBRARY PHASE / batch Work fetch: the one piece My Library needs
// that plain PostgREST + RLS cannot provide (public.works/authors are
// service-role-only, per omnia-library-catalog's own comment -- an
// authenticated visitor's RLS grant on user_library does not extend to
// those tables). Calls the SAME omnia-library-catalog Edge Function
// Library/Search already use, via its new auth-gated `workIds` mode
// (see that function's own comment) -- not a second, parallel catalog
// endpoint. Results are merged into the shared catalog store via
// mergeLibraryPage, the exact mechanism LibraryView.tsx already uses --
// so a Work opened from My Library resolves through getBookById exactly
// like one opened from Library/Search/an Author page, with no separate,
// display-only copy of the data.
export async function fetchAndMergeWorksByIds(workIds: string[]): Promise<void> {

  if (workIds.length === 0) return;

  const token = await getValidAccessToken();
  if (!token) throw new Error(NOT_AUTHENTICATED);

  const url = new URL(CATALOG_ENDPOINT);
  url.searchParams.set("workIds", workIds.join(","));

  const response = await fetch(url.toString(), {
    headers: {
      "apikey": SUPABASE_PUBLISHABLE_KEY,
      "Authorization": `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`omnia-library-catalog workIds lookup failed (${response.status}):`, detail);
    throw new Error("Не удалось загрузить книги из библиотеки.");
  }

  const data = (await response.json()) as { books: CatalogBook[]; authors: Author[] };
  mergeLibraryPage(data.books ?? [], data.authors ?? []);

}
