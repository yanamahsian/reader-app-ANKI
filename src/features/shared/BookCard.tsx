import { useState } from "react";
import type { Book as CatalogBook } from "../../catalog/types";

function coverFallback(title: string): string {
  const initial = (title || "?").trim().charAt(0).toUpperCase() || "?";
  return initial;
}

export function BookCard({ book, onOpen }: { book: CatalogBook; onOpen: (bookId: string) => void }) {

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
