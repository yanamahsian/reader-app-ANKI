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
import { AtlasView } from "./features/atlas/AtlasView";
import type { MyLibraryRestoreState } from "./features/my-library/MyLibraryView";
import { NotesView } from "./features/notes/NotesView";
import { SubscriptionView } from "./features/subscription/SubscriptionView";
import { SettingsView } from "./features/settings/SettingsView";
import { SupportView } from "./features/support/SupportView";
import { loadRemoteCatalog } from "./catalog";
import type { Book } from "./features/reader/engine/types";

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
  | { type: "library"; state: LibraryRestoreState }
  | { type: "atlas" }
  | { type: "my-library"; state: MyLibraryRestoreState };

const TEST_EPUB_BOOK: Book = {
  id: "phase3-test-epub",
  title: "Phase 3 test EPUB",
  url: `${import.meta.env.BASE_URL}books/test.epub`,
  format: "epub"
};

const NAVIGATION_SESSION_KEY = "anki-navigation-state-v1";

interface NavigationSessionState {
  view: View;
  currentBook: Book | null;
  selectedBookId: string | null;
  bookDetailOrigin: BookDetailOrigin | null;
  bookDetailInitialEdition: { editionId: string; language: string } | null;
  selectedAuthorId: string | null;
  authorDetailOrigin: AuthorDetailOrigin | null;
  restoreSearch: { query: string; language: string } | null;
  collectionsInitialId: string | null;
  libraryRestoreState: LibraryRestoreState | null;
  myLibraryRestoreState: MyLibraryRestoreState | null;
  isSearchOpen: boolean;
  searchPrefill: string | null;
  searchPrefillLanguage: string;
}

const VALID_VIEWS: readonly View[] = [
  "home",
  "reader",
  "collections",
  "book-detail",
  "author",
  "library",
  "profile",
  "my-library",
  "atlas",
  "notes",
  "subscription",
  "settings",
  "support"
];

function readNavigationSession(): Partial<NavigationSessionState> {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.sessionStorage.getItem(NAVIGATION_SESSION_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Partial<NavigationSessionState>;
    if (!parsed.view || !VALID_VIEWS.includes(parsed.view)) return {};

    if (parsed.view === "reader" && !parsed.currentBook) {
      return { ...parsed, view: "home" };
    }

    if (parsed.view === "book-detail" && !parsed.selectedBookId) {
      return { ...parsed, view: "home" };
    }

    if (parsed.view === "author" && !parsed.selectedAuthorId) {
      return { ...parsed, view: "home" };
    }

    return parsed;
  } catch {
    return {};
  }
}

export function App() {

  const [initialNavigation] = useState(() => readNavigationSession());

  const [view, setView] = useState<View>(initialNavigation.view ?? "home");
  const [currentBook, setCurrentBook] = useState<Book | null>(initialNavigation.currentBook ?? null);

  const [selectedBookId, setSelectedBookId] = useState<string | null>(initialNavigation.selectedBookId ?? null);
  const [bookDetailOrigin, setBookDetailOrigin] = useState<BookDetailOrigin | null>(
    initialNavigation.bookDetailOrigin ?? null
  );
  const [bookDetailInitialEdition, setBookDetailInitialEdition] =
    useState<{ editionId: string; language: string } | null>(
      initialNavigation.bookDetailInitialEdition ?? null
    );

  const [selectedAuthorId, setSelectedAuthorId] = useState<string | null>(
    initialNavigation.selectedAuthorId ?? null
  );
  const [authorDetailOrigin, setAuthorDetailOrigin] = useState<AuthorDetailOrigin | null>(
    initialNavigation.authorDetailOrigin ?? null
  );

  const [restoreSearch, setRestoreSearch] = useState<{ query: string; language: string } | null>(
    initialNavigation.restoreSearch ?? null
  );
  const [collectionsInitialId, setCollectionsInitialId] = useState<string | null>(
    initialNavigation.collectionsInitialId ?? null
  );

  const [libraryRestoreState, setLibraryRestoreState] = useState<LibraryRestoreState | null>(
    initialNavigation.libraryRestoreState ?? null
  );
  const [myLibraryRestoreState, setMyLibraryRestoreState] = useState<MyLibraryRestoreState | null>(
    initialNavigation.myLibraryRestoreState ?? null
  );

  const [, setCatalogVersion] = useState(0);

  const [isSearchOpen, setSearchOpen] = useState(initialNavigation.isSearchOpen ?? false);
  const [searchPrefill, setSearchPrefill] = useState<string | null>(
    initialNavigation.searchPrefill ?? null
  );
  const [searchPrefillLanguage, setSearchPrefillLanguage] = useState(
    initialNavigation.searchPrefillLanguage ?? ""
  );

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

  useEffect(() => {
    const navigationState: NavigationSessionState = {
      view,
      currentBook,
      selectedBookId,
      bookDetailOrigin,
      bookDetailInitialEdition,
      selectedAuthorId,
      authorDetailOrigin,
      restoreSearch,
      collectionsInitialId,
      libraryRestoreState,
      myLibraryRestoreState,
      isSearchOpen,
      searchPrefill,
      searchPrefillLanguage
    };

    try {
      window.sessionStorage.setItem(NAVIGATION_SESSION_KEY, JSON.stringify(navigationState));
    } catch {
      // Navigation persistence is a convenience only; never break the app
      // if storage is unavailable or blocked by the browser.
    }
  }, [
    view,
    currentBook,
    selectedBookId,
    bookDetailOrigin,
    bookDetailInitialEdition,
    selectedAuthorId,
    authorDetailOrigin,
    restoreSearch,
    collectionsInitialId,
    libraryRestoreState,
    myLibraryRestoreState,
    isSearchOpen,
    searchPrefill,
    searchPrefillLanguage
  ]);

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

  function handleOpenCollections(collectionId?: string): void {
    setCollectionsInitialId(collectionId ?? null);
    setView("collections");
  }

  function handleExitCollections(): void {
    setView("home");
  }

  function handleOpenBookDetail(
    bookId: string,
    origin: BookDetailOrigin,
    initialEdition: { editionId: string; language: string } | null = null
  ): void {
    setSelectedBookId(bookId);
    setBookDetailOrigin(origin);
    setBookDetailInitialEdition(initialEdition);
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

    if (bookDetailOrigin?.type === "my-library") {
      setMyLibraryRestoreState(bookDetailOrigin.state);
      setView("my-library");
      return;
    }

    if (bookDetailOrigin?.type === "atlas") {
      setView("atlas");
      return;
    }

    setView("home");

  }

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

  function handleOpenBookDetailFromMyLibrary(
    bookId: string,
    state: MyLibraryRestoreState,
    initialEdition: { editionId: string; language: string } | null
  ): void {
    handleOpenBookDetail(bookId, { type: "my-library", state }, initialEdition);
  }

  function handleRequireSignIn(): void {
    setView("profile");
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
        onRequireSignIn={handleRequireSignIn}
        initialEdition={bookDetailInitialEdition}
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
    content = (
      <MyLibraryView
        onBack={handleBackFromAccountShell}
        restoreState={myLibraryRestoreState}
        onOpenBookDetail={handleOpenBookDetailFromMyLibrary}
        onRequireSignIn={handleRequireSignIn}
        onOpenLibrary={handleOpenLibrary}
      />
    );
  } else if (view === "atlas") {
    content = (
      <AtlasView
        onBack={handleBackFromAccountShell}
        onOpenBookDetail={bookId => handleOpenBookDetail(bookId, { type: "atlas" })}
        onRequireSignIn={handleRequireSignIn}
      />
    );
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
