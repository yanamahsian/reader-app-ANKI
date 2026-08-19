import type { Book, Author, Edition, RightsAssertion } from "./types";
import { TRANSLATOR_DEATH_YEARS } from "./translatorDeathYears";

// Stage 19 runtime activation (round 4): a real, separate CATALOG
// RIGHTS ASSESSMENT layer for Germany -- deliberately narrow. This is
// NOT a general-purpose worldwide copyright engine; it implements
// exactly one well-established, currently-in-force legal rule (German
// "Regelschutzfrist", Sec. 64 UrhG, extended to a jointly-authored
// work's LAST-surviving co-author under Sec. 65 UrhG): protection runs
// through Dec 31 of the year (death year + 70) falls in, so a work is
// genuinely public domain in Germany starting Jan 1 of (death year +
// 71). This is a real, time-dependent legal fact -- computed from
// `new Date().getFullYear()` at runtime, never hardcoded to today's
// year -- applied only to this catalog's own ~26 Works, using only
// real, independently-verified author/translator death years already
// on record in authors.ts and translatorDeathYears.ts. Nothing here
// invents a death year, guesses a nationality-based rule, or applies
// any exception beyond the one explicitly listed below.
function isPdInGermanyByDeathYear(deathYear: number): boolean {
  const currentYear = new Date().getFullYear();
  return currentYear >= deathYear + 71;
}

// A narrow, explicitly-listed exception for an author whose work is
// verifiably ancient and long, long out of copyright everywhere, but
// who has no historically confirmed death year to run the life+70 math
// against at all (Homer -- not merely "unconfirmed" the way a modern
// translator might be, but a figure with no agreed date of death in
// the historical record). This is deliberately NOT a general "unknown
// deathYear -> assume public domain" rule -- see isOriginalAuthorPdInGermany
// below, which stays conservative (no DE assertion at all) for every
// OTHER author with a null deathYear. Homer is the one deliberate,
// reviewed exception in this catalog's current 26 Works.
const ANCIENT_ANONYMOUS_AUTHOR_IDS = new Set(["homer"]);

function isOriginalAuthorPdInGermany(author: Author): boolean {
  if (ANCIENT_ANONYMOUS_AUTHOR_IDS.has(author.id)) return true;
  if (author.deathYear === null) return false;
  return isPdInGermanyByDeathYear(author.deathYear);
}

// A translator's death year is looked up by the EXACT translatorName
// string already recorded on the Edition -- the same string
// translatorDeathYears.ts is keyed by. A translator this catalog has
// not independently verified a death year for (see
// translatorDeathYears.ts's own doc comment on its 4 deliberate
// omissions: R. Dillon Boylan, "D. J. Hogarth", Henry Spalding, Mary
// Pamela Milne-Home) never resolves to PD here -- an unconfirmed
// death year is read as "unconfirmed", never guessed at, and never
// treated as "assume public domain".
function isTranslatorPdInGermany(translatorName: string): boolean {
  const record = TRANSLATOR_DEATH_YEARS[translatorName];
  if (!record) return false;
  return isPdInGermanyByDeathYear(record.deathYear);
}

// Whether `edition` (belonging to `work`, whose author is `author`) is
// genuinely public domain in Germany, using only real, verified data:
//  - An ORIGINAL-language edition (edition.isOriginal) depends only on
//    the original author's own death year (or the Homer exception).
//  - A TRANSLATED edition embeds the original author's copyright AND
//    carries its own, separately-protected translator copyright (a
//    translation is a "Bearbeitung" under German law) -- so BOTH the
//    original author's term AND the translator's term must have
//    expired. A translation is never treated as DE-clear just because
//    the original author's term expired; the translator's own term is
//    a real, independent legal fact, not a formality to skip. No
//    translatorName on a non-original edition (should not occur in
//    this catalog's real data, but handled conservatively) means no
//    DE assertion, since there is no one to verify a term against.
function isEditionPdInGermany(edition: Edition, author: Author): boolean {
  if (!isOriginalAuthorPdInGermany(author)) return false;
  if (edition.isOriginal) return true;
  if (!edition.translatorName) return false;
  return isTranslatorPdInGermany(edition.translatorName);
}

// Stage 19 round 4 correction: this guard used to ALSO skip an edition
// that already carried an UNSCOPED (jurisdiction: null) assertion,
// treating that legacy gap as if it already covered Germany. That was
// exactly the bug toReaderBook.ts's isAvailableInJurisdiction was
// fixed to stop trusting -- an unscoped assertion is not a
// determination for any specific country, so it must not be allowed to
// suppress a real DE determination either. Only an assertion ALREADY
// scoped to jurisdiction === "DE" counts as "already covered" now.
function alreadyHasGermanAssertion(edition: Edition): boolean {
  return edition.rights.some(assertion => assertion.jurisdiction === "DE");
}

// Only ever ADDS a new, separate DE assertion to an edition's `rights`
// array -- never edits or removes any assertion a source itself made
// (e.g. Gutenberg's/Standard Ebooks' own "public domain in the USA",
// assessedBy: "source" by omission -- see types.ts's own doc comment
// on RightsAssertion.assessedBy). Pure: returns the exact same `books`
// reference untouched when nothing changes anywhere in the catalog,
// and only shallow-copies the specific Works/Editions that actually
// gain a new assertion.
export function assessGermanRights(books: Book[], authors: Author[]): Book[] {

  const authorsById = new Map(authors.map(author => [author.id, author]));

  return books.map(work => {

    const author = authorsById.get(work.authorId);
    if (!author) return work;

    let workChanged = false;

    const editions = work.editions.map(edition => {

      if (alreadyHasGermanAssertion(edition)) return edition;
      if (!isEditionPdInGermany(edition, author)) return edition;

      const deAssertion: RightsAssertion = {
        status: "public-domain",
        jurisdiction: "DE",
        assessedBy: "catalog-assessment"
      };

      workChanged = true;
      return { ...edition, rights: [...edition.rights, deAssertion] };

    });

    if (!workChanged) return work;

    return { ...work, editions };

  });

}
