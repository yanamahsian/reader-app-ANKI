import type { Book as CatalogBook, BookFile, BookFormat, Edition, RightsAssertion } from "./types";
import type { Book as ReaderBook } from "../features/reader/engine/types";

// Formats the reader engine can actually open right now. "anki-json"
// (Phase 9) is AN.KI's own normalized content — ranked first, ahead
// of epub/plaintext, because it's our own trusted, already
// reader-tested representation, not a third-party file the browser
// has to parse itself. epub/plaintext remain as fallbacks for
// editions that haven't gone through AN.KI ingestion yet. FB2/PDF
// loaders were never built. Exported so any code that needs the same
// "is this a format the reader can actually open" definition (e.g.
// syncAvailableLanguages.ts) uses this one list instead of
// maintaining a second copy that could silently drift from it.
export const READER_SUPPORTED_FORMATS: BookFormat[] = ["anki-json", "epub", "plaintext"];

// Stage 18 follow-up fix (round 1): a rights assertion of status
// "public-domain" used to be accepted here regardless of its
// `jurisdiction` field -- meaning an assertion that only means
// "public domain in the USA" (jurisdiction: "US", exactly what
// Project Gutenberg itself asserts, per sources/gutenberg.ts's own
// comment) was being silently treated as globally available. That was
// a real bug, not just an imprecision: it turned a USA-scoped legal
// fact into an unqualified global availability claim.
//
// Round 1's fix still defaulted every caller who passed no
// jurisdiction to a constant, ASSUMED_READER_JURISDICTION = "US" --
// which is the SAME bug in a different shape: every real visitor,
// whose actual jurisdiction this app has never known (no geolocation,
// no user-set country preference, nothing), was still silently
// treated as being in the US. That is now fixed for real: there is no
// default. `jurisdiction` is `string | undefined`, and `undefined`
// genuinely means "unknown" -- it is NOT treated as "US" or as any
// other specific place.
//
// The rule this enforces:
//  - assertion.jurisdiction === null means the assertion is
//    unconditional (not scoped to any territory) -- usable regardless
//    of whether the caller knows the visitor's jurisdiction. This is
//    the existing, unchanged model from round 1 -- untouched here.
//  - assertion.jurisdiction === "<code>" (e.g. "US") is a SCOPED
//    claim, exactly what Project Gutenberg's "Public domain in the
//    USA" means, together with its own explicit warning that visitors
//    outside the US must check their own country's law. A scoped
//    assertion is usable ONLY when the caller explicitly states
//    jurisdiction === that same code. An unknown jurisdiction
//    (undefined) NEVER makes a scoped assertion usable -- it is
//    treated as "cannot confirm this is legal here", not as "assume
//    the US".
//
// Determining a real visitor's actual jurisdiction (IP geolocation, a
// user-set country preference, an explicit "I confirm I am
// downloading this from jurisdiction X" prompt, etc.) remains a
// genuinely separate, NOT-yet-implemented requirement -- flagging it
// here rather than quietly deciding it or inventing a UI for it now.
//
// DEV_ONLY_TEST_JURISDICTION exists purely for explicit,
// hand-written development/test use (e.g. a developer manually
// previewing "what would a US visitor see", or this project's own
// verification scripts asserting that US-scoped Gutenberg rights
// resolve when the US is explicitly named). Nothing in this file, and
// no default parameter anywhere, ever reads it automatically -- it
// must be passed in by name, on purpose, by the caller. It is not a
// production default and must never become one.
export const DEV_ONLY_TEST_JURISDICTION = "US";

function isAvailableInJurisdiction(assertion: RightsAssertion, jurisdiction: string | undefined): boolean {
  if (assertion.status !== "public-domain") return false;
  if (assertion.jurisdiction === null) return true;
  return jurisdiction !== undefined && assertion.jurisdiction === jurisdiction;
}

function hasUsableRights(edition: Edition, jurisdiction: string | undefined): boolean {
  return edition.rights.some(assertion => isAvailableInJurisdiction(assertion, jurisdiction));
}

// Round 3 (jurisdiction UI) addition: whether `work` has a genuinely
// physical, potentially-readable file at all -- a public-domain
// rights assertion of ANY scope (unconditional or territory-scoped,
// unlike hasUsableRights above which requires a specific known
// jurisdiction to match a scoped one) together with a
// reader-supported format. This exists so the UI can tell apart two
// very different situations that pickPreferredEditionAndFile alone
// collapses into the same `null`:
//   1. The Work has no real Edition/File at all (e.g.
//      death-of-ivan-ilyich, whose only edition carries files: []) --
//      genuinely nothing to read, regardless of jurisdiction.
//   2. The Work has a real file, but it is rights-gated to a
//      jurisdiction the caller hasn't confirmed (e.g. every Gutenberg
//      edition, scoped "US") -- there IS something to read, contingent
//      on the visitor's actual jurisdiction, which is a very different
//      message to show than "unavailable".
// This performs no jurisdiction check of its own on purpose -- it
// only answers "does a physical file exist for some jurisdiction",
// never "is it available now".
export function hasAnyPhysicalEdition(work: CatalogBook): boolean {
  return work.editions.some(edition =>
    edition.rights.some(assertion => assertion.status === "public-domain") &&
    edition.files.some(file => READER_SUPPORTED_FORMATS.includes(file.format))
  );
}

export interface ResolvedFile {
  edition: Edition;
  file: BookFile;
}

// Deterministic resolver: requested language (falls back to any
// usable-rights edition if none matches) -> editions with rights
// usable in `jurisdiction` only -> format priority (EPUB before
// plaintext, matching what the reader actually supports) -> first
// match wins. No randomness, no "pick whatever's first" fallback that
// ignores rights, jurisdiction, or format support.
//
// `jurisdiction` has no default value on purpose (see
// DEV_ONLY_TEST_JURISDICTION's comment above): a caller that does not
// pass it is asserting "I don't know the visitor's jurisdiction", and
// gets back only unconditional (jurisdiction: null) editions, never a
// US-scoped one by default. The current production call site
// (BookDetailView.tsx) calls this with no third argument -- so, as of
// this fix, it no longer silently resolves US-scoped Gutenberg
// editions for an unknown visitor. Wiring an actual visitor
// jurisdiction (or an explicit, deliberate dev/test override) into
// that call site is UI work, and is intentionally out of scope here.
export function pickPreferredEditionAndFile(
  work: CatalogBook,
  preferredLanguage?: string,
  jurisdiction?: string
): ResolvedFile | null {

  const usableRightsEditions = work.editions.filter(edition => hasUsableRights(edition, jurisdiction));

  const languageMatches = preferredLanguage
    ? usableRightsEditions.filter(edition => edition.language === preferredLanguage)
    : [];

  const editionsToSearch = languageMatches.length ? languageMatches : usableRightsEditions;

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
