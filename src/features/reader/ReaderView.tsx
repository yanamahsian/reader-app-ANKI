import { useEffect, useRef } from "react";
import type { Book } from "./engine/types";
import { createReaderEngine, type ReaderEngine } from "./engine/readerEngine";
import { createLocalStorageStore } from "./progressStore/localStorageStore";

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

    // Phase 2 ships only the localStorage implementation of
    // progressStore. Swapping this for a Supabase-backed one later
    // (phase 8) does not require any change to readerEngine.ts.
    const progressStore = createLocalStorageStore();

    const engine = createReaderEngine({
      container: containerRef.current,
      progressStore,
      onExit
    });

    engineRef.current = engine;

    engine.open(book).catch(error => {
      console.error(error);
      alert("Не удалось открыть книгу.");
    });

    return () => {
      engine.destroy();
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
