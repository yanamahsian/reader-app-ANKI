import { useEffect, useState } from "react";
import { HomeView } from "./features/home/HomeView";
import { ReaderView } from "./features/reader/ReaderView";
import { CollectionsView } from "./features/collections/CollectionsView";
import { BookDetailView } from "./features/book-detail/BookDetailView";
import { AuthorDetailView } from "./features/author-detail/AuthorDetailView";
import { loadRemoteCatalog } from "./catalog";
import type { Book } from "./features/reader/engine/types";

type View = "home" | "reader" | "collections" | "book-detail" | "author";

export type AuthorDetailOrigin =
  | { type: "book-detail"; bookId: string; bookDetailOrigin: BookDetailOrigin | null }
  | { type: "search"; query: string; language: string }
  | { type: "home" };

export type BookDetailOrigin =
  | { type: "search"; query: string; language: string }
  | { type: "collection"; collectionId: string }
  | { type: "author"; authorId: string; returnOrigin: AuthorDetailOrigin };

const TEST_EPUB_BOOK: Book = {
  id: "phase3-test-epub",
  title: "Phase 3 test EPUB",
  url: `${import.meta.env.BASE_URL}books/test.epub`,
  format: "epub"
};

export function App() {

  const [view, setView] = useState<View>("home");
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [bookDetailOrigin, setBookDetailOrigin] = useState<BookDetailOrigin | null>(null);

  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(null);
  const [authorDetailOrigin, setAuthorDetailOrigin] = useState<AuthorDetailOrigin | null>(null);

  const [restoreSearch, setRestoreSearch] = useState<{ query: string; language: string } | null>(null);
  const [collectionsInitialId, setCollectionsInitialId] = useState<string | null>(null);

  const [, setCatalogVersion] = useState(0);

  useEffect(() => {
    loadRemoteCatalog()
      .then(() => setCatalogVersion(version => version + 1))
      .catch(() => {
      });
  }, []);

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
    if (selectedBookId) {
      setView("book-detail");
    } else {
      setView("home");
    }
  }

  // collectionId is optional: called with none from the generic
  // "Подборки"/"Смотреть всё" entry points (opens the full grid, as
  // before), or with a specific id from a HomeView teaser card —
  // jumps straight to that collection, reusing the same
  // collectionsInitialId mechanism already used when returning here
  // from Book Detail. Needed so that, once there are dozens of
  // collections, clicking a named card on the home page doesn't dump
  // the visitor into the undifferentiated full list.
  function handleOpenCollections(collectionId?: string): void {
    setCollectionsInitialId(collectionId ?? null);
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

    if (bookDetailOrigin?.type === "author") {
      setSelectedAuthorId(bookDetailOrigin.authorId);
      setAuthorDetailOrigin(bookDetailOrigin.returnOrigin);
      setView("author");
      return;
    }

    setView("home");

  }

  function handleOpenAuthorDetail(authorId: string): void {
    if (selectedBookId) {
      setAuthorDetailOrigin({ type: "book-detail", bookId: selectedBookId, bookDetailOrigin });
    } else {
      setAuthorDetailOrigin({ type: "home" });
    }
    setSelectedAuthorId(authorId);
    setView("author");
  }

  function handleOpenAuthorDetailFromHome(authorId: string): void {
    setSelectedAuthorId(authorId);
    setAuthorDetailOrigin({ type: "home" });
    setView("author");
  }

  function handleOpenAuthorDetailFromSearch(authorId: string, query: string, language: string): void {
    setSelectedAuthorId(authorId);
    setAuthorDetailOrigin({ type: "search", query, language });
    setView("author");
  }

  function handleBackFromAuthorDetail(): void {

    if (authorDetailOrigin?.type === "book-detail") {
      setSelectedBookId(authorDetailOrigin.bookId);
      setBookDetailOrigin(authorDetailOrigin.bookDetailOrigin);
      setView("book-detail");
      return;
    }

    if (authorDetailOrigin?.type === "search") {
      setRestoreSearch({ query: authorDetailOrigin.query, language: authorDetailOrigin.language });
      setView("home");
      return;
    }

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
        onOpenAuthorDetail={handleOpenAuthorDetail}
        onOpenCollection={handleOpenCollectionFromDetail}
      />
    );
  }

  if (view === "author" && selectedAuthorId) {
    return (
      <AuthorDetailView
        authorId={selectedAuthorId}
        onBack={handleBackFromAuthorDetail}
        onOpenBookDetail={bookId =>
          handleOpenBookDetail(bookId, {
            type: "author",
            authorId: selectedAuthorId,
            returnOrigin: authorDetailOrigin ?? { type: "home" }
          })
        }
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
      onOpenAuthorDetail={handleOpenAuthorDetailFromHome}
      onOpenAuthorDetailFromSearch={handleOpenAuthorDetailFromSearch}
    />
  );

}
