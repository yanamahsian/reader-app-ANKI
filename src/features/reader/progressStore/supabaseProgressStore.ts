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
  initialState: ReaderRemoteState,
  // Optional and Supabase-store-specific -- deliberately not part of the
  // shared ProgressStore contract (createLocalStorageStore never fails, so
  // it has nothing to report). Lets the caller surface a background
  // save/delete failure to the user without this store knowing anything
  // about how that's displayed.
  onBookmarkSyncError?: (message: string) => void
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

  // Per-page "server-confirmed" baseline, seeded from the initial (already
  // server-confirmed) bookmarks and advanced only when a remote bookmark
  // write for that page actually succeeds -- never when it's merely
  // applied optimistically. A same-page rollback restores to *this*, not
  // to whatever the cache happened to show a moment before the mutation
  // was issued: that prior value could itself have been a still-pending or
  // already-failed optimistic mutation, and restoring it would just
  // reintroduce another unconfirmed state. Because confirmedAtPage only
  // moves forward on confirmed success, a chain of several same-page
  // mutations that all fail in a row unwinds transitively, one rollback at
  // a time, back to the last real confirmed value -- with no special
  // casing for how many mutations are in the chain.
  const confirmedAtPage = new Map<number, Bookmark | null>();
  for (const bookmark of cachedBookmarks) {
    confirmedAtPage.set(bookmark.pageIndex, { ...bookmark });
  }

  function getConfirmedAtPage(pageIndex: number): Bookmark | null {
    return confirmedAtPage.get(pageIndex) ?? null;
  }

  function setConfirmedAtPage(pageIndex: number, value: Bookmark | null): void {
    confirmedAtPage.set(pageIndex, value);
  }

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

  function enqueueBookmarkWrite(
    label: string,
    task: () => Promise<void>,
    onSuccess: () => void,
    rollback: () => void,
    userMessage: string
  ): void {
    bookmarkWriteChain = bookmarkWriteChain
      .then(task)
      .then(onSuccess)
      .catch(error => {
        console.error(`supabaseProgressStore: background bookmark ${label} failed:`, error);
        // The optimistic cache mutation this write was for turned out to be
        // wrong -- undo just that mutation (not a blind full-state
        // rollback, which could also erase a different bookmark write that
        // was queued after this one and already succeeded) and let the
        // caller show the user their action didn't actually stick.
        rollback();
        onBookmarkSyncError?.(userMessage);
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

  // A page holds at most one bookmark at a time (save evicts whatever was
  // there; see the filter below), so "what currently occupies this page"
  // is exactly the ownership check a rollback needs: whether the mutation
  // it's undoing is still the thing actually sitting in that slot, or
  // whether a later save/delete on the same page has since taken over.
  function currentBookmarkIdAtPage(pageIndex: number): string | null {
    return cachedBookmarks.find(item => item.pageIndex === pageIndex)?.id ?? null;
  }

  function saveBookmark(bookmark: Bookmark): void {
    if (bookmark.bookId !== editionId) return;

    cachedBookmarks = [
      { ...bookmark },
      ...cachedBookmarks.filter(item => item.pageIndex !== bookmark.pageIndex)
    ];

    enqueueBookmarkWrite(
      "save",
      () => saveRemoteBookmark(bookmark),
      () => {
        // The remote write actually landed -- this bookmark becomes the
        // confirmed fallback target for this page, for whatever same-page
        // mutation might roll back next.
        setConfirmedAtPage(bookmark.pageIndex, { ...bookmark });
      },
      () => {
        // This save's own slot may have since been overwritten by a later
        // save (a newer bookmark now owns the page) or vacated by a later
        // delete -- either way this bookmark is no longer the current
        // occupant, so the failure of this particular save is moot and
        // must not disturb whatever the newer mutation left behind.
        if (currentBookmarkIdAtPage(bookmark.pageIndex) !== bookmark.id) return;
        cachedBookmarks = cachedBookmarks.filter(item => item.id !== bookmark.id);
        // Roll back to the last *confirmed* state for this page, not just
        // whatever was there a moment before this save -- that could itself
        // have been an optimistic mutation that also failed. Since the
        // confirmed baseline only advances on an actual successful remote
        // write, this transitively unwinds through any run of failed
        // same-page saves back to the last real confirmed value.
        const fallback = getConfirmedAtPage(bookmark.pageIndex);
        if (fallback) {
          cachedBookmarks = [fallback, ...cachedBookmarks];
        }
      },
      "Не удалось сохранить закладку. Попробуйте ещё раз."
    );
  }

  function deleteBookmark(id: string): void {
    const bookmark = cachedBookmarks.find(item => item.id === id);
    if (!bookmark) return;
    cachedBookmarks = cachedBookmarks.filter(item => item.id !== id);
    enqueueBookmarkWrite(
      "delete",
      () => deleteRemoteBookmark(editionId, bookmark.pageIndex),
      () => {
        // The delete actually landed -- the page's confirmed state is now
        // vacant, so a later same-page save that fails must not fall back
        // to this bookmark anymore.
        setConfirmedAtPage(bookmark.pageIndex, null);
      },
      () => {
        // Only bring anything back if that page is still vacant -- if a
        // later save has since claimed the page, that save owns the slot
        // now and restoring on top of it would put two bookmarks on the
        // same page.
        if (currentBookmarkIdAtPage(bookmark.pageIndex) !== null) return;
        // Symmetric with the save rollback above: restore the confirmed
        // baseline for this page, not blindly the bookmark this delete
        // captured -- in the cases reachable through the fully serialized
        // write chain today the two coincide, but this keeps the delete
        // and save rollbacks consistent with the same "roll back to last
        // confirmed truth" rule instead of two different rules.
        const fallback = getConfirmedAtPage(bookmark.pageIndex);
        if (fallback) {
          cachedBookmarks = [fallback, ...cachedBookmarks];
        }
      },
      "Не удалось удалить закладку. Попробуйте ещё раз."
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
