import { useState } from "react";
import {
  getBookById,
  getAuthorById,
  getCollectionById,
  countries,
  centuries,
  epochs,
  movements,
  genres,
  themes
} from "../../catalog";
import type { Book as ReaderBook } from "../reader/engine/types";
import { pickPreferredEditionAndFile, toReaderBook, hasAnyPhysicalEdition } from "../../catalog/toReaderBook";
import { useReaderJurisdiction } from "./readerJurisdiction";
import { CoverFallback } from "../shared/CoverFallback";

interface BookDetailViewProps {
  bookId: string;
  onBack: () => void;
  onOpenBook: (book: ReaderBook) => void;
  onOpenAuthorDetail: (authorId: string) => void;
  onOpenCollection: (collectionId: string) => void;
}

function labelFor(id: string | null, dictionary: Array<{ id: string; label: string }>): string | null {
  if (!id) return null;
  return dictionary.find(term => term.id === id)?.label ?? null;
}

function labelsFor(ids: string[], dictionary: Array<{ id: string; label: string }>): string[] {
  return ids
    .map(id => dictionary.find(term => term.id === id)?.label)
    .filter((label): label is string => Boolean(label));
}

interface MetaRowProps {
  label: string;
  value: string | null;
}

function MetaRow({ label, value }: MetaRowProps) {
  if (!value) return null;
  return (
    <div className="book-detail-meta-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <section className="book-detail">
      <button className="text-link" type="button" onClick={onBack}>← Назад</button>
      <p className="book-detail-not-found">Книга не найдена в каталоге.</p>
    </section>
  );
}

// Only country codes this catalog can currently say anything
// meaningful about are listed below the select itself, not baked into
// this list -- adding a code here does NOT mean that jurisdiction has
// verified rights data (right now, only "US" does, via Project
// Gutenberg's own "public domain in the USA" assertions). This is a
// small, honest picker, not a claim of broad international coverage.
const JURISDICTION_OPTIONS: Array<{ code: string; label: string }> = [
  { code: "US", label: "США" },
  { code: "DE", label: "Германия" },
  { code: "FR", label: "Франция" },
  { code: "GB", label: "Великобритания" },
  { code: "RU", label: "Россия" }
];

interface JurisdictionPromptProps {
  readerJurisdiction: string | null;
  onChange: (jurisdiction: string) => void;
}

// Shown instead of a flat "unavailable" message when a Work genuinely
// has a physical file, but resolving it depends on a jurisdiction this
// app doesn't know yet (or knows, and it doesn't clear the book's
// rights). This is deliberately not an onboarding flow or a full
// account/location system -- one inline choice, persisted locally,
// nothing more.
function JurisdictionPrompt({ readerJurisdiction, onChange }: JurisdictionPromptProps) {
  return (
    <div className="book-detail-jurisdiction-prompt">
      <p className="book-detail-unavailable">
        {readerJurisdiction
          ? "У этой книги есть текст, но, по имеющимся у нас данным о правах, он не подтверждён как доступный для выбранной юрисдикции."
          : "У этой книги есть текст, но его законная доступность зависит от вашей страны, а она ещё не указана."}
      </p>
      <label className="book-detail-jurisdiction-label">
        Ваша юрисдикция (для проверки доступности):{" "}
        <select
          value={readerJurisdiction ?? ""}
          onChange={event => { if (event.target.value) onChange(event.target.value); }}
        >
          <option value="" disabled>Выбрать…</option>
          {JURISDICTION_OPTIONS.map(option => (
            <option key={option.code} value={option.code}>{option.label}</option>
          ))}
        </select>
      </label>
      <p className="book-detail-jurisdiction-note">
        Доступность проверяется отдельно для каждой страны по данным о правах конкретного издания. Для части книг в каталоге уже подтверждена доступность в США и Германии; для других стран или отдельных изданий данных может пока не быть.
      </p>
    </div>
  );
}

export function BookDetailView({ bookId, onBack, onOpenBook, onOpenAuthorDetail, onOpenCollection }: BookDetailViewProps) {

  const book = getBookById(bookId);

  // Called unconditionally, before the early return below, per the
  // Rules of Hooks -- bookId can change from valid to not-found (or
  // back) across re-renders of the same component instance, and a
  // hook can never become conditional based on that.
  const [readerJurisdiction, setReaderJurisdiction] = useReaderJurisdiction();
  const [coverFailed, setCoverFailed] = useState(false);

  if (!book) {
    return <NotFound onBack={onBack} />;
  }

  const author = getAuthorById(book.authorId);
  const relatedCollections = book.collectionIds
    .map(id => getCollectionById(id))
    .filter((collection): collection is NonNullable<typeof collection> => Boolean(collection));

  const countryLabel = labelFor(book.countryId, countries);
  const centuryLabel = labelFor(book.centuryId, centuries);
  const epochLabel = labelFor(book.epochId, epochs);
  const movementLabel = labelFor(book.movementId, movements);
  const genreLabels = labelsFor(book.genreIds, genres);
  const themeLabels = labelsFor(book.themeIds, themes);

  const resolved = pickPreferredEditionAndFile(book, undefined, readerJurisdiction ?? undefined);

  const showCover = Boolean(book.cover) && !coverFailed;
  const languagesLabel = book.availableLanguages.length
    ? book.availableLanguages.join(" · ")
    : book.originalLanguage || null;

  return (
    <section className="book-detail book-detail-page">

      <button className="text-link" type="button" onClick={onBack}>
        ← Назад
      </button>

      <div className="book-detail-hero">

        <div className="book-detail-cover">
          {showCover ? (
            <img
              loading="lazy"
              src={book.cover ?? undefined}
              alt=""
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <CoverFallback title={book.title} />
          )}
        </div>

        <div className="book-detail-info">

          <header className="book-detail-header">

            <p className="eyebrow">Произведение</p>

            <h1 className="book-detail-title">{book.title}</h1>

            {book.originalTitle && (
              <p className="book-detail-original-title">{book.originalTitle}</p>
            )}

            {author && (
              <button
                className="book-detail-author-link"
                type="button"
                onClick={() => onOpenAuthorDetail(author.id)}
              >
                {author.name}
              </button>
            )}

          </header>

          <dl className="book-detail-quick-meta">
            <MetaRow label="Год публикации" value={book.publicationYear ? String(book.publicationYear) : null} />
            <MetaRow label="Язык" value={languagesLabel} />
          </dl>

          <div className="book-detail-read">
            {resolved ? (
              <button className="primary-button" type="button" onClick={() => onOpenBook(toReaderBook(book, resolved))}>
                Читать
              </button>
            ) : hasAnyPhysicalEdition(book) ? (
              <JurisdictionPrompt readerJurisdiction={readerJurisdiction} onChange={setReaderJurisdiction} />
            ) : (
              <p className="book-detail-unavailable">Книга пока недоступна для чтения</p>
            )}
          </div>

        </div>

      </div>

      <div className="book-detail-body">

        {book.description && (
          <p className="book-detail-description">{book.description}</p>
        )}

        <dl className="book-detail-meta">
          <MetaRow label="Оригинальный язык" value={book.originalLanguage || null} />
          <MetaRow label="Страна" value={countryLabel} />
          <MetaRow label="Век" value={centuryLabel} />
          <MetaRow label="Эпоха" value={epochLabel} />
          <MetaRow label="Направление" value={movementLabel} />
          <MetaRow label="Жанры" value={genreLabels.length ? genreLabels.join(" · ") : null} />
          <MetaRow label="Темы" value={themeLabels.length ? themeLabels.join(" · ") : null} />
        </dl>

        {relatedCollections.length > 0 && (
          <div className="book-detail-collections">
            <p className="eyebrow">Подборки</p>
            <div className="book-detail-collections-list">
              {relatedCollections.map(collection => (
                <button
                  key={collection.id}
                  className="text-link"
                  type="button"
                  onClick={() => onOpenCollection(collection.id)}
                >
                  {collection.title}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

    </section>
  );

}
