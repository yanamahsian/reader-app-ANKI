// Same shape and purpose as sources/gutenbergManifest.ts, for Standard
// Ebooks: workId -> the Standard Ebooks "<author-slug>/<title-slug>"
// to attach, mapping only onto Works that already exist in this
// catalog's own allowlist (books.ts). This file can NEVER cause a new
// Work to appear -- ingestion/applyManifest.ts only ever attaches an
// Edition to a workId it already finds in the existing catalog; an
// entry naming an unknown workId is skipped and logged, never
// auto-created (see applyManifest.ts).
//
// Every slug below was independently verified this round by fetching
// the real standardebooks.org page for that exact title (title,
// author, and the page's own rights statement) -- see the Stage 19
// report for the verification trail. All 7 are English-original
// works (Standard Ebooks' catalog is overwhelmingly English-original
// literature), so no reviewNote/confidence complication like
// gutenbergManifest.ts's Dostoevsky/Nietzsche spelling-variant cases
// was needed here -- title+author matched exactly for all 7.
export interface StandardEbooksManifestEntry {
  workId: string;
  slug: string;
  reviewNote?: string;
}

export const STANDARD_EBOOKS_MANIFEST: StandardEbooksManifestEntry[] = [

  // Previously entirely unavailable in this catalog (no Edition of
  // any kind existed) -- this is a genuinely new, real Edition, not a
  // duplicate/alternative of something already readable.
  { workId: "to-the-lighthouse", slug: "virginia-woolf/to-the-lighthouse" },

  // The remaining 6 already have a Gutenberg edition attached
  // (Stage 18) -- these are ADDITIONAL Editions on the same Works,
  // demonstrating genuine multi-source support. They do not replace
  // or remove the existing Gutenberg editions (ingestion/applyManifest.ts
  // only ever appends).
  { workId: "hamlet", slug: "william-shakespeare/hamlet" },
  { workId: "romeo-and-juliet", slug: "william-shakespeare/romeo-and-juliet" },
  { workId: "pride-and-prejudice", slug: "jane-austen/pride-and-prejudice" },

  {
    workId: "mrs-dalloway", slug: "virginia-woolf/mrs-dalloway",
    reviewNote: "Standard Ebooks' own page title is \"Mrs. Dalloway\" (with a period after \"Mrs\"), while this catalog's originalTitle is \"Mrs Dalloway\" (no period) -- the exact same punctuation-only near-miss already recorded for this Work's Gutenberg entry in gutenbergManifest.ts. Author and text match exactly. Manually confirmed."
  },
  {
    workId: "huckleberry-finn", slug: "mark-twain/the-adventures-of-huckleberry-finn",
    reviewNote: "Standard Ebooks' own page title is \"The Adventures of Huckleberry Finn\" (leading \"The\"), while this catalog's originalTitle is \"Adventures of Huckleberry Finn\" (no leading article) -- a near-miss, not a different book. Author matches exactly. Manually confirmed."
  },
  { workId: "picture-of-dorian-gray", slug: "oscar-wilde/the-picture-of-dorian-gray" }

];
