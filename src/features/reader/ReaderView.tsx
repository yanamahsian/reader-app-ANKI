import { useEffect, useRef } from "react";
import type { Book } from "./engine/types";
import { createReaderEngine, type ReaderEngine } from "./engine/readerEngine";
import { createLocalStorageStore } from "./progressStore/localStorageStore";
import { createSupabaseProgressStore } from "./progressStore/supabaseProgressStore";
import { createSupabaseAnnotationStore } from "./annotationStore";
import { createSupabaseThoughtThreadBridge } from "./threadBridge";
import { getSession } from "../../auth/supabaseAuth";
import { fetchProgress } from "../../api/readerProgress";

// NOTES + HIGHLIGHTS PHASE: set only when arriving here from the Notes
// screen ("open this exact quote") -- App.tsx clears/omits it for every
// ordinary "Читать" open, so this never lingers across an unrelated later
// visit to Reader. pageIndex is the reader's own global flat page index
// (the same one Bookmark.pageIndex/reader_progress.page already use --
// see the annotations migration's own comment on why that's stable).
export interface ReaderNavigationTarget {
  pageIndex: number;
  annotationId: string;
}

interface ReaderViewProps {
  book: Book;
  onExit: () => void;
  navigationTarget?: ReaderNavigationTarget | null;
}

// Thin React wrapper. All reader behaviour — pagination, selection,
// action sheet, touch/keyboard nav — lives in readerEngine.ts, a plain
// vanilla TypeScript module. This component only mounts a container
// for it and calls its public API (open/destroy); React never reaches
// into the engine's internal DOM.
export function ReaderView({ book, onExit, navigationTarget }: ReaderViewProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);

  useEffect(() => {

    if (!containerRef.current) return;
    const container = containerRef.current;

    // USER LIBRARY PHASE: book.id is now an Edition id (see
    // toReaderBook.ts's own comment on this). A signed-in visitor gets
    // a Supabase-backed store, seeded with their saved position for
    // THIS edition, fetched here -- before the store is constructed and
    // before engine.open() is called -- because ProgressStore.
    // getPosition() must stay synchronous (readerEngine.ts's open() uses
    // it immediately; changing that contract is out of scope). A guest
    // visitor's path is completely unchanged: createLocalStorageStore()
    // synchronously, same as every prior phase.
    let cancelled = false;

    async function setUpReader() {

      const session = getSession();
      const progressStore = session
        ? createSupabaseProgressStore(book.id, await fetchProgress(book.id))
        : createLocalStorageStore();

      // NOTES + HIGHLIGHTS PHASE: real, Supabase-backed annotations only
      // for a signed-in visitor opening a real catalog Edition (book.workId
      // present -- see Book.workId's own comment on when it's absent).
      // Everyone else gets null, and readerEngine.ts's own runSave() falls
      // back to the pre-existing guest Fragment mechanism unchanged.
      const annotationStore = session && book.workId
        ? createSupabaseAnnotationStore(session.user.id, book.workId, book.id)
        : null;

      // READER -> THOUGHT THREAD BRIDGE v1: same gate as annotationStore,
      // on purpose -- "Добавить в нить" only ever appears once a real
      // Supabase annotation exists to add, so there is never a case where
      // this needs to be non-null while annotationStore is null. Guest /
      // no-workId visitors get null here exactly like annotationStore,
      // and readerEngine.ts never renders the Thread picker when this is
      // null (see its own comment).
      const threadBridge = session && book.workId
        ? createSupabaseThoughtThreadBridge()
        : null;

      // The visitor could have navigated away (book changed, or this
      // view unmounted) while fetchProgress() above was in flight --
      // don't build/open an engine for a book that's no longer current.
      if (cancelled) return;

      const engine = createReaderEngine({
        container,
        progressStore,
        annotationStore,
        threadBridge,
        onExit
      });

      engineRef.current = engine;

      // NOTES + HIGHLIGHTS PHASE: navigationTarget (set only when arriving
      // from Notes -> "open this exact quote") opens on the annotation's
      // own page instead of the ordinary saved position -- readerEngine.ts's
      // own open()/renderPage() make sure this does NOT overwrite
      // reader_progress just because an old quote was opened (see their
      // own comments on suppressNextProgressSave).
      const openOptions = navigationTarget
        ? { initialPageOverride: navigationTarget.pageIndex, focusAnnotationId: navigationTarget.annotationId }
        : undefined;

      engine.open(book, openOptions).catch(error => {
        console.error(error);
        alert("Не удалось открыть книгу.");
      });

    }

    setUpReader();

    return () => {
      cancelled = true;
      engineRef.current?.destroy();
      engineRef.current = null;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  return (
    <section
      className="reader-view"
      aria-label="Режим чтения"
      ref={containerRef}
    />
  );

}
