import { useEffect, useState } from "react";
import { HomeView } from "./features/home/HomeView";
import { ReaderView } from "./features/reader/ReaderView";
import { CollectionsView } from "./features/collections/CollectionsView";
import type { Book } from "./features/reader/engine/types";

type View = "home" | "reader" | "collections";

// ============================================================
// PHASE 3 TEST HOOK — TEMPORARY, not part of the product UI.
// Lets a specific EPUB be opened directly via a URL query param,
// without touching omnia-library, Supabase, or the real catalog.
// To remove once EPUB support is verified: delete this whole
// block (TEST_EPUB_BOOK + the useEffect below that reads
// "openTestEpub") and the `useEffect` import if nothing else in
// this file still needs it.
// Usage: append ?openTestEpub=1 to the site URL, with a real
// EPUB file placed at public/books/test.epub.
// ============================================================
const TEST_EPUB_BOOK: Book = {
  id: "phase3-test-epub",
  title: "Phase 3 test EPUB",
  url: `${import.meta.env.BASE_URL}books/test.epub`,
  format: "epub"
};
// ============================================================

export function App() {

  const [view, setView] = useState<View>("home");
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  // PHASE 3 TEST HOOK — see block above. Remove this effect together
  // with TEST_EPUB_BOOK when no longer needed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openTestEpub") === "1") {
      setCurrentBook(TEST_EPUB_BOOK);
      setView("reader");
    }
  }, []);

  function handleOpenBook(book: Book): void {
    setCurrentBook(book);
    setView("reader");
  }

  function handleExitReader(): void {
    setView("home");
  }

  function handleOpenCollections(): void {
    setView("collections");
  }

  function handleExitCollections(): void {
    setView("home");
  }

  if (view === "reader" && currentBook) {
    return <ReaderView book={currentBook} onExit={handleExitReader} />;
  }

  if (view === "collections") {
    return <CollectionsView onOpenBook={handleOpenBook} onBack={handleExitCollections} />;
  }

  return <HomeView onOpenBook={handleOpenBook} onOpenCollections={handleOpenCollections} />;

}
