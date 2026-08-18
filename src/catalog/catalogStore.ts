import type { Book, Author } from "./types";
import { books as seedBooks } from "./books";
import { authors as seedAuthors } from "./authors";

// The single place the rest of the catalog layer (search.ts,
// index.ts's lookups) reads books/authors from. Starts populated with
// the static seed data (books.ts/authors.ts) synchronously, at module
// load — so the app is fully usable immediately, including if
// Supabase is unreachable. loadRemoteCatalog() (remoteCatalog.ts)
// used to REPLACE this in-memory data outright once the remote
// catalog loaded. That was the bug: omnia-catalog's public gating
// (Stage 17) means its response can legitimately be a small subset of
// the full catalog — right now, only Works/Authors marked
// published+catalog_ready in Postgres, which in practice is just
// Jane Austen. A plain replace made every seed author/book with no
// remote counterpart yet (Tolstoy, Nietzsche, Shakespeare, Dante,
// ...) vanish from search the instant the remote call succeeded, even
// though their seed records were perfectly valid and still meant to
// be shown. Fixed below by merging instead of replacing: seed records
// are always kept, remote records are added, and a remote record only
// ever overwrites the seed record that shares its id — it can never
// remove one. search.ts stays a synchronous, pure function of (query,
// language) either way — only the data these getters return changes
// underneath it, and that data is now guaranteed to be a superset of
// the seed catalog, never a subset.

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

// Merges `remote` on top of `seed` by id: every seed record is kept
// unless a remote record shares its id (in which case the remote
// version wins, since it reflects live Postgres data), and every
// remote record whose id isn't already in `seed` is appended as a
// new record. A Map is used specifically so a ordinary `Map.set()` on
// an id already present updates that record in place (preserving its
// original position, i.e. seed ordering) while a new id is appended
// at the end — meaning an empty or partial `remote` array leaves
// `seed`'s content and order completely unchanged, and there can
// never be two records sharing one id in the result.
function mergeById<T extends { id: string }>(seed: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const record of seed) {
    merged.set(record.id, record);
  }
  for (const record of remote) {
    merged.set(record.id, record);
  }
  return Array.from(merged.values());
}

export function setRemoteCatalog(books: Book[], authors: Author[]): void {
  currentBooks = mergeById(seedBooks, books);
  currentAuthors = mergeById(seedAuthors, authors);
  remoteLoaded = true;
}
