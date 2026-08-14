import type { Book as CatalogBook, BookFile, BookFormat } from "./types";
import type { Book as ReaderBook } from "../features/reader/engine/types";

// Preference order when a book happens to have more than one file —
// not a real scenario in the current seed data (each book has at
// most one), but keeps this function correct if that changes later.
const FORMAT_PRIORITY: BookFormat[] = ["epub", "fb2", "plaintext", "pdf"];

export function pickPreferredFile(files: BookFile[]): BookFile | null {

  if (!files.length) return null;

  for (const format of FORMAT_PRIORITY) {
    const match = files.find(file => file.format === format);
    if (match) return match;
  }

  return files[0];

}

// The reader engine's own Book type (src/features/reader/engine/types.ts)
// stays exactly as it is — this is the one place that bridges the
// richer catalog model to it, so the reader itself never needs to know
// the catalog exists.
export function toReaderBook(catalogBook: CatalogBook, file: BookFile): ReaderBook {
  return {
    id: catalogBook.id,
    title: catalogBook.title,
    author: catalogBook.authorName,
    language: catalogBook.originalLanguage,
    year: catalogBook.publicationYear ?? undefined,
    cover: catalogBook.cover ?? undefined,
    url: file.url,
    format: file.format
  };
}
