import { useEffect, useRef, useState } from "react";
import type { Book } from "./engine/types";
import type { LoadedDocument } from "./engine/formats/types";
import { createReaderEngine, type ReaderEngine } from "./engine/readerEngine";
import { detectLoader } from "./engine/formats/detect";
import { searchLoadedDocument, type InBookSearchResult } from "./engine/inBookSearch";
import { createLocalStorageStore } from "./progressStore/localStorageStore";
import { createSupabaseProgressStore } from "./progressStore/supabaseProgressStore";
import { createSupabaseAnnotationStore } from "./annotationStore";
import { createSupabaseThoughtThreadBridge } from "./threadBridge";
import { getSession } from "../../auth/supabaseAuth";
import { fetchProgress } from "../../api/readerProgress";
import "./readerSearch.css";

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

function highlightVisibleSearchMatch(container: HTMLElement | null, matchText: string): void {

  const viewer = container?.querySelector<HTMLElement>(".viewer-text");
  if (!viewer) return;

  const exact = matchText.trim();
  const longestToken = exact
    .split(/\s+/u)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)[0] ?? "";

  const candidates = Array.from(new Set([exact, longestToken].filter(Boolean)));
  const walker = document.createTreeWalker(viewer, NodeFilter.SHOW_TEXT);

  for (const candidate of candidates) {

    const needle = candidate.toLocaleLowerCase();
    let node = walker.nextNode();

    while (node) {

      const textNode = node as Text;
      const source = textNode.data;
      const index = source.toLocaleLowerCase().indexOf(needle);

      if (index >= 0) {
        const range = document.createRange();
        range.setStart(textNode, index);
        range.setEnd(textNode, index + candidate.length);

        const mark = document.createElement("mark");
        mark.className = "reader-search-hit";

        try {
          range.surroundContents(mark);
          mark.scrollIntoView({ block: "center", behavior: "smooth" });
          viewer.focus({ preventScroll: true });

          window.setTimeout(() => {
            if (!mark.isConnected) return;
            mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
            viewer.normalize();
          }, 2600);

          return;
        } catch {
          // If the current rendered HTML makes wrapping unsafe, fall back
          // to focusing the page rather than mutating the Reader DOM.
          viewer.focus();
          return;
        }
      }

      node = walker.nextNode();

    }

  }

  viewer.focus();

}

// Thin React wrapper. All reader behaviour — pagination, selection,
// action sheet, touch/keyboard nav — lives in readerEngine.ts, a plain
// vanilla TypeScript module. This component only mounts a container
// for it and calls its public API (open/destroy); React never reaches
// into the engine's internal DOM except for the additive in-book-search
// bridge below, which uses the engine's existing public page slider as
// its navigation surface instead of creating a second page state.
export function ReaderView({ book, onExit, navigationTarget }: ReaderViewProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDocumentRef = useRef<Promise<LoadedDocument> | null>(null);
  const activeBookIdRef = useRef(book.id);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InBookSearchResult[]>([]);
  const [searchTotalMatches, setSearchTotalMatches] = useState(0);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!searchOpen) return;
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  useEffect(() => {

    function handleSearchShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        setSearchOpen(true);
      }
    }

    window.addEventListener("keydown", handleSearchShortcut, true);
    return () => window.removeEventListener("keydown", handleSearchShortcut, true);

  }, []);

  useEffect(() => {

    if (!containerRef.current) return;
    const container = containerRef.current;

    activeBookIdRef.current = book.id;
    searchDocumentRef.current = null;
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchTotalMatches(0);
    setSearchTruncated(false);
    setSearchLoading(false);
    setSearchError(null);

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
    let searchButton: HTMLButtonElement | null = null;

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

      // IN-BOOK SEARCH v1: additive control inside the existing Reader
      // toolbar. Search itself stays in this React wrapper so the mature
      // vanilla readerEngine.ts page/selection/highlight machinery does
      // not need to be rewritten. Result navigation goes through the
      // engine's existing progress slider input event, preserving the
      // single canonical page index and the existing progress-save path.
      const overlayActions = container.querySelector<HTMLElement>(".reader-overlay-actions");
      if (overlayActions) {
        searchButton = document.createElement("button");
        searchButton.className = "ghost-btn reader-search-trigger";
        searchButton.type = "button";
        searchButton.setAttribute("aria-label", "Поиск внутри книги");
        searchButton.textContent = "Поиск";
        searchButton.addEventListener("click", () => setSearchOpen(true));
        overlayActions.prepend(searchButton);
      }

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
      searchButton?.remove();
      engineRef.current?.destroy();
      engineRef.current = null;
      searchDocumentRef.current = null;
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book]);

  async function runSearch(): Promise<void> {

    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchTotalMatches(0);
      setSearchTruncated(false);
      setSearchError(null);
      return;
    }

    const requestedBookId = book.id;
    setSearchLoading(true);
    setSearchError(null);
    setSearchResults([]);
    setSearchTotalMatches(0);
    setSearchTruncated(false);

    try {

      let documentPromise = searchDocumentRef.current;

      // The search index is loaded lazily on the first actual search.
      // Most visitors never pay a second parse/fetch at all; when they do,
      // the browser can normally satisfy the same book URL from cache.
      if (!documentPromise) {
        documentPromise = detectLoader(book).load(book);
        searchDocumentRef.current = documentPromise;
      }

      let document: LoadedDocument;
      try {
        document = await documentPromise;
      } catch (error) {
        if (searchDocumentRef.current === documentPromise) searchDocumentRef.current = null;
        throw error;
      }

      if (activeBookIdRef.current !== requestedBookId) return;

      const response = searchLoadedDocument(document, query);
      setSearchResults(response.results);
      setSearchTotalMatches(response.totalMatches);
      setSearchTruncated(response.truncated);

    } catch (error) {
      console.error("in-book search failed:", error);
      if (activeBookIdRef.current === requestedBookId) {
        setSearchError("Не удалось выполнить поиск по этой книге.");
      }
    } finally {
      if (activeBookIdRef.current === requestedBookId) setSearchLoading(false);
    }

  }

  function jumpToSearchResult(result: InBookSearchResult): void {

    const container = containerRef.current;
    const slider = container?.querySelector<HTMLInputElement>(".reader-progress-slider");

    if (!slider) {
      setSearchError("Не удалось перейти к найденному фрагменту.");
      return;
    }

    slider.value = String(result.pageIndex);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    setSearchOpen(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => highlightVisibleSearchMatch(container, result.matchText));
    });

  }

  return (
    <>
      <section
        className="reader-view"
        aria-label="Режим чтения"
        ref={containerRef}
      />

      {searchOpen && (
        <div
          className="reader-search-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <section
            className="reader-search-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Поиск внутри книги"
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                setSearchOpen(false);
              }
            }}
          >
            <div className="reader-search-head">
              <h2 className="reader-search-title">Поиск по книге</h2>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setSearchOpen(false)}
              >
                Закрыть
              </button>
            </div>

            <form
              className="reader-search-form"
              onSubmit={event => {
                event.preventDefault();
                void runSearch();
              }}
            >
              <input
                ref={searchInputRef}
                className="reader-search-input"
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Слово или фраза"
                autoComplete="off"
                spellCheck={false}
                aria-label="Текст для поиска"
              />
              <button
                type="submit"
                className="ghost-btn reader-search-submit"
                disabled={searchLoading || !searchQuery.trim()}
              >
                Найти
              </button>
            </form>

            <div
              className={`reader-search-status${searchError ? " error" : ""}`}
              aria-live="polite"
            >
              {searchLoading && "Ищем по книге…"}
              {!searchLoading && searchError}
              {!searchLoading && !searchError && searchQuery.trim() && searchTotalMatches === 0 && searchResults.length === 0 && "Совпадений нет."}
              {!searchLoading && !searchError && searchTotalMatches > 0 && (
                searchTruncated
                  ? `Найдено: ${searchTotalMatches}. Показаны первые ${searchResults.length}.`
                  : `Найдено: ${searchTotalMatches}.`
              )}
            </div>

            <div className="reader-search-results">
              {searchResults.map((result, index) => (
                <button
                  key={`${result.pageIndex}:${result.startOffset}:${index}`}
                  type="button"
                  className="reader-search-result"
                  onClick={() => jumpToSearchResult(result)}
                >
                  <span className="reader-search-result-meta">
                    {result.chapterTitle ? `${result.chapterTitle} · ` : ""}
                    стр. {result.pageIndex + 1}
                  </span>
                  <span className="reader-search-result-snippet">
                    {result.leadingEllipsis ? "…" : ""}
                    {result.beforeText}
                    {result.beforeText ? " " : ""}
                    <mark className="reader-search-result-match">{result.matchText}</mark>
                    {result.afterText ? " " : ""}
                    {result.afterText}
                    {result.trailingEllipsis ? "…" : ""}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );

}
