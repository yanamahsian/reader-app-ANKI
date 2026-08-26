// USER LIBRARY PHASE: edition-specific reading position for an
// authenticated visitor, backed by public.reader_progress (see
// supabase/sql/user_library_and_reader_progress.sql for the schema/RLS,
// and that migration's own comment for why this is edition-scoped and
// kept separate from user_library). Same PostgREST + RLS shape as
// src/api/userLibrary.ts -- no Edge Function, auth.uid() = user_id does
// all the real restricting.
//
// This is consumed by src/features/reader/progressStore/
// supabaseProgressStore.ts, NOT by readerEngine.ts directly --
// readerEngine.ts only ever talks to the ProgressStore interface (see
// that interface's own comment: "the reader engine never changes"), and
// that contract is honored here: this file, and the store built on top
// of it, are new, but readerEngine.ts itself has zero changes in this
// phase.
import { getValidAccessToken, getSession } from "../auth/supabaseAuth";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../auth/supabaseAuth";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/reader_progress`;

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string> | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  return {
    "apikey": SUPABASE_PUBLISHABLE_KEY,
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra
  };
}

// Returns null both when there is genuinely no saved position AND when
// the visitor isn't (or is no longer) authenticated -- the caller
// (supabaseProgressStore) only ever calls this while it already knows a
// session exists, so the two cases don't need to be told apart here; a
// missing/expired session simply behaves like "no saved position yet"
// rather than throwing mid-read.
export async function fetchProgress(editionId: string): Promise<number | null> {

  const headers = await authHeaders();
  if (!headers) return null;

  try {
    const response = await fetch(
      `${TABLE_ENDPOINT}?edition_id=eq.${encodeURIComponent(editionId)}&select=page&limit=1`,
      { headers }
    );
    if (!response.ok) {
      console.error("reader_progress fetch failed:", response.status, await response.text().catch(() => ""));
      return null;
    }
    const rows = (await response.json()) as Array<{ page: number }>;
    return rows[0]?.page ?? null;
  } catch (error) {
    console.error("reader_progress fetch failed:", error);
    return null;
  }

}

// Upsert on (user_id, edition_id) -- ON CONFLICT DO UPDATE via
// PostgREST's merge-duplicates resolution, so every page turn is a
// single idempotent call, never a duplicate row (the table's own unique
// constraint is the backstop either way -- see the migration). Fire-
// and-forget from the caller's point of view (readerEngine.ts's own
// renderPage already calls progressStore.savePosition synchronously on
// every page turn; making this awaited there would mean every page turn
// waits on a network round trip, which is not an acceptable regression
// to reading responsiveness) -- failures are logged, never thrown, by
// the caller (see supabaseProgressStore.ts).
export async function saveProgress(editionId: string, page: number): Promise<void> {

  const session = getSession();
  if (!session) return;

  const headers = await authHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" });
  if (!headers) return;

  const response = await fetch(`${TABLE_ENDPOINT}?on_conflict=user_id,edition_id`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: session.user.id,
      edition_id: editionId,
      page,
      updated_at: new Date().toISOString()
    })
  });

  if (!response.ok) {
    console.error("reader_progress save failed:", response.status, await response.text().catch(() => ""));
  }

}
