// Single shared language-options list for every "Язык" selector in the
// app (Home's SearchPanel and Library's own filter). Previously each
// component kept its own local, independently-hardcoded LANGUAGES array;
// they had already drifted apart in wording and both were missing
// languages that are actually present in the internal catalog once real
// Supabase-backed results are included -- most notably `ja`, with roughly
// 586 catalog-ready Japanese works on the live snapshot this was checked
// against, and no UI language option to filter by it at all.
//
// This list is a minimal, hand-maintained expansion covering every
// language the live catalog-ready audit called out (en, ja, fr, de, es,
// hu, it, fi, pt, nl, sv, da, pl) plus the languages the previous two
// lists already had (ru, zh, la, grc) so nothing visible before this
// change disappears. It is deliberately NOT a fully dynamic
// language-facet system fetched from the API -- that would be a
// reasonable future improvement (the note below on cover images is a
// similarly out-of-scope future item) but is more than this pass asked
// for; if the catalog's actual language mix drifts further from this
// list, it only needs updating in this one file for both selectors to
// pick it up.
export interface LanguageOption {
  value: string;
  label: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { value: "", label: "Все языки" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
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
