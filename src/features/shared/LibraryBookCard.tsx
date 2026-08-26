import { useState } from "react";
import type { Book as CatalogBook } from "../../catalog/types";
import { CoverFallback } from "./CoverFallback";

interface LibraryBookCardProps {
  book: CatalogBook;
  onOpen: (bookId: string) => void;
  // USER LIBRARY PHASE: optional quiet status text (e.g. "Читаю",
  // "Прочитано", "Хочу прочитать") shown under the author line — used
  // by MyLibraryView only. Every other existing caller (Library,
  // Author Detail, Collection Detail) omits this prop and renders
  // exactly as before, unchanged.
  badge?: string;
}

// The grid card used by Library, Author Detail's works list, and
// Collection Detail — a large 2:3 cover (real or CoverFallback) with
// title/author underneath, nothing else. Deliberately separate from
// BookCard.tsx (kept as-is for SearchPanel's compact horizontal
// row-with-small-thumbnail layout) rather than a variant of it: the
// two are different enough in shape (tall grid tile vs. wide list row)
// that sharing one component would mean branching most of its markup
// on a layout flag, which is worse than two small, honest components.
export function LibraryBookCard({ book, onOpen, badge }: LibraryBookCardProps) {

  const [coverFailed, setCoverFailed] = useState(false);
  const showCover = Boolean(book.cover) && !coverFailed;

  return (
    <article className="library-book-card" onClick={() => onOpen(book.id)}>

      <div className="library-book-cover">
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

      <h3 className="library-book-title">{book.title}</h3>
      <div className="library-book-author">{book.authorName}</div>
      {badge ? <div className="library-book-badge">{badge}</div> : null}

    </article>
  );

}
