// THE CANON v2 -- visual, catalog-backed Atlas subsection.
//
// No hand-authored nine-book path lives here. A section is one original
// literary language/tradition reported by omnia-canon-catalog; opening it
// follows the server's deterministic chronological route through EVERY
// readable public-domain Work in that tradition. The route is paged only
// for rendering/performance -- later pages continue the same global order.

import { useEffect, useMemo, useState } from "react";
import type { Book } from "../../catalog/types";
import {
  fetchCanonPage,
  fetchCanonSections,
  type CanonSectionSummary
} from "../../api/canon";
import type { LibraryEntry, LibraryStatus } from "../../api/userLibrary";
import { useI18n } from "../../i18n";
import { useReaderJurisdiction } from "../book-detail/readerJurisdiction";
import { CoverFallback } from "../shared/CoverFallback";
import { GuestNotice } from "../shared/GuestNotice";
import "./AtlasCanonSection.css";

interface AtlasCanonSectionProps {
  libraryEntries: LibraryEntry[];
  onOpenBookDetail: (workId: string) => void;
}

type CanonView =
  | { kind: "index" }
  | { kind: "section"; code: string };

type SectionsState =
  | { kind: "loading" }
  | { kind: "loaded"; data: CanonSectionSummary[] }
  | { kind: "error" };

const PAGE_SIZE = 100;

const LITERATURE_LABELS: Record<string, { ru: string; en: string }> = {
  en: { ru: "Англоязычная литература", en: "English-language literature" },
  "en-gb": { ru: "Английская литература", en: "English literature" },
  ru: { ru: "Русская литература", en: "Russian literature" },
  fr: { ru: "Французская литература", en: "French literature" },
  de: { ru: "Немецкая литература", en: "German literature" },
  es: { ru: "Испаноязычная литература", en: "Spanish-language literature" },
  it: { ru: "Итальянская литература", en: "Italian literature" },
  pt: { ru: "Португалоязычная литература", en: "Portuguese-language literature" },
  ja: { ru: "Японская литература", en: "Japanese literature" },
  hu: { ru: "Венгерская литература", en: "Hungarian literature" },
  fi: { ru: "Финская литература", en: "Finnish literature" },
  nl: { ru: "Нидерландская литература", en: "Dutch literature" },
  pl: { ru: "Польская литература", en: "Polish literature" },
  sv: { ru: "Шведская литература", en: "Swedish literature" },
  da: { ru: "Датская литература", en: "Danish literature" },
  no: { ru: "Норвежская литература", en: "Norwegian literature" },
  zh: { ru: "Китайская литература", en: "Chinese literature" },
  la: { ru: "Латинская литература", en: "Latin literature" },
  el: { ru: "Греческая литература", en: "Greek literature" },
  grc: { ru: "Древнегреческая литература", en: "Ancient Greek literature" },
  uk: { ru: "Украинская литература", en: "Ukrainian literature" },
  ro: { ru: "Румынская литература", en: "Romanian literature" },
  cs: { ru: "Чешская литература", en: "Czech literature" },
  oc: { ru: "Окситанская литература", en: "Occitan literature" }
};

function isRu(locale: string): boolean {
  return locale.toLowerCase().startsWith("ru");
}

function literatureLabel(code: string, locale: string): string {
  const known = LITERATURE_LABELS[code];
  if (known) return isRu(locale) ? known.ru : known.en;

  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "language" });
    const language = displayNames.of(code);
    if (language) return isRu(locale) ? `${language} литература` : `${language} literature`;
  } catch {
    // Fall through to the stable code label below.
  }
  return code.toUpperCase();
}

function worksLabel(count: number, locale: string): string {
  if (!isRu(locale)) return `${count.toLocaleString()} works`;
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11
    ? "произведение"
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)
      ? "произведения"
      : "произведений";
  return `${count.toLocaleString("ru-RU")} ${word}`;
}

function routeSubtitle(locale: string): string {
  return isRu(locale)
    ? "Все доступные произведения традиции складываются в один живой маршрут автоматически."
    : "Every available work in the tradition forms one live route automatically.";
}

function CanonBookCover({ book }: { book: Book }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(book.cover) && !failed;

  return (
    <div className="canon-book-cover">
      {showImage ? (
        <img src={book.cover ?? undefined} alt="" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <CoverFallback title={book.title} />
      )}
    </div>
  );
}

export function AtlasCanonSection({ libraryEntries, onOpenBookDetail }: AtlasCanonSectionProps) {
  const { locale } = useI18n();
  const [readerJurisdiction] = useReaderJurisdiction();
  const [view, setView] = useState<CanonView>({ kind: "index" });
  const [sections, setSections] = useState<SectionsState>({ kind: "loading" });
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(false);

  const libraryStatusByWorkId = useMemo(() => {
    const map = new Map<string, LibraryStatus>();
    for (const entry of libraryEntries) map.set(entry.workId, entry.status);
    return map;
  }, [libraryEntries]);

  useEffect(() => {
    const controller = new AbortController();
    setSections({ kind: "loading" });

    fetchCanonSections({
      jurisdiction: readerJurisdiction ?? undefined,
      signal: controller.signal
    })
      .then(data => setSections({ kind: "loaded", data }))
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error("Canon sections failed:", error);
        setSections({ kind: "error" });
      });

    return () => controller.abort();
  }, [readerJurisdiction]);

  useEffect(() => {
    if (view.kind !== "section") return;

    const controller = new AbortController();
    setBooks([]);
    setTotal(0);
    setHasMore(false);
    setRouteError(false);
    setRouteLoading(true);

    fetchCanonPage({
      originalLanguage: view.code,
      jurisdiction: readerJurisdiction ?? undefined,
      limit: PAGE_SIZE,
      offset: 0,
      signal: controller.signal
    })
      .then(page => {
        setBooks(page.books);
        setTotal(page.total);
        setHasMore(page.hasMore);
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        console.error("Canon route failed:", error);
        setRouteError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRouteLoading(false);
      });

    return () => controller.abort();
  }, [view, readerJurisdiction]);

  async function loadMore(): Promise<void> {
    if (view.kind !== "section" || routeLoading || !hasMore) return;
    setRouteLoading(true);
    setRouteError(false);

    try {
      const page = await fetchCanonPage({
        originalLanguage: view.code,
        jurisdiction: readerJurisdiction ?? undefined,
        limit: PAGE_SIZE,
        offset: books.length
      });
      setBooks(current => [...current, ...page.books]);
      setTotal(page.total);
      setHasMore(page.hasMore);
    } catch (error) {
      console.error("Canon route continuation failed:", error);
      setRouteError(true);
    } finally {
      setRouteLoading(false);
    }
  }

  function openSection(code: string): void {
    setView({ kind: "section", code });
  }

  function renderIndex() {
    if (sections.kind === "loading") {
      return <p className="canon-state-copy">{isRu(locale) ? "Собираем мировую библиотеку…" : "Building the world library…"}</p>;
    }
    if (sections.kind === "error") {
      return <GuestNotice message={isRu(locale) ? "Не удалось загрузить разделы Canon." : "Could not load Canon sections."} />;
    }
    if (sections.data.length === 0) {
      return <GuestNotice message={isRu(locale) ? "В Canon пока нет доступных произведений." : "No works are available in The Canon yet."} />;
    }

    const totalWorks = sections.data.reduce((sum, section) => sum + section.count, 0);

    return (
      <>
        <div className="canon-index-summary" aria-label="Canon summary">
          <span>{worksLabel(totalWorks, locale)}</span>
          <span>{sections.data.length} {isRu(locale) ? "литературных традиций" : "literary traditions"}</span>
        </div>

        <div className="canon-tradition-grid">
          {sections.data.map((section, index) => {
            const title = literatureLabel(section.code, locale);
            const monogram = title.trim().charAt(0).toUpperCase();
            return (
              <button
                type="button"
                className="canon-tradition-card"
                key={section.code}
                onClick={() => openSection(section.code)}
              >
                <span className="canon-tradition-number">{String(index + 1).padStart(2, "0")}</span>
                <span className="canon-tradition-books" aria-hidden="true">
                  <span>{monogram}</span>
                  <span>{section.code.toUpperCase()}</span>
                  <span>{monogram}</span>
                </span>
                <span className="canon-tradition-copy">
                  <strong>{title}</strong>
                  <small>{worksLabel(section.count, locale)}</small>
                </span>
                <span className="canon-tradition-arrow" aria-hidden="true">→</span>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  function renderSection(code: string) {
    const title = literatureLabel(code, locale);

    return (
      <>
        <div className="canon-route-topbar">
          <button type="button" className="canon-back" onClick={() => setView({ kind: "index" })}>
            ← {isRu(locale) ? "Все литературы" : "All literatures"}
          </button>
        </div>

        <div className="canon-route-heading">
          <div>
            <p className="eyebrow">The Canon · {code.toUpperCase()}</p>
            <h3>{title}</h3>
            <p>{routeSubtitle(locale)}</p>
          </div>
          {total > 0 && (
            <div className="canon-route-count">
              <strong>{total.toLocaleString(isRu(locale) ? "ru-RU" : "en-US")}</strong>
              <span>{isRu(locale) ? "книг в маршруте" : "works in route"}</span>
            </div>
          )}
        </div>

        {routeLoading && books.length === 0 ? (
          <p className="canon-state-copy">{isRu(locale) ? "Строим маршрут…" : "Building route…"}</p>
        ) : routeError && books.length === 0 ? (
          <GuestNotice message={isRu(locale) ? "Не удалось построить маршрут." : "Could not build this route."} />
        ) : books.length === 0 ? (
          <GuestNotice message={isRu(locale) ? "В этом разделе пока нет доступных книг." : "No books are available in this section yet."} />
        ) : (
          <>
            <div className="canon-route-grid">
              {books.map((book, index) => {
                const status = libraryStatusByWorkId.get(book.id);
                return (
                  <article className="canon-route-book" key={book.id}>
                    <span className="canon-route-index">{String(index + 1).padStart(3, "0")}</span>
                    <button
                      type="button"
                      className="canon-book-button"
                      onClick={() => onOpenBookDetail(book.id)}
                      aria-label={`${book.title}${book.authorName ? ` — ${book.authorName}` : ""}`}
                    >
                      <CanonBookCover book={book} />
                      <span className="canon-book-copy">
                        <strong>{book.title}</strong>
                        {book.authorName && <small>{book.authorName}</small>}
                        <span className="canon-book-meta">
                          {book.publicationYear ? String(book.publicationYear) : (isRu(locale) ? "год не указан" : "year unknown")}
                          {status === "reading" ? ` · ${isRu(locale) ? "читаю" : "reading"}` : ""}
                          {status === "finished" ? ` · ${isRu(locale) ? "прочитано" : "finished"}` : ""}
                        </span>
                      </span>
                    </button>
                  </article>
                );
              })}
            </div>

            <div className="canon-route-footer">
              <span>
                {isRu(locale) ? "Показано" : "Showing"} {books.length.toLocaleString()} / {total.toLocaleString()}
              </span>
              {hasMore && (
                <button type="button" className="primary-button" onClick={loadMore} disabled={routeLoading}>
                  {routeLoading
                    ? (isRu(locale) ? "Загружаем…" : "Loading…")
                    : (isRu(locale) ? "Продолжить маршрут" : "Continue route")}
                </button>
              )}
              {routeError && books.length > 0 && (
                <button type="button" className="text-link" onClick={loadMore}>
                  {isRu(locale) ? "Повторить" : "Retry"}
                </button>
              )}
            </div>
          </>
        )}
      </>
    );
  }

  return (
    <section className="canon-shell" aria-label="The Canon">
      <header className="canon-hero">
        <p className="eyebrow">Atlas · The Canon</p>
        <h2>The Canon</h2>
        <p>
          {isRu(locale)
            ? "Мировая классика как живая библиотека: выбирайте литературную традицию и идите по автоматически выстроенному маршруту через весь доступный корпус."
            : "World literature as a living library: choose a tradition and follow an automatically built route through its entire available corpus."}
        </p>
      </header>

      {view.kind === "index" ? renderIndex() : renderSection(view.code)}
    </section>
  );
}
