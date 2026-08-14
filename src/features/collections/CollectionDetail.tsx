import { useState } from "react";
import type { Collection, Book as CatalogBook } from "../../catalog/types";
import type { Book as ReaderBook } from "../reader/engine/types";
import { getBooksByCollection } from "../../catalog";
import { pickPreferredFile, toReaderBook } from "../../catalog/toReaderBook";

interface CollectionDetailProps {
  collection: Collection;
  onBack: () => void;
  onOpenBook: (book: ReaderBook) => void;
}

function coverFallback(title: string): string {
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";
  return initial;
}

// Same availability rule as SearchPanel's BookCard (Phase 5): a book
// with no file is shown, never clickable, never attempts to open.
// Kept as its own small component here (not imported from
// SearchPanel.tsx) so that file — explicitly out of scope this
// phase — does not need to change or export anything new.
function CollectionBookCard({ book, onOpen }: { book: CatalogBook; onOpen: (book: ReaderBook) => void }) {

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

export function CollectionDetail({ collection, onBack, onOpenBook }: CollectionDetailProps) {

  // Books are always derived from the catalog by collectionIds —
  // never duplicated or hand-listed here.
  const books = getBooksByCollection(collection.id);

  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(collection.image) && !imageFailed;

  return (
    <section className="collection-detail">

      <button className="text-link" type="button" onClick={onBack}>
        ← Все подборки
      </button>

      <div className="collection-detail-hero">

        {showImage ? (
          <img
            src={`${import.meta.env.BASE_URL}${collection.image}`}
            alt=""
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="collection-detail-fallback" aria-hidden="true" />
        )}

        <div className="collection-detail-heading">
          <p className="eyebrow">Подборка</p>
          <h1>{collection.title}</h1>
          <p>{collection.description}</p>
        </div>

      </div>

      <div className="collection-detail-books">
        {books.map(book => (
          <CollectionBookCard key={book.id} book={book} onOpen={onOpenBook} />
        ))}
      </div>

    </section>
  );

}
