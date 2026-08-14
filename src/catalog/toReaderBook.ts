import type { Book as CatalogBook, BookFile, BookFormat, Edition } from "./types";
import type { Book as ReaderBook } from "../features/reader/engine/types";

// Formats the reader engine can actually open right now (Phase 3
// shipped EPUB and plaintext; FB2 and PDF loaders were never built).
// The resolver must never pick a format the reader can't open just
// because a file exists for it -- that file stays in the data for
// later, it's simply not selected yet.
const READER_SUPPORTED_FORMATS: BookFormat[] = ["epub", "plaintext"];

function isPublicDomain(edition: Edition): boolean {
  return edition.rights.some(assertion => assertion.status === "public-domain");
}

export interface ResolvedFile {
  edition: Edition;
  file: BookFile;
}

// Deterministic resolver: requested language (falls back to any
// public-domain edition if none matches) -> public-domain editions
// only -> format priority (EPUB before plaintext, matching what the
// reader actually supports) -> first match wins. No randomness, no
// "pick whatever's first" fallback that ignores rights or format
// support.
export function pickPreferredEditionAndFile(work: CatalogBook, preferredLanguage?: string): ResolvedFile | null {

  const publicDomainEditions = work.editions.filter(isPublicDomain);

  const languageMatches = preferredLanguage
    ? publicDomainEditions.filter(edition => edition.language === preferredLanguage)
    : [];

  const editionsToSearch = languageMatches.length ? languageMatches : publicDomainEditions;

  for (const format of READER_SUPPORTED_FORMATS) {
    for (const edition of editionsToSearch) {
      const file = edition.files.find(candidate => candidate.format === format);
      if (file) return { edition, file };
    }
  }

  return null;

}

// The reader engine's own Book type (src/features/reader/engine/types.ts)
// stays exactly as it is — this is the one place that bridges the
// richer catalog model to it, so the reader itself never needs to know
// the catalog exists.
export function toReaderBook(catalogBook: CatalogBook, resolved: ResolvedFile): ReaderBook {
  return {
    id: catalogBook.id,
    title: catalogBook.title,
    author: catalogBook.authorName,
    language: resolved.edition.language,
    year: catalogBook.publicationYear ?? undefined,
    cover: catalogBook.cover ?? undefined,
    url: resolved.file.url,
    format: resolved.file.format
  };
}
