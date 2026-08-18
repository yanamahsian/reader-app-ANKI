import type { Book, Author } from "../types";
import { applyManifest } from "./applyManifest";
import { WIKISOURCE_MANIFEST } from "../sources/wikisourceManifest";
import { WIKISOURCE_RECORDS } from "../sources/wikisourceRecords";

// Genuinely wired into the real pipeline (catalogStore.ts calls this
// exactly like applyStandardEbooksManifest/applyGutenbergManifest) --
// it is a real, working no-op this round because WIKISOURCE_MANIFEST
// is empty (see that file's doc comment for why), not a stub that
// pretends to run without actually being called.
export function applyWikisourceManifest(books: Book[], authors: Author[]): Book[] {
  const entries = WIKISOURCE_MANIFEST.map(entry => ({
    workId: entry.workId,
    externalId: `${entry.lang}:${entry.pageTitle}`,
    reviewNote: entry.reviewNote
  }));
  return applyManifest(books, authors, entries, WIKISOURCE_RECORDS);
}
