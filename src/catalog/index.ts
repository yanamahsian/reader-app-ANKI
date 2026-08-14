export type { Book, Author, Collection, TaxonomyTerm, BookFile, BookFormat, RightsStatus } from "./types";

export { authors } from "./authors";
export { books } from "./books";
export { collections } from "./collections";
export { epochs, centuries, countries, movements, genres, themes } from "./taxonomy";

import type { Author, Book, Collection } from "./types";
import { authors } from "./authors";
import { books } from "./books";
import { collections } from "./collections";

// Direct id-based lookups only — not a search algorithm. Ranking,
// weighted matching, prefix search etc. belong to the future Search
// phase, which will be built on top of this data, not inside it.

export function getBookById(id: string): Book | undefined {
  return books.find(book => book.id === id);
}

export function getAuthorById(id: string): Author | undefined {
  return authors.find(author => author.id === id);
}

export function getCollectionById(id: string): Collection | undefined {
  return collections.find(collection => collection.id === id);
}

export function getBooksByAuthor(authorId: string): Book[] {
  return books.filter(book => book.authorId === authorId);
}

export function getBooksByCollection(collectionId: string): Book[] {
  return books.filter(book => book.collectionIds.includes(collectionId));
}
