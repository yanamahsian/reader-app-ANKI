// Authenticated Reader bootstrap state. Reading position remains in
// public.reader_progress; account-synced bookmarks live in
// public.reader_bookmarks. ReaderView awaits this bootstrap once before
// constructing the synchronous ProgressStore used by readerEngine.ts.
import type { Bookmark } from "../features/reader/engine/types";
import { fetchBookmarks } from "./readerBookmarks";
import { getValidAccessToken, getSession } from "../auth/supabaseAuth";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../auth/supabaseAuth";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/reader_progress`;

export interface ReaderRemoteState {
  position: number | null;
  bookmarks: Bookmark[];
}

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

async function fetchPosition(editionId: string): Promise<number | null> {

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

// Keep the public name used by ReaderView, but bootstrap both pieces of
// synchronous Reader state in parallel. This avoids serial network latency and
// lets readerEngine.ts keep its existing getPosition/getBookmarks contract.
export async function fetchProgress(editionId: string): Promise<ReaderRemoteState> {
  const [position, bookmarks] = await Promise.all([
    fetchPosition(editionId),
    fetchBookmarks(editionId)
  ]);
  return { position, bookmarks };
}

// Upsert on (user_id, edition_id) -- ON CONFLICT DO UPDATE via
// PostgREST's merge-duplicates resolution, so every page turn is a
// single idempotent call, never a duplicate row. Fire-and-forget from
// readerEngine.ts's point of view so page turns never wait on network I/O.
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
