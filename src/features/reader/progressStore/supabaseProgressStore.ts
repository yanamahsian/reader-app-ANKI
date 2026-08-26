import type { ProgressStore } from "./progressStore";
import { createLocalStorageStore } from "./localStorageStore";
import { saveProgress } from "../../../api/readerProgress";

// USER LIBRARY PHASE: the Supabase-backed ProgressStore implementation
// progressStore.ts's own header comment predicted back in Phase 2
// ("When accounts land ... a Supabase-backed implementation of this
// exact same interface replaces it -- the reader engine never
// changes"). readerEngine.ts is untouched by this phase -- it still only
// ever talks to the plain ProgressStore interface, exactly as before.
//
// SCOPE: only getPosition/savePosition (reading POSITION) are
// Supabase-backed here -- fragments and bookmarks stay on
// createLocalStorageStore() underneath, completely unchanged, for BOTH
// guest and authenticated visitors. The task this store exists for is
// specifically "reading progress must survive reload / a different
// device, and must be edition-specific" (requirements #7/#8); nothing
// asked for fragments/notes or bookmarks to become account-synced in
// this phase, and this project's own "не придумывать сложную механику"
// guidance argues against silently expanding scope to a second synced
// data type this phase was never asked to design storage/RLS for.
//
// SYNCHRONOUS getPosition, ASYNC SOURCE OF TRUTH: ProgressStore.
// getPosition(bookId) is a synchronous call (readerEngine.ts's open()
// uses its return value immediately, synchronously, to set the initial
// page) -- it cannot become async without changing readerEngine.ts,
// which is out of scope. The fix is upstream, not here: ReaderView.tsx
// now awaits fetchProgress(editionId) itself BEFORE constructing this
// store and BEFORE calling engine.open(), passing the fetched value in
// as `initialPosition` below -- so this store's own getPosition can
// still be a plain, synchronous in-memory read, same contract as
// localStorageStore's, just seeded from a value Supabase already
// provided a moment earlier instead of from localStorage.
//
// savePosition stays synchronous too (readerEngine.ts's renderPage calls
// it on every single page turn, synchronously, mid-render) -- it updates
// the in-memory cache immediately (so a later getPosition in the same
// session reflects the latest page without waiting on a round trip) and
// fires the actual Supabase write in the background, unawaited. A failed
// background write is logged (see readerProgress.ts's own saveProgress)
// and simply retried on the next page turn's own savePosition call --
// deliberately not a queued-retry/offline-first mechanism (out of
// scope), just the same "next successful save wins" behavior a
// last-write-wins upsert already gives for free.
export function createSupabaseProgressStore(editionId: string, initialPosition: number | null): ProgressStore {

  const local = createLocalStorageStore();
  let cachedPosition = initialPosition;

  function getPosition(bookId: string): number | null {
    // bookId is always editionId here -- see toReaderBook.ts's own
    // comment on why Book.id is now the Edition id, not the Work id.
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

  return {
    getPosition,
    savePosition,
    getFragments: local.getFragments,
    saveFragment: local.saveFragment,
    deleteFragment: local.deleteFragment,
    getBookmarks: local.getBookmarks,
    saveBookmark: local.saveBookmark,
    deleteBookmark: local.deleteBookmark
  };

}
