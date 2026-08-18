import { getAuthorById, getBooksByAuthor } from "../../catalog";
import type { Author } from "../../catalog/types";
import { BookCard } from "../shared/BookCard";

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
    <section className="author-detail">
      <button className="text-link" type="button" onClick={onBack}>← Назад</button>
      <p className="book-detail-not-found">Автор не найден в каталоге.</p>
    </section>
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
    <section className="author-detail">

      <button className="text-link" type="button" onClick={onBack}>
        ← Назад
      </button>

      <header className="author-detail-header">

        <p className="eyebrow">Автор</p>

        <h1 className="author-detail-title">{author.name}</h1>

        {years && (
          <p className="author-detail-years">{years}</p>
        )}

      </header>

      {books.length > 0 ? (
        <div className="author-detail-books">
          {books.map(book => (
            <BookCard key={book.id} book={book} onOpen={onOpenBookDetail} />
          ))}
        </div>
      ) : (
        <p className="author-detail-empty">В каталоге пока нет доступных книг этого автора.</p>
      )}

    </section>
  );

}
