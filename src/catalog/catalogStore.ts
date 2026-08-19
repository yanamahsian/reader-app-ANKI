import type { Book, Author, Edition } from "./types";
import { books as seedBooks } from "./books";
import { authors as seedAuthors } from "./authors";
import { BATCH50_BOOKS, BATCH50_AUTHORS } from "./batch50";
import { applyGutenbergManifest } from "./ingestion/applyGutenbergManifest";
import { applyStandardEbooksManifest } from "./ingestion/applyStandardEbooksManifest";
import { applyWikisourceManifest } from "./ingestion/applyWikisourceManifest";
import { assessGermanRights } from "./assessGermanRights";
import { syncAvailableLanguages } from "./syncAvailableLanguages";

// The catalog remains synchronous and network-free at runtime. The first large
// Omnia batch is curated data just like the seed catalog; its physical content
// has already been normalized into same-origin anki-json assets before merge.
const baseBooks: Book[] = [...seedBooks, ...BATCH50_BOOKS];
const baseAuthors: Author[] = [...seedAuthors, ...BATCH50_AUTHORS];

const enrichedSeedBooks: Book[] = assessGermanRights(
  applyWikisourceManifest(
    applyStandardEbooksManifest(
      applyGutenbergManifest(baseBooks, baseAuthors),
      baseAuthors
    ),
    baseAuthors
  ),
  baseAuthors
).map(syncAvailableLanguages);

let currentBooks: Book[] = enrichedSeedBooks;
let currentAuthors: Author[] = baseAuthors;
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

function mergeById<T extends { id: string }>(seed: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const record of seed) merged.set(record.id, record);
  for (const record of remote) merged.set(record.id, record);
  return Array.from(merged.values());
}

function mergeEditions(seedEditions: Edition[], remoteEditions: Edition[]): Edition[] {
  const merged = new Map<string, Edition>();
  for (const edition of seedEditions) merged.set(edition.id, edition);
  for (const edition of remoteEditions) merged.set(edition.id, edition);
  return Array.from(merged.values());
}

function mergeBook(seed: Book, remote: Book): Book {
  const editions = mergeEditions(seed.editions, remote.editions);
  const availableLanguages = Array.from(new Set([...seed.availableLanguages, ...remote.availableLanguages]));
  return { ...seed, ...remote, editions, availableLanguages };
}

function mergeBooksById(seed: Book[], remote: Book[]): Book[] {
  const merged = new Map<string, Book>();
  for (const book of seed) merged.set(book.id, book);
  for (const book of remote) {
    const existing = merged.get(book.id);
    merged.set(book.id, existing ? mergeBook(existing, book) : book);
  }
  return Array.from(merged.values());
}

export function setRemoteCatalog(books: Book[], authors: Author[]): void {
  currentAuthors = mergeById(baseAuthors, authors);
  const merged = mergeBooksById(enrichedSeedBooks, books);
  currentBooks = assessGermanRights(merged, currentAuthors).map(syncAvailableLanguages);
  remoteLoaded = true;
}
