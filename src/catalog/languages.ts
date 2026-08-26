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
//
// Multilingual UI phase: added `uk` (missing entirely before this,
// despite real Ukrainian editions existing in the catalog once a
// readable one is ingested). This list is still just the fixed set of
// languages the two filter dropdowns *offer* to search/browse by --
// picking a value here has never been, and still isn't, a claim that a
// readable edition in that language exists for any specific Work. That
// truth now lives entirely server-side: library_catalog_search.sql's
// language filter checks real qualifying editions (a ready Edition with
// a ready reader-format file and public-domain rights), not
// works.original_language/available_languages, and
// omnia-library-catalog already returns each Book's real, ungrouped
// editions (Book.editions) for BookDetailView's own per-Work language
// selector -- so this file only needs to stay "server-driven-ready" in
// the sense that neither of those two truths depends on it. A fully
// dynamic facet list (fetching exactly the languages that currently
// have at least one catalog-ready edition, instead of this fixed set)
// remains the reasonable future improvement noted above -- out of scope
// for this pass, which only had to stop this list from being the
// reason `uk` couldn't be filtered on at all.
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
