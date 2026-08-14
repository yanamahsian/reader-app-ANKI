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
import { pickPreferredFile, toReaderBook } from "../../catalog/toReaderBook";

interface BookDetailViewProps {
  bookId: string;
  onBack: () => void;
  onOpenBook: (book: ReaderBook) => void;
  onOpenAuthorSearch: (authorName: string) => void;
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

// Not found is shown plainly rather than crashing — bookId always
// comes from this app's own navigation (a search result or a
// collection's own book list), but the catalog itself is data, and a
// missing lookup should never be a runtime error.
function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <section className="book-detail">
      <button className="text-link" type="button" onClick={onBack}>← Назад</button>
      <p className="book-detail-not-found">Книга не найдена в каталоге.</p>
    </section>
  );
}

export function BookDetailView({ bookId, onBack, onOpenBook, onOpenAuthorSearch, onOpenCollection }: BookDetailViewProps) {

  const book = getBookById(bookId);

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

  const file = pickPreferredFile(book.files);

  return (
    <section className="book-detail">

      <button className="text-link" type="button" onClick={onBack}>
        ← Назад
      </button>

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
            onClick={() => onOpenAuthorSearch(author.name)}
          >
            {author.name}
          </button>
        )}

      </header>

      <div className="book-detail-read">
        {file ? (
          <button className="primary-button" type="button" onClick={() => onOpenBook(toReaderBook(book, file))}>
            Читать
          </button>
        ) : (
          <p className="book-detail-unavailable">Книга пока недоступна для чтения</p>
        )}
      </div>

      {book.description && (
        <p className="book-detail-description">{book.description}</p>
      )}

      <dl className="book-detail-meta">
        <MetaRow label="Год публикации" value={book.publicationYear ? String(book.publicationYear) : null} />
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

    </section>
  );

}
