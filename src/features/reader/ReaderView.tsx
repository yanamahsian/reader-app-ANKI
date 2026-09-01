import { useEffect, useRef, useState } from "react";
import type { Book } from "./engine/types";
import type { LoadedDocument } from "./engine/formats/types";
import { createReaderEngine, type ReaderEngine } from "./engine/readerEngine";
import { detectLoader } from "./engine/formats/detect";
import { searchLoadedDocument, type InBookSearchResult } from "./engine/inBookSearch";
import { computeAnchorFromRange } from "./engine/highlightAnchor";
import { createLocalStorageStore } from "./progressStore/localStorageStore";
import { createSupabaseProgressStore } from "./progressStore/supabaseProgressStore";
import { createSupabaseAnnotationStore } from "./annotationStore";
import { createSupabaseThoughtThreadBridge } from "./threadBridge";
import { getSession } from "../../auth/supabaseAuth";
import { fetchProgress } from "../../api/readerProgress";
import { revealPassage } from "../../api/reveal";
import { AIEntitlementError, describeAIEntitlementErrorRu } from "../../api/aiEntitlements";
import "./readerSearch.css";
import "./readerReveal.css";

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

interface RevealFlatPage {
  rawText: string;
  chapterTitle: string | null;
}

function flattenForReveal(document: LoadedDocument): RevealFlatPage[] {
  return document.chapters.flatMap(chapter =>
    chapter.pages.map(page => ({
      rawText: page.rawText,
      chapterTitle: chapter.title
    }))
  );
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

  for (const candidate of candidates) {

    const needle = candidate.toLocaleLowerCase();
    // A fresh walker is required for every candidate. The exact phrase can
    // legitimately span multiple DOM text nodes (for example around a saved
    // highlight); reusing an exhausted walker would prevent the token fallback
    // from ever examining the page.
    const walker = document.createTreeWalker(viewer, NodeFilter.SHOW_TEXT);
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

// Thin React wrapper. All mature reader behaviour — pagination, selection,
// action sheet, touch/keyboard nav — stays in readerEngine.ts. The two
// additive tools that need document-wide context (in-book Search and Reveal)
// live here and navigate/read through the engine's already-rendered DOM and
// canonical page slider instead of introducing a second page state.
export function ReaderView({ book, onExit, navigationTarget }: ReaderViewProps) {

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ReaderEngine | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDocumentRef = useRef<Promise<LoadedDocument> | null>(null);
  const revealAbortRef = useRef<AbortController | null>(null);
  const revealCacheRef = useRef<Map<string, string>>(new Map());
  const activeBookIdRef = useRef(book.id);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<InBookSearchResult[]>([]);
  const [searchTotalMatches, setSearchTotalMatches] = useState(0);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHasRun, setSearchHasRun] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [revealOpen, setRevealOpen] = useState(false);
  const [revealSelection, setRevealSelection] = useState("");
  const [revealAnswer, setRevealAnswer] = useState("");
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

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

  async function loadToolDocument(): Promise<LoadedDocument> {
    let documentPromise = searchDocumentRef.current;
    if (!documentPromise) {
      documentPromise = detectLoader(book).load(book);
      searchDocumentRef.current = documentPromise;
    }

    try {
      return await documentPromise;
    } catch (error) {
      if (searchDocumentRef.current === documentPromise) searchDocumentRef.current = null;
      throw error;
    }
  }

  async function runReveal(
    text: string,
    range: Range | null,
    viewer: HTMLElement,
    container: HTMLElement
  ): Promise<void> {
    const selectedText = text.trim();
    if (!selectedText) return;

    const requestedBookId = book.id;
    setRevealSelection(selectedText);
    setRevealAnswer("");
    setRevealError(null);
    setRevealLoading(true);
    setRevealOpen(true);

    revealAbortRef.current?.abort();
    const controller = new AbortController();
    revealAbortRef.current = controller;

    try {
      const document = await loadToolDocument();
      if (activeBookIdRef.current !== requestedBookId) return;

      const flatPages = flattenForReveal(document);
      if (!flatPages.length) throw new Error("Reveal document has no pages");

      const slider = container.querySelector<HTMLInputElement>(".reader-progress-slider");
      const requestedPage = Number(slider?.value ?? 0);
      const pageIndex = Number.isFinite(requestedPage)
        ? Math.max(0, Math.min(Math.trunc(requestedPage), flatPages.length - 1))
        : 0;
      const page = flatPages[pageIndex];

      let selectionStart: number | null = null;
      if (range) {
        try {
          selectionStart = computeAnchorFromRange(viewer, page.rawText, range)?.startOffset ?? null;
        } catch {
          selectionStart = null;
        }
      }

      if (selectionStart === null) {
        const fallbackIndex = page.rawText.indexOf(selectedText);
        selectionStart = fallbackIndex >= 0 ? fallbackIndex : null;
      }

      // Reveal receives only text that PRECEDES the selected passage. It never
      // gets future pages, and it never gets text after the selection on the
      // current page. This makes spoiler safety a data boundary in addition to
      // a prompt instruction.
      const precedingPages = flatPages
        .slice(Math.max(0, pageIndex - 3), pageIndex)
        .map(item => item.rawText)
        .join("\n\n");
      const currentPageBefore = selectionStart === null
        ? ""
        : page.rawText.slice(Math.max(0, selectionStart - 7000), selectionStart);
      const contextBefore = `${precedingPages}\n\n${currentPageBefore}`.trim().slice(-14000);

      const cacheKey = [
        requestedBookId,
        pageIndex,
        selectedText,
        contextBefore.slice(-3000)
      ].join("::");
      const cached = revealCacheRef.current.get(cacheKey);
      if (cached) {
        setRevealAnswer(cached);
        return;
      }

      const answer = await revealPassage(
        {
          text: selectedText,
          language: "ru",
          contextBefore,
          book: {
            title: book.title,
            author: book.author?.trim() || null,
            year: book.year === undefined ? null : String(book.year),
            sourceLanguage: book.language?.trim() || null,
            chapterTitle: page.chapterTitle,
            pageIndex,
            totalPages: flatPages.length
          }
        },
        controller.signal
      );

      if (activeBookIdRef.current !== requestedBookId) return;
      revealCacheRef.current.set(cacheKey, answer);
      setRevealAnswer(answer);
    } catch (error) {
      if ((error as Error).name === "AbortError") return;
      if (activeBookIdRef.current !== requestedBookId) return;
      if (error instanceof AIEntitlementError) {
        setRevealError(describeAIEntitlementErrorRu(error.kind));
      } else {
        console.error("Reader Reveal failed:", error);
        setRevealError("Не удалось получить контекст Reveal.");
      }
    } finally {
      if (activeBookIdRef.current === requestedBookId && revealAbortRef.current === controller) {
        setRevealLoading(false);
        revealAbortRef.current = null;
      }
    }
  }

  function closeReveal(): void {
    revealAbortRef.current?.abort();
    revealAbortRef.current = null;
    setRevealLoading(false);
    setRevealOpen(false);
  }

  useEffect(() => {

    if (!containerRef.current) return;
    const container = containerRef.current;

    activeBookIdRef.current = book.id;
    searchDocumentRef.current = null;
    revealAbortRef.current?.abort();
    revealAbortRef.current = null;
    revealCacheRef.current.clear();
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchTotalMatches(0);
    setSearchTruncated(false);
    setSearchLoading(false);
    setSearchHasRun(false);
    setSearchError(null);
    setRevealOpen(false);
    setRevealSelection("");
    setRevealAnswer("");
    setRevealLoading(false);
    setRevealError(null);

    // USER LIBRARY PHASE: book.id is now an Edition id (see
    // toReaderBook.ts's own comment on this). A signed-in visitor gets
    // a Supabase-backed store, seeded with their saved position and
    // account-synced bookmarks before engine.open() keeps its synchronous
    // ProgressStore contract. Guests keep the localStorage store.
    let cancelled = false;
    let searchButton: HTMLButtonElement | null = null;
    let revealButton: HTMLButtonElement | null = null;
    let revealSelectionListener: (() => void) | null = null;

    async function setUpReader() {

      const session = getSession();
      const progressStore = session
        ? createSupabaseProgressStore(book.id, await fetchProgress(book.id))
        : createLocalStorageStore();

      const annotationStore = session && book.workId
        ? createSupabaseAnnotationStore(session.user.id, book.workId, book.id)
        : null;

      const threadBridge = session && book.workId
        ? createSupabaseThoughtThreadBridge()
        : null;

      if (cancelled) return;

      const engine = createReaderEngine({
        container,
        progressStore,
        annotationStore,
        threadBridge,
        onExit
      });

      engineRef.current = engine;

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

      // Reveal is additive to the existing mature selection toolbar. The
      // SelectionController still owns selection UI and its Translate /
      // Explain / Save actions; this bridge only remembers the same current
      // selection and adds one fourth action without rewriting that controller.
      const viewer = container.querySelector<HTMLElement>(".viewer-text");
      const selectionToolbar = document.querySelector<HTMLElement>(".selection-toolbar");
      let revealSelectedText = "";
      let revealSelectedRange: Range | null = null;

      if (viewer && selectionToolbar) {
        revealSelectionListener = () => {
          const currentSelection = window.getSelection();
          if (!currentSelection || currentSelection.rangeCount === 0) return;
          const anchorNode = currentSelection.anchorNode;
          const selectedText = currentSelection.toString().trim();
          if (!anchorNode || !selectedText || !viewer.contains(anchorNode)) return;
          revealSelectedText = selectedText;
          revealSelectedRange = currentSelection.getRangeAt(0).cloneRange();
        };
        document.addEventListener("selectionchange", revealSelectionListener);

        revealButton = document.createElement("button");
        revealButton.type = "button";
        revealButton.className = "reader-reveal-trigger";
        revealButton.textContent = "Reveal";
        revealButton.setAttribute("aria-label", "Reveal — показать скрытый контекст фрагмента");
        revealButton.addEventListener("click", () => {
          selectionToolbar.style.display = "none";
          const text = revealSelectedText;
          const range = revealSelectedRange?.cloneRange() ?? null;
          if (!text.trim()) return;
          void runReveal(text, range, viewer, container);
        });

        const saveButton = Array.from(selectionToolbar.querySelectorAll("button"))
          .find(button => button.textContent?.trim() === "Сохранить");
        if (saveButton) selectionToolbar.insertBefore(revealButton, saveButton);
        else selectionToolbar.appendChild(revealButton);
      }

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
      revealButton?.remove();
      if (revealSelectionListener) document.removeEventListener("selectionchange", revealSelectionListener);
      revealAbortRef.current?.abort();
      revealAbortRef.current = null;
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
      setSearchHasRun(false);
      setSearchError(null);
      return;
    }

    const requestedBookId = book.id;
    setSearchLoading(true);
    setSearchHasRun(true);
    setSearchError(null);
    setSearchResults([]);
    setSearchTotalMatches(0);
    setSearchTruncated(false);

    try {
      const document = await loadToolDocument();
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
                onChange={event => {
                  setSearchQuery(event.target.value);
                  setSearchResults([]);
                  setSearchTotalMatches(0);
                  setSearchTruncated(false);
                  setSearchHasRun(false);
                  setSearchError(null);
                }}
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
              {!searchLoading && !searchError && searchHasRun && searchTotalMatches === 0 && "Совпадений нет."}
              {!searchLoading && !searchError && searchHasRun && searchTotalMatches > 0 && (
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

      {revealOpen && (
        <div
          className="reader-reveal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) closeReveal();
          }}
        >
          <section
            className="reader-reveal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Reveal"
            onKeyDown={event => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                closeReveal();
              }
            }}
          >
            <div className="reader-reveal-head">
              <h2 className="reader-reveal-title">Reveal</h2>
              <button type="button" className="ghost-btn" onClick={closeReveal}>
                Закрыть
              </button>
            </div>

            <blockquote className="reader-reveal-selection">{revealSelection}</blockquote>

            {revealLoading && (
              <p className="reader-reveal-status" aria-live="polite">Ищем недостающий контекст…</p>
            )}
            {!revealLoading && revealError && (
              <p className="reader-reveal-status error" aria-live="polite">{revealError}</p>
            )}
            {!revealLoading && !revealError && revealAnswer && (
              <div className="reader-reveal-answer" aria-live="polite">{revealAnswer}</div>
            )}
          </section>
        </div>
      )}
    </>
  );

}
