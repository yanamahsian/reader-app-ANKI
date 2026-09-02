import type { Book } from "./types";

// Internationalization v1: reranks (never filters) a Library results
// list so Works with an edition in one of the visitor's preferred book
// languages (Settings -> "Preferred book languages",
// src/i18n/bookLanguagePreference.ts) come first -- everything else
// stays in the list, in its original relative order. Consumed by
// LibraryView.tsx, applied only to the default, unfiltered browse.
//
// Pure and dependency-free (the caller passes both the active language
// filter and the preferred-languages list in) so it's testable directly,
// with no stubbing of react or any other module needed.
//
// Skipped entirely once the visitor has picked an explicit language via
// the "Язык" dropdown (activeLanguageFilter non-empty): every result
// already matches that filter, so reranking would only reorder for no
// visible reason.
export function applyPreferredLanguageRanking(
  list: Book[],
  activeLanguageFilter: string,
  preferredLanguages: string[]
): Book[] {
  if (activeLanguageFilter) return list;
  if (preferredLanguages.length === 0) return list;

  const hasPreferredEdition = (book: Book): boolean =>
    preferredLanguages.includes(book.originalLanguage)
    || book.availableLanguages.some(code => preferredLanguages.includes(code));

  // Array.prototype.sort has been a stable sort since ES2019 -- this
  // only moves the "has a preferred-language edition" group ahead of
  // the rest; relative order within each group is preserved exactly as
  // the server returned it.
  return [...list].sort((a, b) => Number(hasPreferredEdition(b)) - Number(hasPreferredEdition(a)));
}
