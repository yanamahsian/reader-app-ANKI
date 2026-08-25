import { useEffect, useRef, useState } from "react";
import type { Author } from "../../catalog/types";
import { searchCatalog, type SearchResult } from "../../catalog/search";
import { mergeLibraryPage } from "../../catalog";
import { LANGUAGE_OPTIONS } from "../../catalog/languages";
import { fetchLibraryCatalogPage } from "../../api/libraryCatalog";
import { BookCard } from "../shared/BookCard";

interface SearchPanelProps {
  isOpen: boolean;
  prefillQuery: string | null;
  prefillLanguage: string;
  onClose: () => void;
  onOpenBookDetail: (bookId: string, query: string, language: string) => void;
  onOpenAuthorDetail: (authorId: string, query: string, language: string) => void;
}

type Status = "idle" | "empty" | "success";

function AuthorMatch({ author, onOpen }: { author: Author; onOpen: (authorId: string) => void }) {
  return (
    <button type="button" className="author-match section-link" onClick={() => onOpen(author.id)}>
      <span className="eyebrow">Автор</span>
      <h3>{author.name}</h3>
    </button>
  );
}

const EMPTY_RESULT: SearchResult = { query: "", matchedAuthors: [], books: [] };

// How many of AN.KI's real internal-catalog matches this panel asks the
// server for per query, on top of whatever local catalog matches show
// instantly (see showLocalResult). This panel is a quick "did you mean"
// overlay, not a paginated browse -- Library (LibraryView.tsx) is where
// a visitor pages through the full server-side result set.
const SEARCH_SERVER_LIMIT = 30;
const SEARCH_DEBOUNCE_MS = 350;

export function SearchPanel({ isOpen, prefillQuery, prefillLanguage, onClose, onOpenBookDetail, onOpenAuthorDetail }: SearchPanelProps) {

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT);
  const inputRef = useRef<HTMLInputElement>(null);

  const requestIdRef = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // catalog/search.ts itself is completely unchanged: it has always
  // just ranked whatever is currently in catalogStore. What changed
  // here is what ends up IN that store before this runs -- see
  // refineFromServer below, which merges real omnia-library-catalog
  // matches in before calling this again, so the exact same ranking
  // logic below naturally covers them too.
  function showLocalResult(trimmed: string, searchLanguage: string): void {
    const next = searchCatalog(trimmed, searchLanguage);
    const hasAnyResults = next.matchedAuthors.length > 0 || next.books.length > 0;
    setResult(next);
    setStatus(hasAnyResults ? "success" : "empty");
  }

  // Reaches AN.KI's real internal catalog (the same omnia-library-catalog
  // Edge Function LibraryView.tsx uses) and merges any matches into the
  // shared catalog store, then re-runs the existing local ranking over
  // the now-larger store.
  //
  // `requestId` is captured by the CALLER (runSearch, at the moment the
  // request is scheduled) and passed in here, rather than bumped inside
  // this function. Bumping it in here would only invalidate a previous
  // request once THIS request actually starts running -- i.e. only after
  // the 350ms debounce timer fires. Between a keystroke and that timer
  // firing, an earlier, still-in-flight request was not yet invalidated
  // at all, so it could resolve after a newer keystroke's context was
  // already established and silently overwrite it with stale results.
  // Invalidation now happens synchronously in runSearch instead, the
  // instant the query/language actually changes -- this function only
  // checks whether it's still current, never decides that on its own.
  async function refineFromServer(trimmed: string, searchLanguage: string, requestId: number): Promise<void> {

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {

      const page = await fetchLibraryCatalogPage({
        query: trimmed,
        language: searchLanguage,
        limit: SEARCH_SERVER_LIMIT,
        signal: controller.signal
      });

      if (requestId !== requestIdRef.current) return;

      mergeLibraryPage(page.books, page.authors);
      showLocalResult(trimmed, searchLanguage);

    } catch (error) {

      if (requestId !== requestIdRef.current) return;
      if ((error as { name?: string }).name === "AbortError") return;

      // The local result already showing (from showLocalResult, called
      // synchronously in runSearch before this ever fires) stands as the
      // honest, narrower outcome -- exactly the same fallback shape
      // LibraryView.tsx uses, just without its own separate "showing the
      // local catalog" notice, since here that IS simply what the panel
      // already looked like an instant earlier.
      console.error(
        "omnia-library-catalog request failed in Search -- showing local catalog matches only. Real cause:",
        error
      );

    }

  }

  function runSearch(searchQuery: string, searchLanguage: string): void {

    const trimmed = searchQuery.trim();

    // Invalidate immediately, synchronously, at the moment the query or
    // language actually changes -- not only once a debounce timer later
    // fires. This is the fix for the race condition described above: any
    // request already in flight (or merely scheduled, still waiting out
    // its own debounce) for a now-superseded query can no longer win,
    // because its captured requestId stops matching requestIdRef.current
    // right here, before it gets a chance to resolve.
    requestIdRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    if (!trimmed.length) {
      setStatus("idle");
      setResult(EMPTY_RESULT);
      return;
    }

    // Unchanged from before: an instant, purely local result the moment
    // the visitor stops typing for zero seconds -- this is what made the
    // panel feel instant, and still does. The server call layers on top
    // of this, debounced, rather than replacing it.
    showLocalResult(trimmed, searchLanguage);

    // omnia-library-catalog treats a query shorter than 2 characters as
    // "no filter" (same as Library's own deliberate browse-all empty
    // query) -- fine for a full-page browse, but here it would replace a
    // single-letter search with 30 essentially arbitrary catalog entries.
    // Skipping the server call for a query this short keeps this panel's
    // existing "narrow, exact-ish matches only" feel intact.
    if (trimmed.length < 2) return;

    const requestId = requestIdRef.current;
    debounceRef.current = setTimeout(() => {
      refineFromServer(trimmed, searchLanguage, requestId);
    }, SEARCH_DEBOUNCE_MS);

  }

  // Wraps onClose so that closing the panel also invalidates/aborts any
  // in-flight or still-debouncing server search immediately -- otherwise
  // a slow request from before the panel was closed could still resolve
  // after it reopens with a different prefillQuery and briefly stomp that
  // fresh state with the old, now-irrelevant one.
  function handleClose(): void {
    requestIdRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    onClose();
  }

  useEffect(() => {
    if (!isOpen) return;
    if (prefillQuery !== null) {
      setQuery(prefillQuery);
      setLanguage(prefillLanguage);
      runSearch(prefillQuery, prefillLanguage);
    }
    inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefillQuery]);

  function handleLanguageChange(nextLanguage: string): void {
    setLanguage(nextLanguage);
    if (query.trim().length) runSearch(query, nextLanguage);
  }

  function handleOpenBook(bookId: string): void {
    onOpenBookDetail(bookId, query, language);
  }

  function handleOpenAuthor(authorId: string): void {
    onOpenAuthorDetail(authorId, query, language);
  }

  return (
    <>
      <div className={"search-backdrop" + (isOpen ? "" : " hidden")} onClick={handleClose} />

      <aside className={"search-panel" + (isOpen ? " open" : "")} aria-label="Поиск книг" aria-hidden={!isOpen}>
        <div className="search-panel-head">
          <div>
            <p className="eyebrow">Библиотека</p>
            <h2>Найти книгу</h2>
          </div>
          <button className="close-button" type="button" aria-label="Закрыть поиск" onClick={handleClose}>×</button>
        </div>

        <div className="search-form">
          <label htmlFor="searchInput">Автор или название</label>
          <input
            id="searchInput"
            ref={inputRef}
            className="search-input"
            type="search"
            placeholder="Например: Толстой или Война и мир"
            autoComplete="off"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              runSearch(event.target.value, language);
            }}
          />

          <label htmlFor="languageSelect">Язык</label>
          <select
            id="languageSelect"
            className="language-select"
            aria-label="Язык произведения"
            value={language}
            onChange={event => handleLanguageChange(event.target.value)}
          >
            {LANGUAGE_OPTIONS.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </div>

        <div className="results" aria-live="polite">
          {status === "empty" && <div className="empty-state">Ничего не найдено.</div>}

          {status === "success" && result.matchedAuthors.map(author => (
            <AuthorMatch key={author.id} author={author} onOpen={handleOpenAuthor} />
          ))}

          {status === "success" && result.books.map(({ book }) => (
            <BookCard key={book.id} book={book} onOpen={handleOpenBook} />
          ))}
        </div>
      </aside>
    </>
  );

}
