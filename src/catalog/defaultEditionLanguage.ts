// Default language for a Work's edition selector (BookDetailView.tsx):
// the visitor's own explicit in-page pick, if it's still a real option
// for this book; otherwise their preferred book language (Settings ->
// "Preferred book languages", src/i18n/bookLanguagePreference.ts), if
// one of theirs is actually readable for this Work; otherwise the
// original language, if it's actually readable; otherwise whichever
// readable language happens to come first. Never invented, never a
// blind highest-quality-source guess across languages.
//
// Internationalization v1: this is the one point the app consults the
// visitor's preferred book languages for edition selection -- it only
// ever picks which readable language is the DEFAULT selection;
// `availableLanguages` itself is untouched by this, so every language
// stays a real, selectable option regardless of this preference (see
// bookLanguagePreference.ts's own comment on why this never filters).
//
// Pure and dependency-free (every input is passed in, nothing read from
// component state/storage internally) so it's testable directly, with
// no stubbing of react or any other module needed.
export function resolveDefaultBookLanguage(args: {
  availableLanguages: string[];
  originalLanguage: string;
  preferredBookLanguages: string[];
  explicitSelection: string | null;
}): string | null {
  const { availableLanguages, originalLanguage, preferredBookLanguages, explicitSelection } = args;

  if (explicitSelection && availableLanguages.includes(explicitSelection)) return explicitSelection;

  const preferredAvailableLanguage = preferredBookLanguages.find(code => availableLanguages.includes(code));
  if (preferredAvailableLanguage) return preferredAvailableLanguage;

  if (availableLanguages.includes(originalLanguage)) return originalLanguage;

  return availableLanguages[0] ?? null;
}
