import type { ProgressStore } from "./progressStore";
import type { Bookmark } from "../engine/types";
import { createLocalStorageStore } from "./localStorageStore";
import { saveProgress, type ReaderRemoteState } from "../../../api/readerProgress";
import { isPersonalEpubBookId } from "../../../api/personalEpubLibrary";
import {
  deleteBookmark as deleteRemoteBookmark,
  saveBookmark as saveRemoteBookmark
} from "../../../api/readerBookmarks";

// Authenticated Reader state keeps the mature synchronous ProgressStore
// contract while its source of truth lives in Supabase. ReaderView preloads
// position + bookmarks through fetchProgress() before constructing this store,
// so readerEngine.ts does not need an async rewrite. Guest fragments keep the
// existing localStorage path.
export function createSupabaseProgressStore(
  editionId: string,
  initialState: ReaderRemoteState
): ProgressStore {

  const local = createLocalStorageStore();

  // Personal imports are deliberately device-local in v1. They have no row in
  // public.editions, so even a signed-in visitor must use the exact same local
  // progress/bookmark implementation as a guest for these books. This avoids
  // fake catalog Edition ids, FK violations, and misleading cross-device sync.
  if (isPersonalEpubBookId(editionId)) return local;

  let cachedPosition = initialState.position;
  let cachedBookmarks = initialState.bookmarks
    .filter(bookmark => bookmark.bookId === editionId)
    .map(bookmark => ({ ...bookmark }));

  // Bookmark writes must preserve click order. Without this queue, a fast
  // "add → remove" can let DELETE finish before POST and resurrect the row
  // when the slower POST eventually completes.
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
