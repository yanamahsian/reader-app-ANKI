import { useEffect, useRef, useState } from "react";
import { getBookById, getBooks, mergeLibraryPage } from "../../catalog";
import type { Book as CatalogBook } from "../../catalog/types";
import { searchCatalog } from "../../catalog/search";
import { LANGUAGE_OPTIONS } from "../../catalog/languages";
import { fetchLibraryCatalogPage } from "../../api/libraryCatalog";
import { BookCard } from "../shared/BookCard";

export interface LibraryRestoreState {
  query: string;
  language: string;
  // Number of PAGE_SIZE-sized pages fetched from the server so far (not
  // a client-side slice index) -- restoring this re-issues one real
  // request sized to cover the same amount of content the visitor had
  // already loaded, so "← Назад" lands on the same scroll depth.
  page: number;
}

interface LibraryViewProps {
  onBack: () => void;
  // Non-null only when arriving here via "← Назад" from Book Detail —
  // restores the exact query/language/page depth the visitor left,
  // same pattern as HomeView's restoreSearch. A fresh open from Home
  // always passes null, matching how Collections' own "Смотреть всё"
  // already behaves.
  restoreState: LibraryRestoreState | null;
  onOpenBookDetail: (bookId: string, state: LibraryRestoreState) => void;
}

const PAGE_SIZE = 24;

type Status = "loading" | "success" | "empty";

export function LibraryView({ onBack, restoreState, onOpenBookDetail }: LibraryViewProps) {

  const [query, setQuery] = useState(restoreState?.query ?? "");
  const [language, setLanguage] = useState(restoreState?.language ?? "");
  const [pagesLoaded, setPagesLoaded] = useState(restoreState?.page ?? 1);

  const [books, setBooks] = useState<CatalogBook[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [loadingMore, setLoadingMore] = useState(false);
  // "server" once a real omnia-library-catalog response has produced
  // this view's current list; "local" only when that request itself
  // failed (network/server error) and this view fell back to whatever
  // is already in this app's own catalog store — never used as the
  // normal "browse everything" path any more (that IS the server path
  // now: an empty query returns every eligible work, paginated, see
  // omnia-library-catalog's own comment).
  const [dataSource, setDataSource] = useState<"server" | "local">("server");

  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const isFirstRunRef = useRef(true);

  function runLocalFallback(trimmedQuery: string, activeLanguage: string): void {
    if (!trimmedQuery) {
      const all = getBooks().filter(book =>
        !activeLanguage || book.originalLanguage === activeLanguage || book.availableLanguages.includes(activeLanguage)
      );
      setBooks(all);
      setHasMore(false);
      setDataSource("local");
      setStatus(all.length ? "success" : "empty");
      return;
    }
    const { books: ranked } = searchCatalog(trimmedQuery, activeLanguage);
    const localBooks = ranked.map(r => r.book);
    setBooks(localBooks);
    setHasMore(false);
    setDataSource("local");
    setStatus(localBooks.length ? "success" : "empty");
  }

  // Bumps the generation token and aborts whatever request is currently
  // in flight or was merely scheduled -- called SYNCHRONOUSLY at the
  // moment query/language actually changes (see the query-change effect
  // and handleLanguageChange below), not only once a debounce timer
  // later fires. This closes a race the previous version had: requestId
  // used to be bumped only inside loadFromStart itself, which for the
  // debounced query-change path only ran once the 350ms timer actually
  // fired -- leaving a window, between a keystroke and that timer firing,
  // where an EARLIER still-in-flight request (from an even older
  // keystroke) was not yet invalidated at all. If that older request's
  // network response happened to arrive during that window, it would
  // still pass the `requestId === requestIdRef.current` check and
  // silently overwrite state with stale results, even though a newer
  // (still-debouncing) query had already superseded it. Bumping here,
  // synchronously, the instant the query/language changes, means that
  // window no longer exists -- the stale request's captured id stops
  // matching before it has any chance to resolve.
  function invalidatePending(): number {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    return requestId;
  }

  // Loads `pages` * PAGE_SIZE worth of results from offset 0 -- used on
  // mount (pages = restored page depth, or 1 for a fresh open) and
  // whenever query/language changes (pages reset to 1). This is still a
  // single real request, just sized to cover however much the visitor
  // had already scrolled through before navigating away, so a restored
  // Library looks exactly like it did before, without replaying every
  // individual "Показать ещё" click as a separate request.
  //
  // `requestId` is supplied by the caller (always via invalidatePending,
  // called synchronously at the moment the request was decided on) rather
  // than generated in here -- see invalidatePending's own comment above
  // for why that distinction is the actual race-condition fix.
  async function loadFromStart(rawQuery: string, activeLanguage: string, pages: number, requestId: number): Promise<void> {

    const trimmedQuery = rawQuery.trim();

    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");

    try {

      const page = await fetchLibraryCatalogPage({
        query: trimmedQuery,
        language: activeLanguage,
        limit: pages * PAGE_SIZE,
        offset: 0,
        signal: controller.signal
      });

      if (requestId !== requestIdRef.current) return;

      mergeLibraryPage(page.books, page.authors);
      // Re-read through the store rather than trusting the response
      // objects directly -- guarantees what's rendered here is exactly
      // what getBookById (and so Book Detail / Author Detail) will find
      // for the same id, with no possibility of drift between the two.
      const merged = page.books.map(book => getBookById(book.id) ?? book);

      setBooks(merged);
      setHasMore(page.hasMore);
      setPagesLoaded(pages);
      setDataSource("server");
      setStatus(merged.length ? "success" : "empty");

    } catch (error) {

      if (requestId !== requestIdRef.current) return;
      if ((error as { name?: string }).name === "AbortError") return;

      console.error(
        "omnia-library-catalog request failed -- falling back to the local catalog. Real cause:",
        error
      );

      runLocalFallback(trimmedQuery, activeLanguage);

    }

  }

  async function loadMore(): Promise<void> {

    // A genuine separate request -- not part of the query-change
    // debounce path above, so there is no "still waiting to fire" window
    // to worry about here: invalidatePending's bump+abort and the actual
    // request both happen synchronously, back to back, exactly as before.
    const requestId = invalidatePending();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingMore(true);

    try {

      const page = await fetchLibraryCatalogPage({
        query: query.trim(),
        language,
        limit: PAGE_SIZE,
        offset: books.length,
        signal: controller.signal
      });

      if (requestId !== requestIdRef.current) return;

      mergeLibraryPage(page.books, page.authors);
      const merged = page.books.map(book => getBookById(book.id) ?? book);

      setBooks(prev => [...prev, ...merged]);
      setHasMore(page.hasMore);
      setPagesLoaded(pages => pages + 1);

    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      if ((error as { name?: string }).name === "AbortError") return;
      // A failed "Показать ещё" leaves the already-loaded results in
      // place rather than wiping the list -- the local fallback here
      // would silently restart pagination from a different, unrelated
      // data source mid-scroll, which is worse than just letting the
      // visitor retry.
      console.error("omnia-library-catalog request failed on \"Показать ещё\":", error);
    } finally {
      if (requestId === requestIdRef.current) setLoadingMore(false);
    }

  }

  // Fires once on mount (restoring the prior page depth if any), then
  // again -- debounced -- whenever the visitor types. Does not depend on
  // `language`: handleLanguageChange below calls loadFromStart directly,
  // the same way SearchPanel's own handleLanguageChange does.
  //
  // invalidatePending() is called every time this effect runs -- i.e. on
  // every `query` change, immediately, well before the 350ms debounce
  // timer below ever fires. That's what makes the invalidation
  // synchronous-with-the-change rather than synchronous-with-the-debounce;
  // see invalidatePending's own comment for the exact race this closes.
  useEffect(() => {
    if (isFirstRunRef.current) {
      isFirstRunRef.current = false;
      const requestId = invalidatePending();
      loadFromStart(query, language, pagesLoaded, requestId);
      return;
    }
    const requestId = invalidatePending();
    const handle = setTimeout(() => {
      setPagesLoaded(1);
      loadFromStart(query, language, 1, requestId);
    }, 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  function handleLanguageChange(nextLanguage: string): void {
    setLanguage(nextLanguage);
    setPagesLoaded(1);
    const requestId = invalidatePending();
    loadFromStart(query, nextLanguage, 1, requestId);
  }

  function snapshot(): LibraryRestoreState {
    return { query, language, page: pagesLoaded };
  }

  return (
    <section className="library-view collections-view">

      <header className="collections-header">
        <button className="text-link" type="button" onClick={onBack}>
          ← Назад
        </button>
        <p className="eyebrow" style={{ marginTop: 24 }}>AN.KI Atlas</p>
        <h1>Библиотека</h1>
        <p className="collections-subtitle">
          Полный каталог AN.KI — ищите по названию или автору, либо просто листайте.
        </p>
      </header>

      <div className="search-form library-search-form">
        <label htmlFor="libraryQuery">Автор или название</label>
        <input
          id="libraryQuery"
          className="search-input"
          type="search"
          placeholder="Например: Толстой или Война и мир"
          autoComplete="off"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <label htmlFor="libraryLanguage">Язык</label>
        <select
          id="libraryLanguage"
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

      {dataSource === "local" && status !== "loading" && (
        <p className="library-note">
          Не удалось связаться с расширенным каталогом — показан каталог AN.KI напрямую.
        </p>
      )}

      <div className="results library-results" aria-live="polite">

        {status === "loading" && books.length === 0 && <div className="empty-state">Загрузка…</div>}
        {status === "empty" && <div className="empty-state">Ничего не найдено.</div>}

        {books.map(book => (
          <BookCard key={book.id} book={book} onOpen={bookId => onOpenBookDetail(bookId, snapshot())} />
        ))}

      </div>

      {dataSource === "server" && hasMore && (
        <div className="library-pager">
          <button
            className="text-link"
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Загрузка…" : "Показать ещё"}
          </button>
        </div>
      )}

    </section>
  );

}
