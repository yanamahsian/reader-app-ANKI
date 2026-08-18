import type { Book, Author } from "../types";
import { applyManifest } from "./applyManifest";
import { STANDARD_EBOOKS_MANIFEST } from "../sources/standardEbooksManifest";
import { STANDARD_EBOOKS_RECORDS } from "../sources/standardEbooksRecords";

// Thin adapter: StandardEbooksManifestEntry uses `slug` (Standard
// Ebooks' own "<author-slug>/<title-slug>" naming) instead of
// GutenbergManifestEntry's `gutenbergId`; applyManifest.ts's generic
// ManifestEntry shape uses `externalId` as the source-agnostic name
// for whatever identifier that source uses. This file's only job is
// that one field rename plus wiring the right manifest/records pair
// in -- all real matching/curation/dedup logic lives in
// applyManifest.ts, shared with every other provider.
export function applyStandardEbooksManifest(books: Book[], authors: Author[]): Book[] {
  const entries = STANDARD_EBOOKS_MANIFEST.map(entry => ({
    workId: entry.workId,
    externalId: entry.slug,
    reviewNote: entry.reviewNote
  }));
  return applyManifest(books, authors, entries, STANDARD_EBOOKS_RECORDS);
}
