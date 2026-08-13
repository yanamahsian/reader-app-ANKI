import { useEffect, useRef, useState } from "react";
import type { Book } from "../reader/engine/types";
import { searchBooks } from "../../api/library";

interface SearchPanelProps {
  isOpen: boolean;
  prefillQuery: string | null;
  onClose: () => void;
  onOpenBook: (book: Book) => void;
}

type Status = "idle" | "loading" | "error" | "empty" | "success";

const LANGUAGES: Array<{ value: string; label: string }> = [
  { value: "", label: "Все языки" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "it", label: "Italiano" },
  { value: "es", label: "Español" },
  { value: "pt", label: "Português" },
  { value: "zh", label: "中文" },
  { value: "la", label: "Latina" }
];

function coverFallback(title: string): string {
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";
  return initial;
}

function BookCard({ book, onOpen }: { book: Book; onOpen: (book: Book) => void }) {

  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover) && !coverFailed;

  return (
    <article className="book-card" onClick={() => onOpen(book)}>

      <div className="book-cover">
        {showCover ? (
          <img
            loading="lazy"
            src={book.cover}
            alt=""
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="book-cover-fallback">{coverFallback(book.title)}</div>
        )}
      </div>

      <div className="book-content">
        <h3 className="book-title">{book.title}</h3>
        <div className="book-author">{book.author || ""}</div>
        <div className="book-meta">
          <span>{book.language || ""}</span>
          <span>{book.year ?? ""}</span>
        </div>
      </div>

    </article>
  );

}

export function SearchPanel({ isOpen, prefillQuery, onClose, onOpenBook }: SearchPanelProps) {

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<Book[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runSearch(searchQuery: string): Promise<void> {

    const trimmed = searchQuery.trim();

    if (!trimmed.length) {
      setStatus("idle");
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus("loading");

    try {
      const books = await searchBooks({ query: trimmed, language, signal: controller.signal });
      setResults(books);
      setStatus(books.length ? "success" : "empty");
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setStatus("error");
      }
    }

  }

  useEffect(() => {

    if (!isOpen) return;

    if (prefillQuery !== null) {
      setQuery(prefillQuery);
      void runSearch(prefillQuery);
    }

    inputRef.current?.focus();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefillQuery]);

  return (
    <>
      <div
        className={"search-backdrop" + (isOpen ? "" : " hidden")}
        onClick={onClose}
      />

      <aside
        className={"search-panel" + (isOpen ? " open" : "")}
        aria-label="Поиск книг"
        aria-hidden={!isOpen}
      >

        <div className="search-panel-head">
          <div>
            <p className="eyebrow">Библиотека</p>
            <h2>Найти книгу</h2>
          </div>
          <button className="close-button" type="button" aria-label="Закрыть поиск" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="search-form">

          <label htmlFor="searchInput">Автор или название</label>
          <input
            id="searchInput"
            ref={inputRef}
            className="search-input"
            type="search"
            placeholder="Например: Данте или Божественная комедия"
            autoComplete="off"
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") void runSearch(query);
            }}
          />

          <label htmlFor="languageSelect">Язык</label>
          <select
            id="languageSelect"
            className="language-select"
            aria-label="Язык книги и перевода"
            value={language}
            onChange={event => setLanguage(event.target.value)}
          >
            {LANGUAGES.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <button
            className="primary-button"
            type="button"
            disabled={status === "loading"}
            onClick={() => void runSearch(query)}
          >
            {status === "loading" ? "Поиск..." : "Найти"}
          </button>

        </div>

        <div className="results" aria-live="polite">
          {status === "error" && <div className="search-error">Ошибка поиска.</div>}
          {status === "empty" && <div className="empty-state">Ничего не найдено.</div>}
          {status === "success" && results.map(book => (
            <BookCard key={book.id} book={book} onOpen={onOpenBook} />
          ))}
        </div>

      </aside>
    </>
  );

}
