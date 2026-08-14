import { useEffect, useRef, useState } from "react";
import type { Book as ReaderBook } from "../reader/engine/types";
import type { Author, Book as CatalogBook } from "../../catalog/types";
import { searchCatalog, type SearchResult } from "../../catalog/search";
import { pickPreferredFile, toReaderBook } from "../../catalog/toReaderBook";

interface SearchPanelProps {
  isOpen: boolean;
  prefillQuery: string | null;
  onClose: () => void;
  onOpenBook: (book: ReaderBook) => void;
}

type Status = "idle" | "empty" | "success";

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
  { value: "la", label: "Latina" },
  { value: "grc", label: "Ἑλληνική" }
];

function coverFallback(title: string): string {
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";
  return initial;
}

function BookCard({ book, onOpen }: { book: CatalogBook; onOpen: (book: ReaderBook) => void }) {

  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover) && !coverFailed;

  const file = pickPreferredFile(book.files);
  const available = file !== null;

  function handleClick(): void {
    if (!file) return;
    onOpen(toReaderBook(book, file));
  }

  return (
    <article
      className={"book-card" + (available ? "" : " book-card-unavailable")}
      onClick={available ? handleClick : undefined}
    >

      <div className="book-cover">
        {showCover ? (
          <img
            loading="lazy"
            src={book.cover ?? undefined}
            alt=""
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <div className="book-cover-fallback">{coverFallback(book.title)}</div>
        )}
      </div>

      <div className="book-content">
        <h3 className="book-title">{book.title}</h3>
        <div className="book-author">{book.authorName}</div>
        <div className="book-meta">
          <span>{book.originalLanguage}</span>
          <span>{book.publicationYear ?? ""}</span>
        </div>
        {!available && (
          <div className="book-unavailable-note">Книга пока недоступна для чтения</div>
        )}
      </div>

    </article>
  );

}

function AuthorMatch({ author }: { author: Author }) {
  return (
    <div className="author-match">
      <span className="eyebrow">Автор</span>
      <h3>{author.name}</h3>
    </div>
  );
}

const EMPTY_RESULT: SearchResult = { query: "", matchedAuthors: [], books: [] };

export function SearchPanel({ isOpen, prefillQuery, onClose, onOpenBook }: SearchPanelProps) {

  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT);
  const inputRef = useRef<HTMLInputElement>(null);

  function runSearch(searchQuery: string, searchLanguage: string): void {

    const trimmed = searchQuery.trim();

    if (!trimmed.length) {
      setStatus("idle");
      setResult(EMPTY_RESULT);
      return;
    }

    const next = searchCatalog(trimmed, searchLanguage);
    const hasAnyResults = next.matchedAuthors.length > 0 || next.books.length > 0;

    setResult(next);
    setStatus(hasAnyResults ? "success" : "empty");

  }

  useEffect(() => {

    if (!isOpen) return;

    if (prefillQuery !== null) {
      setQuery(prefillQuery);
      runSearch(prefillQuery, language);
    }

    inputRef.current?.focus();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, prefillQuery]);

  function handleLanguageChange(nextLanguage: string): void {
    setLanguage(nextLanguage);
    if (query.trim().length) {
      runSearch(query, nextLanguage);
    }
  }

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
            {LANGUAGES.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

        </div>

        <div className="results" aria-live="polite">

          {status === "empty" && <div className="empty-state">Ничего не найдено.</div>}

          {status === "success" && result.matchedAuthors.map(author => (
            <AuthorMatch key={author.id} author={author} />
          ))}

          {status === "success" && result.books.map(({ book }) => (
            <BookCard key={book.id} book={book} onOpen={onOpenBook} />
          ))}

        </div>

      </aside>
    </>
  );

}
