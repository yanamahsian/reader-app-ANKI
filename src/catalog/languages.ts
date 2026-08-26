// LANGUAGE_OPTIONS below started as the single shared language-options
// list for every "Язык" selector in the app. SERVER-DRIVEN-FACETS PHASE:
// that is no longer true for Library (LibraryView.tsx) or Search
// (SearchPanel.tsx) -- both now build their dropdown from real,
// server-reported facets (src/api/libraryCatalog.ts's
// fetchLanguageFacets / LibraryCatalogPage.facets, backed by
// supabase/sql/library_language_facets.sql), not from this fixed list,
// so a language becoming readable no longer requires a frontend deploy.
//
// LANGUAGE_OPTIONS itself is kept, unchanged, because BookDetailView.tsx
// still uses it for its own per-Work edition-language label lookup --
// that selector is out of scope for this change and was deliberately
// left untouched. getLanguageLabel below is the new, general-purpose
// label lookup Library/Search use instead: it consults this same list
// first (so existing wording doesn't change for a known code), then
// falls back to Intl.DisplayNames, then to the plain uppercased code --
// so an unrecognized code from the server is labeled sensibly rather
// than hidden. See getLanguageLabel's own comment below for the full
// reasoning.
//
// picking a value from LANGUAGE_OPTIONS has never been, and still isn't,
// a claim that a readable edition in that language exists for any
// specific Work -- that truth has always lived entirely server-side
// (library_catalog_search.sql's own qualifying-edition rule), and now
// library_language_facets.sql is the same truth grouped by language
// instead of by work.
export interface LanguageOption {
  value: string;
  label: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "", label: "Все языки" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
  { value: "ja", label: "日本語" },
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "es", label: "Español" },
  { value: "hu", label: "Magyar" },
  { value: "it", label: "Italiano" },
  { value: "fi", label: "Suomi" },
  { value: "pt", label: "Português" },
  { value: "nl", label: "Nederlands" },
  { value: "sv", label: "Svenska" },
  { value: "da", label: "Dansk" },
  { value: "pl", label: "Polski" },
  { value: "zh", label: "中文" },
  { value: "la", label: "Latina" },
  { value: "grc", label: "Ἑλληνική" }
];

// Server-driven-facets phase: WHICH languages exist for Library/Search
// is now decided entirely server-side (see
// supabase/sql/library_language_facets.sql and
// src/api/libraryCatalog.ts's fetchLanguageFacets) -- LANGUAGE_OPTIONS
// above is deliberately left untouched and still exported as-is,
// because Book Detail's own per-Work edition-language selector
// (BookDetailView.tsx's `languageLabel` helper) already depends on it
// and that selector is explicitly out of scope for this change.
//
// getLanguageLabel below is the other half of the split this phase
// establishes: the backend decides WHICH codes exist; this function
// only decides HOW a given code is displayed, for any code -- including
// one this hand-maintained list has never heard of. A language code the
// backend reports that isn't in LANGUAGE_OPTIONS is never hidden because
// of that; it just falls back to Intl.DisplayNames (when available) and
// then to the plain uppercased code, so a cron-ingested new language
// shows up in Library immediately, with at worst a slightly less
// friendly label until this list is updated by hand.
const KNOWN_LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  LANGUAGE_OPTIONS.filter(option => option.value !== "").map(option => [option.value, option.label])
);

let displayNamesRu: Intl.DisplayNames | null | undefined;

function ruDisplayNames(): Intl.DisplayNames | null {
  if (displayNamesRu !== undefined) return displayNamesRu;
  try {
    displayNamesRu = typeof Intl !== "undefined" && "DisplayNames" in Intl
      ? new Intl.DisplayNames(["ru"], { type: "language" })
      : null;
  } catch {
    // Intl.DisplayNames constructed with an unsupported option/locale
    // throws rather than returning null -- treated the same as "not
    // available" here, falling through to the uppercase-code fallback.
    displayNamesRu = null;
  }
  return displayNamesRu;
}

export function getLanguageLabel(code: string): string {
  const known = KNOWN_LANGUAGE_LABELS[code];
  if (known) return known;

  const dn = ruDisplayNames();
  if (dn) {
    try {
      const label = dn.of(code);
      // Intl.DisplayNames.of() falls back to echoing the input code
      // itself (or a close variant of it) when it doesn't recognize the
      // code, rather than throwing -- checked so that echo isn't
      // presented as if it were a real, resolved display name.
      if (label && label.toLowerCase() !== code.toLowerCase()) return label;
    } catch {
      // An invalid/unrecognized language tag can throw a RangeError --
      // fall through to the plain uppercase fallback below.
    }
  }

  return code.toUpperCase();
}
