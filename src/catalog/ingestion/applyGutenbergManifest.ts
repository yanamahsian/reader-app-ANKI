import type { Book, Author } from "../types";
import { BATCH_50_BOOKS } from "../batch50Catalog";
import { applyManifest, type ManifestEntry } from "./applyManifest";
import { GUTENBERG_MANIFEST } from "../sources/gutenbergManifest";
import { GUTENBERG_RECORDS } from "../sources/gutenbergRecords";
import { GUTENBERG_BATCH_50_MANIFEST } from "../sources/gutenbergBatch50Manifest.generated";
import { GUTENBERG_BATCH_50_RECORDS } from "../sources/gutenbergBatch50Records.generated";

// Project Gutenberg remains a runtime-network-free catalog source. The legacy
// curated manifest and the first 50-book expansion both attach cached external
// records to canonical Works at startup; all downloading/parsing happened
// earlier in offline ingestion.
const LEGACY_MANIFEST: ManifestEntry[] = GUTENBERG_MANIFEST.map(entry => ({
  workId: entry.workId,
  externalId: entry.gutenbergId,
  reviewNote: entry.reviewNote
}));

export function applyGutenbergManifest(books: Book[], authors: Author[]): Book[] {
  const existingWorkIds = new Set(books.map(book => book.id));
  const expandedWorks = [
    ...books,
    ...BATCH_50_BOOKS.filter(book => !existingWorkIds.has(book.id))
  ];

  const withLegacyEditions = applyManifest(
    expandedWorks,
    authors,
    LEGACY_MANIFEST,
    GUTENBERG_RECORDS
  );

  return applyManifest(
    withLegacyEditions,
    authors,
    GUTENBERG_BATCH_50_MANIFEST,
    GUTENBERG_BATCH_50_RECORDS
  );
}
