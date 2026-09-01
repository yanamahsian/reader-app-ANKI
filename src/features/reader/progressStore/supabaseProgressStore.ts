import type { ProgressStore } from "./progressStore";
import type { Bookmark } from "../engine/types";
import { createLocalStorageStore } from "./localStorageStore";
import { saveProgress, type ReaderRemoteState } from "../../../api/readerProgress";
import { isPersonalEpubBookId } from "../../../api/personalEpubLibrary";
import { isPersonalFb2BookId } from "../../../api/personalFb2Library";
import { isPersonalPdfBookId } from "../../../api/personalPdfLibrary";
import {
  deleteBookmark as deleteRemoteBookmark,
  saveBookmark as saveRemoteBookmark
} from "../../../api/readerBookmarks";

const REMOTE_POSITION_FALLBACK_PREFIX = "anki_remote_position_state_";

interface RemotePositionFallback {
  page: number;
  updatedAt: number;
}

function isDeviceLocalImport(editionId: string): boolean {
  return isPersonalEpubBookId(editionId)
    || isPersonalPdfBookId(editionId)
    || isPersonalFb2BookId(editionId);
}

function fallbackKey(editionId: string): string {
  return `${REMOTE_POSITION_FALLBACK_PREFIX}${editionId}`;
}

function readPositionFallback(editionId: string): RemotePositionFallback | null {
  try {
    const raw = localStorage.getItem(fallbackKey(editionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RemotePositionFallback>;
    if (!Number.isInteger(parsed.page) || Number(parsed.page) < 0) return null;
    if (!Number.isFinite(parsed.updatedAt) || Number(parsed.updatedAt) <= 0) return null;
    return { page: Number(parsed.page), updatedAt: Number(parsed.updatedAt) };
  } catch {
    return null;
  }
}

function writePositionFallback(editionId: string, state: RemotePositionFallback): void {
  try {
    localStorage.setItem(fallbackKey(editionId), JSON.stringify(state));
  } catch (error) {
    console.error("supabaseProgressStore: local position fallback save failed:", error);
  }
}

// Authenticated Reader state keeps the mature synchronous ProgressStore
// contract while its source of truth lives in Supabase. Device-local imports
// deliberately bypass that server path and reuse localStorage instead.
export function createSupabaseProgressStore(
  editionId: string,
  initialState: ReaderRemoteState
): ProgressStore {
  const local = createLocalStorageStore();

  if (isDeviceLocalImport(editionId)) return local;

  const serverUpdatedAt = initialState.positionUpdatedAt
    ? Date.parse(initialState.positionUpdatedAt)
    : 0;
  const localFallback = readPositionFallback(editionId);
  const fallbackIsNewer = Boolean(
    localFallback &&
    (!Number.isFinite(serverUpdatedAt) || localFallback.updatedAt > serverUpdatedAt)
  );

  let cachedPosition = fallbackIsNewer
    ? localFallback!.page
    : initialState.position;
  let cachedBookmarks = initialState.bookmarks
    .filter(bookmark => bookmark.bookId === editionId)
    .map(bookmark => ({ ...bookmark }));

  let positionWriteChain: Promise<void> = Promise.resolve();
  let bookmarkWriteChain: Promise<void> = Promise.resolve();

  function enqueuePositionWrite(page: number, updatedAt: number): void {
    positionWriteChain = positionWriteChain
      .then(() => saveProgress(editionId, page, new Date(updatedAt).toISOString()))
      .catch(error => {
        // The local fallback intentionally remains newer than the server row.
        // On the next Reader bootstrap it wins and is queued for sync again.
        console.error("supabaseProgressStore: background position save failed:", error);
      });
  }

  function enqueueBookmarkWrite(label: string, task: () => Promise<void>): void {
    bookmarkWriteChain = bookmarkWriteChain
      .then(task)
      .catch(error => {
        console.error(`supabaseProgressStore: background bookmark ${label} failed:`, error);
      });
  }

  // If the browser has a newer position from an offline/failed previous
  // session, use it immediately and repair the remote row in the background.
  if (fallbackIsNewer && localFallback) {
    enqueuePositionWrite(localFallback.page, localFallback.updatedAt);
  } else if (
    initialState.position !== null &&
    Number.isFinite(serverUpdatedAt) &&
    serverUpdatedAt > 0
  ) {
    // Keep a local recovery copy of the last confirmed server position too.
    writePositionFallback(editionId, {
      page: initialState.position,
      updatedAt: serverUpdatedAt
    });
  }

  function getPosition(bookId: string): number | null {
    if (bookId !== editionId) return null;
    return cachedPosition;
  }

  function savePosition(bookId: string, page: number): void {
    if (bookId !== editionId) return;
    const updatedAt = Date.now();
    cachedPosition = page;
    writePositionFallback(editionId, { page, updatedAt });
    // Serialize writes so a slower earlier request cannot land after a newer
    // page change from this Reader instance and overwrite it.
    enqueuePositionWrite(page, updatedAt);
  }

  function getBookmarks(bookId: string): Bookmark[] {
    if (bookId !== editionId) return [];
    return cachedBookmarks.map(bookmark => ({ ...bookmark }));
  }

  function saveBookmark(bookmark: Bookmark): void {
    if (bookmark.bookId !== editionId) return;

    cachedBookmarks = [
      { ...bookmark },
      ...cachedBookmarks.filter(item => item.pageIndex !== bookmark.pageIndex)
    ];

    enqueueBookmarkWrite("save", () => saveRemoteBookmark(bookmark));
  }

  function deleteBookmark(id: string): void {
    const bookmark = cachedBookmarks.find(item => item.id === id);
    if (!bookmark) return;
    cachedBookmarks = cachedBookmarks.filter(item => item.id !== id);
    enqueueBookmarkWrite(
      "delete",
      () => deleteRemoteBookmark(editionId, bookmark.pageIndex)
    );
  }

  return {
    getPosition,
    savePosition,
    getFragments: local.getFragments,
    saveFragment: local.saveFragment,
    deleteFragment: local.deleteFragment,
    getBookmarks,
    saveBookmark,
    deleteBookmark
  };
}
