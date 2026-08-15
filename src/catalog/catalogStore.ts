import type { Book, Author } from "./types";
import { books as seedBooks } from "./books";
import { authors as seedAuthors } from "./authors";

// The single place the rest of the catalog layer (search.ts,
// index.ts's lookups) reads books/authors from. Starts populated with
// the static seed data (books.ts/authors.ts) synchronously, at module
// load — so the app is fully usable immediately, including if
// Supabase is unreachable. loadRemoteCatalog() (remoteCatalog.ts)
// swaps this in-memory data for the Supabase-backed catalog once it
// has successfully loaded. search.ts stays a synchronous, pure
// function of (query, language) either way — only the data these
// getters return changes underneath it.

let currentBooks: Book[] = seedBooks;
let currentAuthors: Author[] = seedAuthors;
let remoteLoaded = false;

export function getBooks(): Book[] {
  return currentBooks;
}

export function getAuthors(): Author[] {
  return currentAuthors;
}

export function isRemoteCatalogLoaded(): boolean {
  return remoteLoaded;
}

export function setRemoteCatalog(books: Book[], authors: Author[]): void {
  currentBooks = books;
  currentAuthors = authors;
  remoteLoaded = true;
}
