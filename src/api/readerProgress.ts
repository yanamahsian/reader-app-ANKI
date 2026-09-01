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

export async function fetchProgress(editionId: string): Promise<ReaderRemoteState> {
  // Personal imports are not public.editions rows. Never query catalog-owned
  // progress/bookmark tables for them, even if the reader is signed in.
  if (isDeviceLocalImport(editionId)) {
    return { position: null, bookmarks: [] };
  }

  const [position, bookmarks] = await Promise.all([
    fetchPosition(editionId),
    fetchBookmarks(editionId)
  ]);
  return { position, bookmarks };
}

export async function saveProgress(editionId: string, page: number): Promise<void> {
  if (isDeviceLocalImport(editionId)) return;

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
