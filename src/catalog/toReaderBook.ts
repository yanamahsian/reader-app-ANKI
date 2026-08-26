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
// The rule this enforces (Stage 19 round 4 correction):
//  - assertion.jurisdiction === null means this assertion's
//    territorial scope was never actually determined -- per
//    types.ts's own doc comment on RightsAssertion, "a gap to fill in
//    later, not a claim of global validity". Earlier rounds (through
//    Stage 19's first pass) treated null as "usable regardless of
//    jurisdiction" -- that was wrong, and contradicted types.ts's own
//    documented model: an unresolved gap is not evidence a work is
//    legal to serve in any SPECIFIC country, known or unknown. A null
//    assertion by itself is therefore NEVER sufficient here anymore.
//    (hasAnyPhysicalEdition below is intentionally different -- it
//    still treats a null/any-scope public-domain assertion as proof a
//    physical file exists, which is a separate, weaker claim than "is
//    legally resolvable for jurisdiction X".)
//  - assertion.jurisdiction === "<code>" (e.g. "US" or "DE") is a
//    SCOPED claim -- either a source's own claim (Project Gutenberg's
//    "Public domain in the USA", assessedBy: "source") or this
//    catalog's own independent determination (assessGermanRights.ts,
//    assessedBy: "catalog-assessment"). A scoped assertion is usable
//    ONLY when the caller explicitly states jurisdiction === that
//    same code. An unknown jurisdiction (undefined) NEVER makes any
//    assertion usable, scoped or unscoped -- it is treated as "cannot
//    confirm this is legal here", never as "assume the US" or "assume
//    anywhere".
//
// A legacy null-only Edition (e.g. the-antichrist-seed, whose only
// recorded assertion has never been given a real territorial scope)
// consequently no longer resolves for ANY jurisdiction on its own --
// not US, not DE, not unknown -- until a real, separately-computed
// scoped assertion exists for it. assessGermanRights.ts computes and
// attaches one when the underlying author/translator data supports it
// (e.g. Nietzsche, who died in 1900 -- long enough ago that The
// Antichrist is genuinely public domain in Germany), rather than
// silently relying on this resolver treating null as a free pass.
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
  // A legacy/unscoped assertion (jurisdiction: null) is never, by
  // itself, evidence of availability in a specific country -- it must
  // never be treated as "available everywhere" or "available for an
  // unknown visitor". Only an assertion actually scoped to the exact
  // requested jurisdiction counts.
  if (assertion.jurisdiction === null) return false;
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

// Stage 19 round 4 addition: within a single format tier, more than
// one usable edition can genuinely exist (e.g. Hamlet has both a
// Gutenberg epub and a Standard Ebooks epub) -- SOURCE_QUALITY_RANK is
// a deliberately small, explicit tie-break for that case only. It
// never overrides format priority (an edition ranked "better" here
// still loses to any edition offering a higher-priority FORMAT --
// anki-json still always beats epub regardless of source) and it never
// overrides rights/language filtering, which both still run first.
//
// Gutenberg ranks ABOVE Standard Ebooks here. This is a deliberate,
// TEMPORARY choice: every Gutenberg file URL already goes through the
// existing, browser-verified omnia-book-proxy Edge Function path (see
// PROXIED_HOSTNAMES below), while Standard Ebooks URLs currently fetch
// directly, unproxied -- and that direct path has not yet been
// confirmed to actually work end-to-end in a real browser. Until a
// real browser check confirms the Standard Ebooks fetch path,
// Gutenberg is preferred whenever both exist for the same Work, so
// this app never silently prefers an unverified path over a working
// one. If a Work has no Gutenberg edition at all (e.g.
// to-the-lighthouse), Standard Ebooks is still used -- it's only
// de-prioritized, never excluded. This ordering should be revisited
// once Standard Ebooks' fetch path has actually been proven in a
// browser.
//
// Unlisted/future sourceIds fall back to a neutral middle rank rather
// than being penalized by default.
const SOURCE_QUALITY_RANK: Record<string, number> = {
  "gutenberg": 0,
  "seed": 1,
  "wikisource": 1,
  "standard-ebooks": 2,
  "europeana": 3
};
const DEFAULT_SOURCE_QUALITY_RANK = 1;

function sourceQualityRank(edition: Edition): number {
  return SOURCE_QUALITY_RANK[edition.sourceId] ?? DEFAULT_SOURCE_QUALITY_RANK;
}

// Deterministic resolver: requested language (falls back to any
// usable-rights edition if none matches) -> editions with rights
// usable in `jurisdiction` only -> format priority (EPUB before
// plaintext, matching what the reader actually supports) -> within
// that format, the highest-quality/most-verified source (see
// SOURCE_QUALITY_RANK) wins. No randomness, no "pick whatever's
// first" fallback that ignores rights, jurisdiction, or format
// support.
//
// `jurisdiction` has no default value on purpose (see
// DEV_ONLY_TEST_JURISDICTION's comment above): a caller that does not
// pass it is asserting "I don't know the visitor's jurisdiction". As
// of the Fix #1 correction above, an unscoped (jurisdiction: null)
// assertion is no longer usable for ANY caller, known or unknown
// jurisdiction -- so a caller that passes no jurisdiction now only
// gets back editions carrying an assertion scoped to a jurisdiction it
// can never match (since it has none to compare against), i.e.
// effectively no usable-rights editions at all, until a jurisdiction is
// actually named. BookDetailView.tsx still reads the visitor's own
// stored choice via useReaderJurisdiction() (readerJurisdiction.ts) and
// passes it as this third argument wherever it uses this function or
// listReadableEditions/resolveEditionFile below, so a visitor who has
// picked a jurisdiction gets a real resolution for it; a visitor who
// hasn't yet chosen one is still correctly treated as unknown, never
// silently defaulted to "US" or anywhere else.
//
// Multilingual UI phase note: BookDetailView's primary "Читать" flow no
// longer calls this directly -- it now lets the visitor choose a real
// language/edition (via listReadableEditions) and opens exactly that
// edition (via resolveEditionFile), so two different real translations
// in the same language are never silently collapsed into whichever one
// SOURCE_QUALITY_RANK below happens to prefer. This function is kept,
// unweakened, as the blind "no specific edition chosen yet" fallback
// for any other/older call site that still needs one -- its own
// behavior is unchanged.
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
    const candidates: ResolvedFile[] = [];
    for (const edition of editionsToSearch) {
      const file = edition.files.find(candidate => candidate.format === format);
      if (file) candidates.push({ edition, file });
    }
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => sourceQualityRank(a.edition) - sourceQualityRank(b.edition));
    return candidates[0];
  }

  return null;

}

// Multilingual UI phase addition: every genuinely readable Edition of
// a Work, each already paired with the specific file the reader would
// actually open for it -- the real, non-decorative source for "which
// languages/editions can this visitor actually read", as opposed to
// Book.availableLanguages (catalog/browse metadata only, proven to
// drift from what's really ingested -- see syncAvailableLanguages.ts's
// own comment on why it is deliberately NOT jurisdiction-aware).
//
// Reuses exactly the same two gates pickPreferredEditionAndFile already
// enforces -- hasUsableRights (jurisdiction-scoped, never defaults to
// "US" or anywhere else) and READER_SUPPORTED_FORMATS -- so this can
// never surface an edition the resolver itself would refuse to open.
// It does NOT collapse multiple editions in the same language into one
// entry (unlike availableLanguages, which is a flat set of language
// codes) -- every qualifying Edition is returned separately, in the
// Work's own edition order, so a caller (BookDetailView) can offer a
// real language selector plus, when a language has more than one
// qualifying edition, a secondary translation/edition choice -- without
// ever inventing data the catalog doesn't actually have.
export interface ReadableEdition {
  edition: Edition;
  file: BookFile;
}

export function listReadableEditions(work: CatalogBook, jurisdiction?: string): ReadableEdition[] {
  const result: ReadableEdition[] = [];
  for (const edition of work.editions) {
    if (!hasUsableRights(edition, jurisdiction)) continue;
    for (const format of READER_SUPPORTED_FORMATS) {
      const file = edition.files.find(candidate => candidate.format === format);
      if (file) {
        result.push({ edition, file });
        break;
      }
    }
  }
  return result;
}

// The explicit-editionId counterpart to pickPreferredEditionAndFile:
// given a specific edition the visitor actually chose (via
// listReadableEditions above), resolve it to the exact file the reader
// should open -- never a different, same-language edition the blind
// resolver might otherwise have preferred via SOURCE_QUALITY_RANK. Runs
// the identical rights gate as every other resolution path here (no
// bypass, no weakening of the rights model): a caller can never use
// this to open an edition hasUsableRights would refuse. Returns null
// when editionId doesn't belong to this work, or isn't currently
// readable for the given jurisdiction -- the same "nothing to read yet"
// signal pickPreferredEditionAndFile gives, so callers can fall back to
// the same jurisdiction-prompt / unavailable UI either way.
export function resolveEditionFile(
  work: CatalogBook,
  editionId: string,
  jurisdiction?: string
): ResolvedFile | null {
  const match = listReadableEditions(work, jurisdiction).find(candidate => candidate.edition.id === editionId);
  return match ?? null;
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
