import { useEffect, useState } from "react";
import { HomeView } from "./features/home/HomeView";
import { ReaderView } from "./features/reader/ReaderView";
import { CollectionsView } from "./features/collections/CollectionsView";
import { BookDetailView } from "./features/book-detail/BookDetailView";
import type { Book } from "./features/reader/engine/types";

type View = "home" | "reader" | "collections" | "book-detail";

// Where a Book Detail visit came from, so "← Назад" can return to the
// exact same place instead of always dropping back to a blank home
// screen. Search is re-run from (query, language) rather than storing
// its result list, because searchCatalog() is a pure function of
// those two inputs — re-running it always reproduces the same
// ranked results, so there is nothing else that needs to be carried.
export type BookDetailOrigin =
  | { type: "search"; query: string; language: string }
  | { type: "collection"; collectionId: string };

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

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [bookDetailOrigin, setBookDetailOrigin] = useState<BookDetailOrigin | null>(null);

  // Carried back into HomeView/CollectionsView on their next mount so
  // they can jump straight to "these exact search results" or "this
  // exact collection" instead of resetting to their default state.
  const [restoreSearch, setRestoreSearch] = useState<{ query: string; language: string } | null>(null);
  const [collectionsInitialId, setCollectionsInitialId] = useState<string | null>(null);

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
    // A fresh entry from the sidebar always shows the collections
    // grid, not a stale detail view left over from an earlier visit.
    setCollectionsInitialId(null);
    setView("collections");
  }

  function handleExitCollections(): void {
    setView("home");
  }

  function handleOpenBookDetail(bookId: string, origin: BookDetailOrigin): void {
    setSelectedBookId(bookId);
    setBookDetailOrigin(origin);
    setView("book-detail");
  }

  function handleBackFromBookDetail(): void {

    if (bookDetailOrigin?.type === "search") {
      setRestoreSearch({ query: bookDetailOrigin.query, language: bookDetailOrigin.language });
      setView("home");
      return;
    }

    if (bookDetailOrigin?.type === "collection") {
      setCollectionsInitialId(bookDetailOrigin.collectionId);
      setView("collections");
      return;
    }

    setView("home");

  }

  // Clicking an author's name on Book Detail reuses the existing
  // search flow verbatim (same ranking, same SearchPanel) rather than
  // any new lookup mechanism — it is exactly "go run this search".
  function handleOpenAuthorSearch(authorName: string): void {
    setRestoreSearch({ query: authorName, language: "" });
    setView("home");
  }

  function handleOpenCollectionFromDetail(collectionId: string): void {
    setCollectionsInitialId(collectionId);
    setView("collections");
  }

  if (view === "reader" && currentBook) {
    return <ReaderView book={currentBook} onExit={handleExitReader} />;
  }

  if (view === "book-detail" && selectedBookId) {
    return (
      <BookDetailView
        bookId={selectedBookId}
        onBack={handleBackFromBookDetail}
        onOpenBook={handleOpenBook}
        onOpenAuthorSearch={handleOpenAuthorSearch}
        onOpenCollection={handleOpenCollectionFromDetail}
      />
    );
  }

  if (view === "collections") {
    return (
      <CollectionsView
        initialCollectionId={collectionsInitialId}
        onOpenBookDetail={(bookId, collectionId) =>
          handleOpenBookDetail(bookId, { type: "collection", collectionId })
        }
        onBack={handleExitCollections}
      />
    );
  }

  return (
    <HomeView
      restoreSearch={restoreSearch}
      onOpenBookDetail={(bookId, query, language) =>
        handleOpenBookDetail(bookId, { type: "search", query, language })
      }
      onOpenCollections={handleOpenCollections}
    />
  );

}
