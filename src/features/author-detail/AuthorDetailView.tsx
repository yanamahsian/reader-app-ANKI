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
    <section className="book-detail">
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
    <section className="book-detail">

      <button className="text-link" type="button" onClick={onBack}>
        ← Назад
      </button>

      <header className="book-detail-header">
        <p className="eyebrow">Автор</p>
        <h1 className="book-detail-title">{author.name}</h1>
        {years && <p className="book-detail-original-title">{years}</p>}
      </header>

      {books.length > 0 ? (
        <div>
          {books.map(book => (
            <BookCard key={book.id} book={book} onOpen={onOpenBookDetail} />
          ))}
        </div>
      ) : (
        <p className="book-detail-not-found">В каталоге пока нет доступных книг этого автора.</p>
      )}

    </section>
  );

}
