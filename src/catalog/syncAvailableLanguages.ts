import type { Book } from "./types";
import { READER_SUPPORTED_FORMATS } from "./toReaderBook";

// Stage 18 follow-up fix: availableLanguages is supposed to describe
// which languages a Work can actually be read in, but nothing ever
// kept it in sync with the Editions actually attached to that Work --
// it was hand-typed once in books.ts and never revisited. Several
// Works gained a real, readable English Edition (via
// ingestion/applyGutenbergManifest.ts) without their availableLanguages
// ever being told about it.
//
// Rather than re-patch books.ts's static array by hand again (the
// same kind of manual bookkeeping issue as the Edition blocks this
// same pass moved out of books.ts), this derives availableLanguages
// from the Work's actual, final edition list -- so it can never drift
// out of sync again, including for the next book added via the
// manifest.
//
// This round's jurisdiction fix (toReaderBook.ts) made
// pickPreferredEditionAndFile's "usable" gate visitor-jurisdiction
// aware: with no known visitor jurisdiction, a US-scoped Gutenberg
// edition is correctly NOT resolved. availableLanguages is a
// different kind of fact, though -- it is catalog/browse metadata
// ("this Work has a rights-cleared edition in this language, in this
// project's records"), not a per-visitor access decision, and it is
// not re-evaluated per request the way pickPreferredEditionAndFile
// is. Tying it to "usable for an unknown visitor" would make it
// regress to only counting unconditional (jurisdiction: null)
// editions and silently undo the availableLanguages fix from the
// previous round for every Gutenberg-sourced language. So this file
// intentionally keeps its own, simpler definition: any public-domain
// rights assertion regardless of territorial scope, plus at least one
// reader-supported file format. The actual jurisdiction-aware gate
// stays exclusively in toReaderBook.ts, applied at the moment a
// specific edition is about to be resolved for reading -- this file
// only decides what languages the catalog advertises as existing.
//
// Rules enforced, per the Stage 18 request: existing languages are
// never removed (this only ever adds); a language is only ever added
// when a genuinely usable edition in that language exists (never
// invented).
function hasUsableEditionInLanguage(work: Book, language: string): boolean {
  return work.editions.some(edition =>
    edition.language === language &&
    edition.rights.some(assertion => assertion.status === "public-domain") &&
    edition.files.some(file => READER_SUPPORTED_FORMATS.includes(file.format))
  );
}

// Pure: returns the same `work` reference untouched when nothing
// needs to change, or a shallow copy with an updated
// `availableLanguages` otherwise.
export function syncAvailableLanguages(work: Book): Book {

  const languages = new Set(work.availableLanguages);
  let changed = false;

  for (const edition of work.editions) {
    if (!languages.has(edition.language) && hasUsableEditionInLanguage(work, edition.language)) {
      languages.add(edition.language);
      changed = true;
    }
  }

  if (!changed) return work;

  return { ...work, availableLanguages: Array.from(languages) };

}
