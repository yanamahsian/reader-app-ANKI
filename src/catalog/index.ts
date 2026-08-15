export type { Book, Author, Collection, TaxonomyTerm, BookFile, BookFormat, RightsStatus } from "./types";

export { collections } from "./collections";
export { epochs, centuries, countries, movements, genres, themes } from "./taxonomy";

// Phase 10: books/authors are no longer read directly from the
// static books.ts/authors.ts files here — they come from
// catalogStore.ts, which starts with that same static data and is
// replaced with the Supabase-backed catalog once loadRemoteCatalog()
// (called once at app startup, see App.tsx) succeeds. Every lookup
// below stays exactly as it was; only where its data comes from
// changed.
export { getBooks, getAuthors, isRemoteCatalogLoaded } from "./catalogStore";
export { loadRemoteCatalog } from "./remoteCatalog";

import type { Author, Book, Collection } from "./types";
import { getBooks, getAuthors } from "./catalogStore";
import { collections } from "./collections";

// Direct id-based lookups only — not a search algorithm. Ranking,
// weighted matching, prefix search etc. belong to the future Search
// phase, which will be built on top of this data, not inside it.

export function getBookById(id: string): Book | undefined {
  return getBooks().find(book => book.id === id);
}

export function getAuthorById(id: string): Author | undefined {
  return getAuthors().find(author => author.id === id);
}

export function getCollectionById(id: string): Collection | undefined {
  return collections.find(collection => collection.id === id);
}

export function getBooksByAuthor(authorId: string): Book[] {
  return getBooks().filter(book => book.authorId === authorId);
}

export function getBooksByCollection(collectionId: string): Book[] {
  return getBooks().filter(book => book.collectionIds.includes(collectionId));
}
