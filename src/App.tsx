import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { HomeView } from "./features/home/HomeView";
import { ReaderView } from "./features/reader/ReaderView";
import { CollectionsView } from "./features/collections/CollectionsView";
import { BookDetailView } from "./features/book-detail/BookDetailView";
import { AuthorDetailView } from "./features/author-detail/AuthorDetailView";
import { LibraryView } from "./features/library/LibraryView";
import type { LibraryRestoreState } from "./features/library/LibraryView";
import { SearchPanel } from "./features/home/SearchPanel";
import { AppShell } from "./app/AppShell";
import type { AccountShellView } from "./app/AccountMenu";
import { ProfileView } from "./features/profile/ProfileView";
import { MyLibraryView } from "./features/my-library/MyLibraryView";
import { NotesView } from "./features/notes/NotesView";
import { SubscriptionView } from "./features/subscription/SubscriptionView";
import { SettingsView } from "./features/settings/SettingsView";
import { SupportView } from "./features/support/SupportView";
import { loadRemoteCatalog } from "./catalog";
import type { Book } from "./features/reader/engine/types";

// The six account-shell screens (see App() below and the six view
// components under src/features/*) share the AccountShellView union
// already defined next to AccountMenu -- reused here rather than
// redeclared, so the two can never drift apart.
type View =
  | "home"
  | "reader"
  | "collections"
  | "book-detail"
  | "author"
  | "library"
  | AccountShellView;

export type AuthorDetailOrigin =
  | { type: "book-detail"; bookId: string; bookDetailOrigin: BookDetailOrigin | null }
  | { type: "search"; query: string; language: string }
  | { type: "home" };

export type BookDetailOrigin =
  | { type: "search"; query: string; language: string }
  | { type: "collection"; collectionId: string }
  | { type: "author"; authorId: string; returnOrigin: AuthorDetailOrigin }
  | { type: "library"; state: LibraryRestoreState };

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

  const [libraryRestoreState, setLibraryRestoreState] = useState<LibraryRestoreState | null>(null);

  const [, setCatalogVersion] = useState(0);

  // Search panel state used to live inside HomeView, which owned the
  // only <SearchPanel/> instance. It's lifted up here so that
  // GlobalHeader's persistent "Поиск" button/icon (visible on every
  // non-Reader screen, not just Home) can open the exact same panel.
  // SearchPanel itself is unchanged -- it's a self-contained fixed
  // overlay -- only who controls it moved.
  const [isSearchOpen, setSearchOpen] = useState(false);
  const [searchPrefill, setSearchPrefill] = useState<string | null>(null);
  const [searchPrefillLanguage, setSearchPrefillLanguage] = useState("");

  const [isAccountMenuOpen, setAccountMenuOpen] = useState(false);

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

  // Mirrors HomeView's old mount-time effect (it used to run once,
  // synchronously, every time HomeView itself was freshly mounted --
  // i.e. every time `view` became "home"). restoreSearch is set by
  // handleBackFromBookDetail/handleBackFromAuthorDetail's "search"
  // origin branches just before switching back to "home", so re-running
  // this whenever `view` changes to "home" reopens the panel with the
  // same query/language exactly as before.
  useEffect(() => {
    if (view === "home" && restoreSearch) {
      openSearch(restoreSearch.query, restoreSearch.language);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  function openSearch(query?: string, language?: string): void {
    setSearchPrefill(query ?? "");
    setSearchPrefillLanguage(language ?? "");
    setSearchOpen(true);
  }

  function closeSearch(): void {
    setSearchOpen(false);
    setSearchPrefill(null);
  }

  function toggleAccountMenu(): void {
    setAccountMenuOpen(open => !open);
  }

  function closeAccountMenu(): void {
    setAccountMenuOpen(false);
  }

  function handleAccountNavigate(accountView: AccountShellView): void {
    setView(accountView);
  }

  // "Back" from any of the six account shells always lands on Home --
  // acceptable for this visual pass since none of them are reachable
  // from a deep navigation chain (they only open from GlobalHeader's
  // account menu, which is available everywhere).
  function handleBackFromAccountShell(): void {
    setView("home");
  }

  function handleNavigateHome(): void {
    closeAccountMenu();
    setView("home");
  }

  function handleNavigateLibrary(): void {
    closeAccountMenu();
    handleOpenLibrary();
  }

  function handleNavigateCollections(): void {
    closeAccountMenu();
    handleOpenCollections();
  }

  function handleOpenSearchFromHeader(): void {
    closeAccountMenu();
    openSearch();
  }

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

    if (bookDetailOrigin?.type === "library") {
      setLibraryRestoreState(bookDetailOrigin.state);
      setView("library");
      return;
    }

    setView("home");

  }

  // collectionId is optional from HomeView (no id -> generic entry
  // point); Library has no such teaser entry point, so this is always
  // a fresh, from-scratch open — libraryRestoreState is reset to null,
  // matching how handleOpenCollections() with no id resets
  // collectionsInitialId. Returning here from Book Detail / the reader
  // goes through handleBackFromBookDetail / handleExitReader instead,
  // which restore the exact prior state.
  function handleOpenLibrary(): void {
    setLibraryRestoreState(null);
    setView("library");
  }

  function handleBackFromLibrary(): void {
    setView("home");
  }

  function handleOpenBookDetailFromLibrary(bookId: string, state: LibraryRestoreState): void {
    handleOpenBookDetail(bookId, { type: "library", state });
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

  let content: ReactNode;

  if (view === "book-detail" && selectedBookId) {
    content = (
      <BookDetailView
        bookId={selectedBookId}
        onBack={handleBackFromBookDetail}
        onOpenBook={handleOpenBook}
        onOpenAuthorDetail={handleOpenAuthorDetail}
        onOpenCollection={handleOpenCollectionFromDetail}
      />
    );
  } else if (view === "author" && selectedAuthorId) {
    content = (
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
  } else if (view === "collections") {
    content = (
      <CollectionsView
        initialCollectionId={collectionsInitialId}
        onOpenBookDetail={(bookId, collectionId) =>
          handleOpenBookDetail(bookId, { type: "collection", collectionId })
        }
        onBack={handleExitCollections}
      />
    );
  } else if (view === "library") {
    content = (
      <LibraryView
        restoreState={libraryRestoreState}
        onBack={handleBackFromLibrary}
        onOpenBookDetail={handleOpenBookDetailFromLibrary}
      />
    );
  } else if (view === "profile") {
    content = <ProfileView onBack={handleBackFromAccountShell} />;
  } else if (view === "my-library") {
    content = <MyLibraryView onBack={handleBackFromAccountShell} />;
  } else if (view === "notes") {
    content = <NotesView onBack={handleBackFromAccountShell} />;
  } else if (view === "subscription") {
    content = <SubscriptionView onBack={handleBackFromAccountShell} />;
  } else if (view === "settings") {
    content = <SettingsView onBack={handleBackFromAccountShell} />;
  } else if (view === "support") {
    content = <SupportView onBack={handleBackFromAccountShell} />;
  } else {
    content = (
      <HomeView
        onOpenCollections={handleOpenCollections}
        onOpenAuthorDetail={handleOpenAuthorDetailFromHome}
        onOpenLibrary={handleOpenLibrary}
        onOpenSearch={() => openSearch()}
      />
    );
  }

  return (
    <>
      <AppShell
        onNavigateHome={handleNavigateHome}
        onNavigateLibrary={handleNavigateLibrary}
        onNavigateCollections={handleNavigateCollections}
        onOpenSearch={handleOpenSearchFromHeader}
        isAccountMenuOpen={isAccountMenuOpen}
        onToggleAccountMenu={toggleAccountMenu}
        onCloseAccountMenu={closeAccountMenu}
        onAccountNavigate={handleAccountNavigate}
      >
        {content}
      </AppShell>

      <SearchPanel
        isOpen={isSearchOpen}
        prefillQuery={searchPrefill}
        prefillLanguage={searchPrefillLanguage}
        onClose={closeSearch}
        onOpenBookDetail={(bookId, query, language) =>
          handleOpenBookDetail(bookId, { type: "search", query, language })
        }
        onOpenAuthorDetail={handleOpenAuthorDetailFromSearch}
      />
    </>
  );

}
