import { useState } from "react";
import { getAuthorById, getBooksByAuthor } from "../../catalog";
import type { Author } from "../../catalog/types";
import { BookGrid } from "../shared/BookGrid";
import { LibraryBookCard } from "../shared/LibraryBookCard";

interface AuthorDetailViewProps {
  authorId: string;
  onBack: () => void;
  onOpenBookDetail: (bookId: string) => void;
}

function yearsLabel(author: Author): string | null {
  if (!author.birthYear && !author.deathYear) return null;
  return `${author.birthYear ?? ""}–${author.deathYear ?? ""}`;
}

function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <section className="book-detail">
      <button className="text-link" type="button" onClick={onBack}>← Назад</button>
      <p className="book-detail-not-found">Автор не найден в каталоге.</p>
    </section>
  );
}

// Same image-or-monogram pattern as HomeView's AuthorListItem, just at
// portrait scale rather than list-row scale — kept as its own small
// component here rather than shared, since the two differ enough in
// markup (this one is the whole page's header art, that one is an
// inline row icon) that factoring out a shared component would mean
// passing a size flag through, which is not worth it for two call sites.
function AuthorPortrait({ author }: { author: Author }) {

  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(author.portraitImage) && !imageFailed;
  const monogram = author.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="author-detail-portrait">
      {showImage ? (
        <img
          loading="lazy"
          src={`${import.meta.env.BASE_URL}${author.portraitImage}`}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="author-detail-portrait-fallback" aria-hidden="true">{monogram}</span>
      )}
    </div>
  );

}

export function AuthorDetailView({ authorId, onBack, onOpenBookDetail }: AuthorDetailViewProps) {

  const author = getAuthorById(authorId);

  if (!author) {
    return <NotFound onBack={onBack} />;
  }

  const books = getBooksByAuthor(authorId);
  const years = yearsLabel(author);

  return (
    <section className="book-detail author-detail-page">

      <button className="text-link" type="button" onClick={onBack}>
        ← Назад
      </button>

      <header className="author-detail-header">

        <AuthorPortrait author={author} />

        <div className="author-detail-identity">
          <p className="eyebrow">Автор</p>
          <h1 className="book-detail-title">{author.name}</h1>
          {years && <p className="book-detail-original-title">{years}</p>}
        </div>

      </header>

      <section className="author-detail-works">

        <div className="section-heading">
          <div>
            <p className="eyebrow">Каталог</p>
            <h2>Произведения</h2>
          </div>
        </div>

        {books.length > 0 ? (
          <BookGrid>
            {books.map(book => (
              <LibraryBookCard key={book.id} book={book} onOpen={onOpenBookDetail} />
            ))}
          </BookGrid>
        ) : (
          <p className="book-detail-not-found">В каталоге пока нет доступных книг этого автора.</p>
        )}

      </section>

    </section>
  );

}
