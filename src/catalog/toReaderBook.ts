import type { Book as CatalogBook, BookFile, BookFormat, Edition } from "./types";
import type { Book as ReaderBook } from "../features/reader/engine/types";

// Formats the reader engine can actually open right now. "anki-json"
// (Phase 9) is AN.KI's own normalized content — ranked first, ahead
// of epub/plaintext, because it's our own trusted, already
// reader-tested representation, not a third-party file the browser
// has to parse itself. epub/plaintext remain as fallbacks for
// editions that haven't gone through AN.KI ingestion yet. FB2/PDF
// loaders were never built.
const READER_SUPPORTED_FORMATS: BookFormat[] = ["anki-json", "epub", "plaintext"];

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
    url: resolveFileUrl(resolved.file.url),
    format: resolved.file.format
  };
}

// PHASE 8.1: Gutenberg's own file host does not send CORS headers, so
// a browser fetch() straight to gutenberg.org is blocked. Files from
// hosts in this list are rewritten to go through the omnia-book-proxy
// Edge Function instead, which fetches them server-side (no CORS
// there) and streams the same bytes back. Everything else — the
// local antichrist.txt, or any future non-Gutenberg source — is left
// completely untouched; only a URL whose hostname matches this list
// is ever rewritten.
const BOOK_PROXY_ENDPOINT = "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-book-proxy";
const PROXIED_HOSTNAMES = new Set(["www.gutenberg.org", "gutenberg.org"]);

function resolveFileUrl(url: string): string {

  let parsed: URL;

  try {
    parsed = new URL(url, typeof window !== "undefined" ? window.location.href : undefined);
  } catch {
    // Not a parseable absolute/relative URL in this context -- leave
    // it exactly as-is rather than guessing.
    return url;
  }

  if (!PROXIED_HOSTNAMES.has(parsed.hostname)) {
    return url;
  }

  return `${BOOK_PROXY_ENDPOINT}?url=${encodeURIComponent(parsed.toString())}`;

}
