import type { Author, Book } from "../types";
import { applyManifest } from "./applyManifest";
import { GUTENBERG_BATCH_50_MANIFEST } from "../sources/gutenbergBatch50Manifest.generated";
import { GUTENBERG_BATCH_50_RECORDS } from "../sources/gutenbergBatch50Records.generated";

export function applyGutenbergBatch50Manifest(books: Book[], authors: Author[]): Book[] {
  return applyManifest(
    books,
    authors,
    GUTENBERG_BATCH_50_MANIFEST,
    GUTENBERG_BATCH_50_RECORDS
  );
}
