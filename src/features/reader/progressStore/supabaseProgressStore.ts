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

function isDeviceLocalImport(editionId: string): boolean {
  return isPersonalEpubBookId(editionId)
    || isPersonalPdfBookId(editionId)
    || isPersonalFb2BookId(editionId);
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

  let cachedPosition = initialState.position;
  let cachedBookmarks = initialState.bookmarks
    .filter(bookmark => bookmark.bookId === editionId)
    .map(bookmark => ({ ...bookmark }));

  let bookmarkWriteChain: Promise<void> = Promise.resolve();

  function enqueueBookmarkWrite(label: string, task: () => Promise<void>): void {
    bookmarkWriteChain = bookmarkWriteChain
      .then(task)
      .catch(error => {
        console.error(`supabaseProgressStore: background bookmark ${label} failed:`, error);
      });
  }

  function getPosition(bookId: string): number | null {
    if (bookId !== editionId) return null;
    return cachedPosition;
  }

  function savePosition(bookId: string, page: number): void {
    if (bookId !== editionId) return;
    cachedPosition = page;
    saveProgress(editionId, page).catch(error => {
      console.error("supabaseProgressStore: background position save failed:", error);
    });
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
    if (!cachedBookmarks.some(bookmark => bookmark.id === id)) return;
    cachedBookmarks = cachedBookmarks.filter(bookmark => bookmark.id !== id);
    enqueueBookmarkWrite("delete", () => deleteRemoteBookmark(id));
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
