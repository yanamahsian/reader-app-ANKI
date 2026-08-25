import { useState } from "react";
import type { Collection } from "../../catalog/types";
import { getBooksByCollection } from "../../catalog";
import { BookGrid } from "../shared/BookGrid";
import { LibraryBookCard } from "../shared/LibraryBookCard";

interface CollectionDetailProps {
  collection: Collection;
  onBack: () => void;
  onOpenBookDetail: (bookId: string) => void;
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
          // No dedicated collection image — rather than a flat gradient
          // block, this now stays transparent and lets the app-wide
          // GlobalBackground photo show through (global.css), darkened
          // by the same shade treatment used everywhere else, so it
          // never reads as an empty box.
          <div className="collection-detail-fallback" aria-hidden="true" />
        )}

        <div className="collection-detail-heading">
          <p className="eyebrow">Подборка</p>
          <h1>{collection.title}</h1>
          <p>{collection.description}</p>
        </div>

      </div>

      <div className="collection-detail-books">
        {books.length > 0 ? (
          <BookGrid>
            {books.map(book => (
              <LibraryBookCard key={book.id} book={book} onOpen={onOpenBookDetail} />
            ))}
          </BookGrid>
        ) : (
          <p className="book-detail-not-found">В этой подборке пока нет доступных книг.</p>
        )}
      </div>

    </section>
  );

}
