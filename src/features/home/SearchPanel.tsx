import { useEffect, useRef, useState } from "react";
import type { Author } from "../../catalog/types";
import { searchCatalog, type SearchResult } from "../../catalog/search";
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

function AuthorMatch({ author, onOpen }: { author: Author; onOpen: (authorId: string) => void }) {
  return (
    <button type="button" className="author-match" onClick={() => onOpen(author.id)}>
      <span className="eyebrow">Автор</span>
      <h3>{author.name}</h3>
    </button>
  );
}

const EMPTY_RESULT: SearchResult = { query: "", matchedAuthors: [], books: [] };

export function SearchPanel({ isOpen, prefillQuery, prefillLanguage, onClose, onOpenBookDetail, onOpenAuthorDetail }: SearchPanelProps) {

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
      setLanguage(prefillLanguage);
      runSearch(prefillQuery, prefillLanguage);
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

  function handleOpenBook(bookId: string): void {
    onOpenBookDetail(bookId, query, language);
  }

  function handleOpenAuthor(authorId: string): void {
    onOpenAuthorDetail(authorId, query, language);
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
