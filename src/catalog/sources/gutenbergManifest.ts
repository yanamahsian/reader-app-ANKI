// The explicit source manifest requested for scaling the catalog to
// real, readable public-domain editions: workId -> the external
// Gutenberg id to attach, with an optional reviewNote for any entry
// that needed a human confirmation beyond match.ts's automatic
// exact-title-or-author check (Gutenberg splitting a work across
// multiple ebook ids, a differently-punctuated/spelled title, an
// alternate English translation title, etc.). Every id here was
// independently verified against the real gutenberg.org page for
// that id (title, author, language, format links, and the page's own
// "Public domain in the USA." rights statement) before being added —
// see the Stage 18 report for the verification trail.
//
// This manifest is REAL, wired infrastructure, not decorative data:
// ingestion/applyGutenbergManifest.ts reads it (together with the
// verified record cache in sources/gutenbergRecords.ts) at catalog
// init time (see catalogStore.ts) and actually attaches the resulting
// Editions to these Works — books.ts itself carries no Gutenberg
// edition data anymore. Adding book #21 is: one line here, one
// verified ExternalBookRecord entry in gutenbergRecords.ts — never a
// hand-typed Edition object spliced into books.ts. This is what makes
// the design scale to the next 100 or 1000 books without a rework.
export interface GutenbergManifestEntry {
  workId: string;
  gutenbergId: string;
  reviewNote?: string;
}

export const GUTENBERG_MANIFEST: GutenbergManifestEntry[] = [

  { workId: "war-and-peace", gutenbergId: "2600" },
  { workId: "anna-karenina", gutenbergId: "1399" },

  {
    workId: "crime-and-punishment",
    gutenbergId: "2554",
    reviewNote: "Title matches exactly (\"Crime and Punishment\"). Author match is not exact string-for-string: this catalog's alternativeNames for Dostoevsky use the spelling \"Dostoevsky\"/\"Fyodor Dostoevsky\", while Gutenberg's own catalog spells it \"Dostoyevsky\" (extra y) -- a real spelling-variant near-miss, not a different book. Manually confirmed via the exact, distinctive title match."
  },
  {
    workId: "brothers-karamazov",
    gutenbergId: "28054",
    reviewNote: "Same Dostoevsky/Dostoyevsky spelling-variant near-miss as crime-and-punishment. Title matches exactly (\"The Brothers Karamazov\"). Manually confirmed."
  },

  {
    workId: "faust",
    gutenbergId: "2229",
    reviewNote: "Gutenberg publishes Faust as two separate ebooks -- Part 1 (\"Der Tragödie erster Teil\", #2229) and Part 2 (\"Der Tragödie zweiter Teil\", #2230). #2229 is attached as the definitive, overwhelmingly-most-commonly-read part (the standalone stage tragedy); this is Part 1 only, not the combined two-part work. Author matches exactly; title does not exact-match this catalog's plain \"Faust\" due to the \"erster Teil\" qualifier -- manually confirmed as the correct, intended work."
  },
  { workId: "sorrows-of-young-werther", gutenbergId: "2527" },
  { workId: "hamlet", gutenbergId: "1524" },
  { workId: "romeo-and-juliet", gutenbergId: "1513" },

  {
    workId: "divine-comedy",
    gutenbergId: "1008",
    reviewNote: "Gutenberg's title is \"Divine Comedy, Cary's Translation, Complete\" (Rev. Henry Francis Cary's 1814 translation) -- explicitly marked \"Complete\" (all three canticles: Hell/Purgatory/Paradise), not a partial volume. Author matches exactly; title does not exact-match this catalog's \"Divina Commedia\"/\"Божественная комедия\" because it carries the translation/completeness description. Manually confirmed as the correct, complete work."
  },

  {
    workId: "beyond-good-and-evil",
    gutenbergId: "7204",
    reviewNote: "Title matches exactly (\"Jenseits von Gut und Böse\" = this catalog's originalTitle). Author match is not exact string-for-string: Gutenberg's full name \"Nietzsche, Friedrich Wilhelm\" includes the middle name \"Wilhelm\", which this catalog's alternativeNames (\"Friedrich Nietzsche\") omits -- a naming-form near-miss, not a different author. Manually confirmed via the exact, distinctive title match."
  },
  {
    workId: "thus-spoke-zarathustra",
    gutenbergId: "7205",
    reviewNote: "Automatic matching returned 'none' here, not just 'ambiguous': the title fails exact match for the same reason as beyond-good-and-evil's neighbor case (Gutenberg's title \"Also sprach Zarathustra: Ein Buch für Alle und Keinen\" carries the book's own subtitle; this catalog's originalTitle \"Also sprach Zarathustra\" is only a prefix of it), AND the author fails exact match for the same \"Wilhelm\" middle-name reason as beyond-good-and-evil. Both are real near-misses, not evidence of a different book -- manually confirmed via the real gutenberg.org page (same author, distinctive title) as the same work."
  },

  {
    workId: "mrs-dalloway",
    gutenbergId: "71865",
    reviewNote: "Gutenberg's title \"Mrs. Dalloway\" includes a period after \"Mrs\" that this catalog's originalTitle \"Mrs Dalloway\" does not -- a punctuation-only near-miss, not a different book. Author matches exactly. Manually confirmed."
  },

  { workId: "picture-of-dorian-gray", gutenbergId: "174" },
  { workId: "huckleberry-finn", gutenbergId: "76" },

  {
    workId: "iliad",
    gutenbergId: "2199",
    reviewNote: "Gutenberg's title \"The Iliad\" (Samuel Butler's prose translation) carries a leading \"The\" that this catalog's alternativeTitle \"Iliad\" does not -- a near-miss, not a different book. Author matches exactly. Manually confirmed. English translation used because Gutenberg does not host a Greek-original edition of the Iliad; per the project's rights-caution policy this is an old (1898), long-uncontested public-domain prose translation, not a modern one with unconfirmed rights."
  },
  {
    workId: "odyssey",
    gutenbergId: "1727",
    reviewNote: "Same \"The Odyssey\" vs \"Odyssey\" near-miss as iliad, same translator (Samuel Butler, 1900), same reasoning. Manually confirmed."
  },

  {
    workId: "dead-souls",
    gutenbergId: "1081",
    reviewNote: "Title matches exactly (\"Dead Souls\"). Author match is not exact string-for-string: Gutenberg records the translator-attributed author as \"Gogol, Nikolai Vasilevich\" (full patronymic form) where this catalog's alternativeNames use \"Nikolai Gogol\" (no patronymic) -- a naming-form near-miss, not a different book. Manually confirmed via the exact, distinctive title match."
  },

  {
    workId: "eugene-onegin",
    gutenbergId: "23997",
    reviewNote: "Automatic matching returned 'none': Gutenberg's title \"Eugene Oneguine [Onegin]: A Romance of Russian Life in Verse\" (Henry Spalding's 1881 translation) carries an alternate transliteration (\"Oneguine\") and subtitle, not an exact match to this catalog's \"Eugene Onegin\"; AND Gutenberg's author name \"Pushkin, Aleksandr Sergeevich\" uses the transliteration \"Aleksandr\", where this catalog's alternativeNames use \"Alexander Pushkin\" -- another transliteration near-miss, not a different author. Both are real near-misses, not evidence of a different book -- manually confirmed via the real gutenberg.org page as the same work."
  },
  {
    workId: "the-captains-daughter",
    gutenbergId: "13511",
    reviewNote: "Automatic matching returned 'none': Gutenberg's title \"The Daughter of the Commandant\" (Mrs. Milne-Home's 1891 translation of Капитанская дочка) is a different published English title for the same novel, not this catalog's \"The Captain's Daughter\" -- confirmed via an independent cross-reference (the same translation is also catalogued elsewhere explicitly as \"The Daughter of the Commandant: Капитанская дочка\"). Author fails exact match for the same \"Aleksandr\"/\"Alexander\" transliteration near-miss as eugene-onegin. Manually confirmed as the same novel under its alternate English title."
  },

  { workId: "the-metamorphosis", gutenbergId: "22367" }

];
