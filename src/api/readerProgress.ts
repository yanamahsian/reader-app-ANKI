// Authenticated Reader bootstrap state. Reading position remains in
// public.reader_progress; account-synced bookmarks live in
// public.reader_bookmarks. ReaderView awaits this bootstrap once before
// constructing the synchronous ProgressStore used by readerEngine.ts.
import type { Bookmark } from "../features/reader/engine/types";
import { fetchBookmarks } from "./readerBookmarks";
import { isPersonalEpubBookId } from "./personalEpubLibrary";
import { isPersonalFb2BookId } from "./personalFb2Library";
import { isPersonalPdfBookId } from "./personalPdfLibrary";
import { getValidAccessToken, getSession } from "../auth/supabaseAuth";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../auth/supabaseAuth";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/reader_progress`;

export interface ReaderRemoteState {
  position: number | null;
  positionUpdatedAt: string | null;
  bookmarks: Bookmark[];
}

function isDeviceLocalImport(editionId: string): boolean {
  return isPersonalEpubBookId(editionId)
    || isPersonalPdfBookId(editionId)
    || isPersonalFb2BookId(editionId);
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

async function fetchPosition(editionId: string): Promise<{
  page: number | null;
  updatedAt: string | null;
}> {
  const headers = await authHeaders();
  if (!headers) return { page: null, updatedAt: null };

  try {
    const response = await fetch(
      `${TABLE_ENDPOINT}?edition_id=eq.${encodeURIComponent(editionId)}` +
      `&select=page,updated_at&limit=1`,
      { headers }
    );
    if (!response.ok) {
      console.error("reader_progress fetch failed:", response.status, await response.text().catch(() => ""));
      return { page: null, updatedAt: null };
    }
    const rows = (await response.json()) as Array<{ page: number; updated_at: string }>;
    const row = rows[0];
    return row
      ? { page: row.page, updatedAt: row.updated_at }
      : { page: null, updatedAt: null };
  } catch (error) {
    console.error("reader_progress fetch failed:", error);
    return { page: null, updatedAt: null };
  }
}

export async function fetchProgress(editionId: string): Promise<ReaderRemoteState> {
  // Personal imports are not public.editions rows. Never query catalog-owned
  // progress/bookmark tables for them, even if the reader is signed in.
  if (isDeviceLocalImport(editionId)) {
    return { position: null, positionUpdatedAt: null, bookmarks: [] };
  }

  const [position, bookmarks] = await Promise.all([
    fetchPosition(editionId),
    fetchBookmarks(editionId)
  ]);
  return {
    position: position.page,
    positionUpdatedAt: position.updatedAt,
    bookmarks
  };
}

export async function saveProgress(
  editionId: string,
  page: number,
  updatedAt = new Date().toISOString()
): Promise<void> {
  if (isDeviceLocalImport(editionId)) return;

  const session = getSession();
  if (!session) return;

  const headers = await authHeaders({ "Prefer": "resolution=merge-duplicates,return=minimal" });
  if (!headers) throw new Error("reader_progress save failed: missing authenticated session");

  const response = await fetch(`${TABLE_ENDPOINT}?on_conflict=user_id,edition_id`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user_id: session.user.id,
      edition_id: editionId,
      page,
      updated_at: updatedAt
    })
  });

  if (!response.ok) {
    throw new Error(`reader_progress save failed: ${response.status} ${await response.text().catch(() => "")}`);
  }
}
