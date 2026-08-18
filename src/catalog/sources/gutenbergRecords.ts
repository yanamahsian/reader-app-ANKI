import type { ExternalBookRecord } from "../ingestion/types";

// A cached, independently-verified snapshot of the Gutendex/Gutenberg
// records referenced by gutenbergManifest.ts -- keyed by Gutenberg
// ebook id (the same id used as GutenbergManifestEntry.gutenbergId).
//
// Why a cache instead of calling fetchGutenbergRecord() (the live
// Gutendex adapter, sources/gutenberg.ts) at app startup: this
// project's own constraint is that the frontend must not make a
// network request to a third-party service on every load just to
// find out which books are readable -- that's a new failure mode
// (Gutendex down/slow/rate-limiting) for data that never changes at
// runtime. Every record below was instead verified once, by hand,
// directly against the authoritative gutenberg.org/ebooks/<id> page
// for that id (title, author, language, exact format URLs, and the
// page's own "Public domain in the USA." rights statement) -- see the
// Stage 18 report for the verification trail -- and is committed here
// exactly like a lockfile: a point-in-time, reviewed snapshot, not a
// live query.
//
// To add or refresh an entry: fetchGutenbergRecord(id) (already
// exists, already exported, intentionally unused by the app's runtime
// path) is the adapter a future offline maintenance script would call
// to regenerate/extend this file -- no such script exists yet, and
// none of this file's existing entries depend on one existing. Author
// names are given in Gutendex's own archival "Last, First[,
// qualifier]" convention (see ingestion/match.ts's own
// looseNameVariant()), not the "First Last (dates)" form the
// human-readable gutenberg.org page displays.
export const GUTENBERG_RECORDS: Record<string, ExternalBookRecord> = {

  "2600": {
    sourceId: "gutenberg", externalId: "2600", title: "War and Peace",
    authorNames: ["Tolstoy, Leo, graf"], language: "en",
    translatorName: "Aylmer Maude and Louise Maude",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/2600.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/2600.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "1399": {
    sourceId: "gutenberg", externalId: "1399", title: "Anna Karenina",
    authorNames: ["Tolstoy, Leo, graf"], language: "en",
    translatorName: "Constance Garnett",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/1399.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/1399.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "2554": {
    sourceId: "gutenberg", externalId: "2554", title: "Crime and Punishment",
    authorNames: ["Dostoyevsky, Fyodor"], language: "en",
    translatorName: "Constance Garnett",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/2554.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/2554.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "28054": {
    sourceId: "gutenberg", externalId: "28054", title: "The Brothers Karamazov",
    authorNames: ["Dostoyevsky, Fyodor"], language: "en",
    translatorName: "Constance Garnett",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/28054.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/28054.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "2229": {
    sourceId: "gutenberg", externalId: "2229", title: "Faust: Der Tragödie erster Teil",
    authorNames: ["Goethe, Johann Wolfgang von"], language: "de",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/2229.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/2229.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "2527": {
    sourceId: "gutenberg", externalId: "2527", title: "The Sorrows of Young Werther",
    authorNames: ["Goethe, Johann Wolfgang von"], language: "en",
    translatorName: "R. Dillon Boylan",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/2527.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/2527.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "1524": {
    sourceId: "gutenberg", externalId: "1524", title: "Hamlet",
    authorNames: ["Shakespeare, William"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/1524.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/1524.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "1513": {
    sourceId: "gutenberg", externalId: "1513", title: "Romeo and Juliet",
    authorNames: ["Shakespeare, William"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/1513.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/1513.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "1008": {
    sourceId: "gutenberg", externalId: "1008", title: "Divine Comedy, Cary's Translation, Complete",
    authorNames: ["Dante Alighieri"], language: "en",
    translatorName: "Henry Francis Cary",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/1008.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/1008.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "7204": {
    sourceId: "gutenberg", externalId: "7204", title: "Jenseits von Gut und Böse",
    authorNames: ["Nietzsche, Friedrich Wilhelm"], language: "de",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/7204.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/7204.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "7205": {
    sourceId: "gutenberg", externalId: "7205", title: "Also sprach Zarathustra: Ein Buch für Alle und Keinen",
    authorNames: ["Nietzsche, Friedrich Wilhelm"], language: "de",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/7205.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/7205.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "71865": {
    sourceId: "gutenberg", externalId: "71865", title: "Mrs. Dalloway",
    authorNames: ["Woolf, Virginia"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/71865.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/71865.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "174": {
    sourceId: "gutenberg", externalId: "174", title: "The Picture of Dorian Gray",
    authorNames: ["Wilde, Oscar"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/174.epub.images" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/174.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "76": {
    sourceId: "gutenberg", externalId: "76", title: "Adventures of Huckleberry Finn",
    authorNames: ["Twain, Mark"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/76.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/76.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "2199": {
    sourceId: "gutenberg", externalId: "2199", title: "The Iliad",
    authorNames: ["Homer"], language: "en",
    translatorName: "Samuel Butler",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/2199.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/2199.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "1727": {
    sourceId: "gutenberg", externalId: "1727", title: "The Odyssey",
    authorNames: ["Homer"], language: "en",
    translatorName: "Samuel Butler",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/1727.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/1727.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "1081": {
    sourceId: "gutenberg", externalId: "1081", title: "Dead Souls",
    authorNames: ["Gogol, Nikolai Vasilevich"], language: "en",
    translatorName: "D. J. Hogarth",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/1081.epub.images" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/1081.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "23997": {
    sourceId: "gutenberg", externalId: "23997", title: "Eugene Oneguine [Onegin]: A Romance of Russian Life in Verse",
    authorNames: ["Pushkin, Aleksandr Sergeevich"], language: "en",
    translatorName: "Henry Spalding",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/23997.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/23997.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "13511": {
    sourceId: "gutenberg", externalId: "13511", title: "The Daughter of the Commandant",
    authorNames: ["Pushkin, Aleksandr Sergeevich"], language: "en",
    translatorName: "Mary Pamela Milne-Home",
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/13511.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/13511.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "22367": {
    sourceId: "gutenberg", externalId: "22367", title: "Die Verwandlung",
    authorNames: ["Kafka, Franz"], language: "de",
    translatorName: null,
    // Re-checked against the live gutenberg.org/ebooks/22367 page
    // this round: it currently offers EPUB3, "Older" EPUB, and Plain
    // Text -- the earlier "plaintext-only" record was incomplete, not
    // just unlucky. The EPUB URL below was independently confirmed
    // reachable (returns non-error binary data, same verification
    // method used for every other epub entry in this file) via the
    // same friendly-alias URL convention already used everywhere else
    // here (compare war-and-peace's "2600.epub.noimages"). This
    // matters in practice: the reader's format priority always tries
    // epub before plaintext (see toReaderBook.ts's
    // READER_SUPPORTED_FORMATS), and the proxied plaintext
    // (.txt.utf-8) path for this project is currently, separately,
    // returning a live 502 from omnia-book-proxy -- so having a real
    // epub file recorded here is what actually makes this book
    // openable, not just catalog-resolvable. Kept in addition to (not
    // replacing) the plaintext entry: plaintext is still a genuine,
    // independently-confirmed Gutenberg format for this edition, and
    // buildEdition.ts attaches every format recorded here.
    formats: [
      { format: "epub", url: "https://www.gutenberg.org/ebooks/22367.epub.noimages" },
      { format: "plaintext", url: "https://www.gutenberg.org/ebooks/22367.txt.utf-8" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  }

};
