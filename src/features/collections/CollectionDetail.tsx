import { useState } from "react";
import type { Collection, Book as CatalogBook } from "../../catalog/types";
import { getBooksByCollection } from "../../catalog";

interface CollectionDetailProps {
  collection: Collection;
  onBack: () => void;
  onOpenBookDetail: (bookId: string) => void;
}

function coverFallback(title: string): string {
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";
  return initial;
}

// Book Detail decides everything about availability/reading now — a
// card here is always clickable and always goes there first, per
// Phase 7 ("книга сначала должна открываться как объект каталога").
function CollectionBookCard({ book, onOpen }: { book: CatalogBook; onOpen: (bookId: string) => void }) {

  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover) && !coverFailed;

  return (
    <article className="book-card" onClick={() => onOpen(book.id)}>

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
      </div>

    </article>
  );

}

export function CollectionDetail({ collection, onBack, onOpenBookDetail }: CollectionDetailProps) {

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
          <CollectionBookCard key={book.id} book={book} onOpen={onOpenBookDetail} />
        ))}
      </div>

    </section>
  );

}
