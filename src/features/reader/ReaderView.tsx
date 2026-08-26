import { useEffect, useRef } from "react";
import type { Book } from "./engine/types";
import { createReaderEngine, type ReaderEngine } from "./engine/readerEngine";
import { createLocalStorageStore } from "./progressStore/localStorageStore";
import { createSupabaseProgressStore } from "./progressStore/supabaseProgressStore";
import { getSession } from "../../auth/supabaseAuth";
import { fetchProgress } from "../../api/readerProgress";

interface ReaderViewProps {
  book: Book;
  onExit: () => void;
}

// Thin React wrapper. All reader behaviour — pagination, selection,
// action sheet, touch/keyboard nav — lives in readerEngine.ts, a plain
// vanilla TypeScript module. This component only mounts a container
// for it and calls its public API (open/destroy); React never reaches
// into the engine's internal DOM.
export function ReaderView({ book, onExit }: ReaderViewProps) {

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

      // The visitor could have navigated away (book changed, or this
      // view unmounted) while fetchProgress() above was in flight --
      // don't build/open an engine for a book that's no longer current.
      if (cancelled) return;

      const engine = createReaderEngine({
        container,
        progressStore,
        onExit
      });

      engineRef.current = engine;

      engine.open(book).catch(error => {
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
