import type { Bookmark } from "../features/reader/engine/types";
import {
  getSession,
  getValidAccessToken,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from "../auth/supabaseAuth";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/reader_bookmarks`;

interface ReaderBookmarkRow {
  id: string;
  edition_id: string;
  page_index: number;
  chapter_title: string | null;
  created_at: string;
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

function rowToBookmark(row: ReaderBookmarkRow): Bookmark {
  return {
    id: row.id,
    bookId: row.edition_id,
    pageIndex: row.page_index,
    chapterTitle: row.chapter_title,
    createdAt: Date.parse(row.created_at)
  };
}

// Authenticated Reader bookmarks are edition-scoped account data. The
// browser receives only the current user's rows because public.reader_bookmarks
// is protected by RLS (auth.uid() = user_id); no service-role key is exposed.
export async function fetchBookmarks(editionId: string): Promise<Bookmark[]> {

  const headers = await authHeaders();
  if (!headers) return [];

  try {
    const response = await fetch(
      `${TABLE_ENDPOINT}?edition_id=eq.${encodeURIComponent(editionId)}` +
      `&select=id,edition_id,page_index,chapter_title,created_at&order=created_at.desc`,
      { headers }
    );

    if (!response.ok) {
      console.error("reader_bookmarks fetch failed:", response.status, await response.text().catch(() => ""));
      return [];
    }

    const rows = (await response.json()) as ReaderBookmarkRow[];
    return rows.map(rowToBookmark);
  } catch (error) {
    console.error("reader_bookmarks fetch failed:", error);
    return [];
  }

}

// The database owns the persistent row id. We intentionally do NOT send the
// optimistic client UUID in this composite-key upsert: otherwise PostgREST's
// merge-duplicates path can rewrite an existing row's primary key when two
// tabs/devices bookmark the same page with different local UUIDs.
export async function saveBookmark(bookmark: Bookmark): Promise<void> {

  const session = getSession();
  if (!session) return;

  const headers = await authHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" });
  if (!headers) return;

  const response = await fetch(
    `${TABLE_ENDPOINT}?on_conflict=user_id,edition_id,page_index`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: session.user.id,
        edition_id: bookmark.bookId,
        page_index: bookmark.pageIndex,
        chapter_title: bookmark.chapterTitle,
        created_at: new Date(bookmark.createdAt).toISOString(),
        updated_at: new Date().toISOString()
      })
    }
  );

  if (!response.ok) {
    throw new Error(`reader_bookmarks save failed: ${response.status} ${await response.text().catch(() => "")}`);
  }

}

// Delete by the same stable uniqueness key used for the upsert, not by a
// possibly-optimistic client UUID. This also makes save -> immediate delete
// safe while the serialized background write chain is still resolving.
export async function deleteBookmark(editionId: string, pageIndex: number): Promise<void> {

  const headers = await authHeaders({ "Prefer": "return=minimal" });
  if (!headers) return;

  const response = await fetch(
    `${TABLE_ENDPOINT}?edition_id=eq.${encodeURIComponent(editionId)}` +
    `&page_index=eq.${encodeURIComponent(String(pageIndex))}`,
    {
      method: "DELETE",
      headers
    }
  );

  if (!response.ok) {
    throw new Error(`reader_bookmarks delete failed: ${response.status} ${await response.text().catch(() => "")}`);
  }

}
