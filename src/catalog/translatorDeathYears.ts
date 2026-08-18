// Stage 19: real, independently-sourced death years for the
// translators already recorded (translatorName) on this catalog's
// existing Editions -- needed because German copyright treats a
// translation as its own separately-protected work (life of the
// translator + 70 years), on top of the original author's own term.
// Keyed by the EXACT translatorName string as it already appears in
// this catalog's Editions (sources/gutenbergRecords.ts etc.), since
// that string is what rights/assessGermanRights.ts looks up.
//
// Every entry below was verified this round against a real, citable
// source (primarily Wikipedia) -- not recalled from memory. Four
// translators this catalog also has editions from (R. Dillon Boylan,
// "D. J. Hogarth", Henry Spalding, Mary Pamela Milne-Home) are
// DELIBERATELY OMITTED: no reliable source with a confirmed death
// year could be found for them this round (see the Stage 19 report
// for what was checked and why each came up short). Omission here
// must always be read as "unconfirmed", and
// rights/assessGermanRights.ts is written to treat a missing entry
// that way -- NEVER as "assume public domain" and never as "assume
// still in copyright" either; it simply means no DE assertion is
// added for an edition translated by that person, leaving its rights
// exactly as the source (e.g. Gutenberg's US-only claim) originally
// stated.
export interface TranslatorDeathYearRecord {
  deathYear: number;
  note: string;
}

export const TRANSLATOR_DEATH_YEARS: Record<string, TranslatorDeathYearRecord> = {

  "Aylmer Maude and Louise Maude": {
    // Later of the two co-translators' death years -- under German
    // law, a jointly-authored work's term runs from the death of the
    // LAST surviving co-author, so the later date is the legally
    // relevant one, and also the more conservative (protective)
    // choice if either date were slightly off.
    deathYear: 1939,
    note: "Aylmer Maude d. 1938, Louise Maude d. 1939 (later date used). Source: Wikipedia, \"Aylmer and Louise Maude\"."
  },
  "Constance Garnett": {
    deathYear: 1946,
    note: "Source: Wikipedia, \"Constance Garnett\" (19 Dec 1861 - 17 Dec 1946)."
  },
  "Henry Francis Cary": {
    deathYear: 1844,
    note: "Source: Wikipedia, \"Henry Francis Cary\" -- translator of Dante's Divine Comedy."
  },
  "Samuel Butler": {
    deathYear: 1902,
    note: "Samuel Butler the novelist (1835-1902), translator of the Iliad (1898) and Odyssey (1900) prose translations -- explicitly NOT the earlier poet Samuel Butler of \"Hudibras\". Source: Wikipedia, \"Samuel Butler (novelist)\"."
  }

  // Omitted on purpose, unconfirmed this round:
  //  - "R. Dillon Boylan" (The Sorrows of Young Werther) -- only an
  //    uncited aggregator date (peoplepill.com, "1804-1888") was
  //    found; the page itself returned an error on direct fetch and
  //    no independent corroboration (Wikipedia/VIAF/LOC) was found.
  //  - "D. J. Hogarth" (Dead Souls) -- plausibly the same person as
  //    Charles James (C. J.) Hogarth (d. 1945), per a Wikipedia note
  //    that his Gogol credit is "sometimes printed as 'D. J.
  //    Hogarth'", but this identity link is not certain enough to
  //    treat as confirmed for a rights determination.
  //  - "Henry Spalding" (Eugene Onegin, 1881 translation) -- no
  //    Wikipedia, VIAF, or Library of Congress authority record
  //    found; search results only surfaced unrelated people sharing
  //    the name.
  //  - "Mary Pamela Milne-Home" (The Captain's Daughter) -- a
  //    plausible Find a Grave entry (1860-1936) surfaced but could
  //    not be verified as the same person, and the page itself could
  //    not be fetched to check further.

};
