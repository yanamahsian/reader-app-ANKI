// Stage 19: real, concrete leads found via WebSearch (site:*.wikisource.org)
// while researching multi-source expansion, for Works this catalog
// already has (or, for the two currently-unavailable Works, allows).
// EVERY url below appeared verbatim in a real search result -- none
// invented. NONE of these were independently fetched/verified this
// round (wikisource.org refused direct fetches from this sandbox --
// see sources/wikisource.ts), so per this project's standing rule
// ("never attach an Edition without independently verifying it"),
// NOT ONE of these is wired into wikisourceManifest.ts or attached to
// any Work. This file is intentionally imported by nothing at
// runtime or in the build -- it exists only so a human (or a future
// session with real access to wikisource.org) has a real starting
// point instead of re-searching from zero. Nothing here is ever shown
// to a catalog user.
export interface WikisourceReviewCandidate {
  workId: string;
  lang: string;
  pageTitle: string;
  url: string;
  note: string;
}

export const WIKISOURCE_REVIEW_CANDIDATES: WikisourceReviewCandidate[] = [

  {
    workId: "war-and-peace", lang: "ru", pageTitle: "Война и мир (Толстой)",
    url: "https://ru.wikisource.org/wiki/Война_и_мир_(Толстой)",
    note: "Search evidence of real chapter subpages across all 4 volumes + epilogue. Not independently fetched. Lower priority to actually attach than the other candidates below: this catalog's existing Gutenberg edition (Maude translation) already passes this round's German rights assessment on real translator death-year data, so this Work is already DE-available without needing this."
  },
  {
    workId: "anna-karenina", lang: "ru", pageTitle: "Анна Каренина (Толстой)",
    url: "https://ru.wikisource.org/wiki/Анна_Каренина_(Толстой)",
    note: "Search evidence of chapter subpages across Parts I, II, IV, V, VI. Not independently fetched. Same lower-priority note as war-and-peace: already DE-available via the existing Garnett-translation Gutenberg edition."
  },
  {
    workId: "crime-and-punishment", lang: "ru", pageTitle: "Преступление и наказание (Достоевский)",
    url: "https://ru.wikisource.org/wiki/Преступление_и_наказание_(Достоевский)",
    note: "Search evidence of full 6-part + epilogue structure. Not independently fetched. Already DE-available via existing Garnett-translation Gutenberg edition."
  },
  {
    workId: "brothers-karamazov", lang: "ru", pageTitle: "Братья Карамазовы (Достоевский)",
    url: "https://ru.wikisource.org/wiki/Братья_Карамазовы_(Достоевский)",
    note: "Search evidence spanning early to final books + epilogue. Not independently fetched. Already DE-available via existing Garnett-translation Gutenberg edition."
  },
  {
    workId: "dead-souls", lang: "ru", pageTitle: "Мёртвые души (Гоголь)",
    url: "https://ru.wikisource.org/wiki/Мёртвые_души_(Гоголь)",
    note: "HIGH PRIORITY to actually verify: the existing Gutenberg edition's translator (\"D. J. Hogarth\") could not be confirmed to a real death year this round (see rights/translatorDeathYears.ts), so this Work stays US-only after this round -- a real Russian original here would be the direct fix. Volume 1 chapters confirmed via search; Volume 2 is genuinely, historically fragmentary in Gogol's real surviving manuscript, not a Wikisource gap."
  },
  {
    workId: "eugene-onegin", lang: "ru", pageTitle: "Евгений Онегин (Пушкин)",
    url: "https://ru.wikisource.org/wiki/Евгений_Онегин_(Пушкин)",
    note: "HIGH PRIORITY: existing Gutenberg edition's translator (\"Henry Spalding\") could not be confirmed to a real death year this round -- stays US-only. Chapters 1,6,7,8,10 confirmed via search under the \"ПСС 1977\" edition; Chapter 10 is the real, historically fragmentary/encoded chapter, not a gap."
  },
  {
    workId: "the-captains-daughter", lang: "ru", pageTitle: "Капитанская дочка (Пушкин)",
    url: "https://ru.wikisource.org/wiki/Капитанская_дочка_(Пушкин)",
    note: "HIGH PRIORITY: existing Gutenberg edition's translator (\"Mary Pamela Milne-Home\") could not be confirmed to a real death year this round -- stays US-only. Chapters I-XIV confirmed via search (XIV is the novel's real final chapter, i.e. the full arc appears present)."
  },
  {
    workId: "death-of-ivan-ilyich", lang: "ru", pageTitle: "Смерть Ивана Ильича (Толстой)",
    url: "https://ru.wikisource.org/wiki/Смерть_Ивана_Ильича_(Толстой)",
    note: "HIGH PRIORITY: this Work currently has ZERO files of any kind (its only edition is a seed placeholder with files: []) -- a verified Wikisource edition would make it readable for the first time. Main page confirmed to exist via search; full-text length/completeness NOT independently confirmed (this is a short novella typically hosted on one page rather than split into chapter subpages, per the research agent's note)."
  },
  {
    workId: "the-overcoat", lang: "ru", pageTitle: "Шинель (Гоголь)",
    url: "https://ru.wikisource.org/wiki/Шинель_(Гоголь)",
    note: "HIGH PRIORITY: this Work currently has ZERO files of any kind. Main page confirmed via search, plus a separate early-draft page and an alternate \"СС 1967\" edition -- suggests an actively maintained entry, but full-text length not independently confirmed."
  },
  {
    workId: "evening-album", lang: "ru", pageTitle: "Вечерний альбом (Цветаева)",
    url: "https://ru.wikisource.org/wiki/Вечерний_альбом_(Цветаева)",
    note: "WEAK candidate, flagged honestly rather than omitted: main collection page and author page confirmed via search, but no evidence found of individual poem subpages specifically belonging to this 1910 collection (vs. Tsvetaeva's other collections) -- completeness genuinely unconfirmed, do not treat as a strong lead the way the others above are."
  },
  {
    workId: "faust", lang: "de", pageTitle: "Faust - Der Tragödie erster Teil",
    url: "https://de.wikisource.org/wiki/Faust_-_Der_Trag%C3%B6die_erster_Teil",
    note: "Search evidence of a real page plus an Index: page (suggesting a proofread scan-based edition). Not independently fetched. Low priority to actually attach: this Work is already DE-available this round via the existing Gutenberg German-original edition + Goethe's real death year (1832)."
  },
  {
    workId: "the-metamorphosis", lang: "de", pageTitle: "Die Verwandlung (Franz Kafka)",
    url: "https://de.wikisource.org/wiki/Die_Verwandlung_(Franz_Kafka)",
    note: "Search evidence of a real page (plus a Diskussion: page and audio recordings under \"Gesprochene Wikisource\"). Not independently fetched. Low priority: already DE-available this round via the existing Gutenberg German-original edition + Kafka's real death year (1924)."
  }

  // Explicitly NOT listed: Jenseits von Gut und Böse / Also sprach
  // Zarathustra on de.wikisource.org -- the research this round found
  // NO evidence (not even a search hit) of either as a hosted work
  // page on de.wikisource.org at all, unlike the others above. Both
  // Works are already DE-available this round regardless, via their
  // existing Gutenberg German-original editions.

];
