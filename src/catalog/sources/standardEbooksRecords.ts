import type { ExternalBookRecord } from "../ingestion/types";

// Same lockfile philosophy as sources/gutenbergRecords.ts: a
// point-in-time, hand-verified snapshot, not a live query. No network
// request happens at app startup because of this file's existence.
// Every entry below was independently confirmed this round by
// directly fetching the real standardebooks.org ebook page for that
// title (not searched, not guessed) -- title, author, the exact
// rights statement shown, and the exact direct .epub download URL.
//
// `formats` uses the direct-download EPUB URL (not the OPDS acquisition
// link `fetchStandardEbooksRecord` would produce) since that URL was
// what was actually confirmed reachable this round. sourceId +
// externalId use the ebook's "<author-slug>/<title-slug>" path, e.g.
// "virginia-woolf/to-the-lighthouse", matching the slug stored in
// standardEbooksManifest.ts.
//
// Rights recorded here are Standard Ebooks' own STATED claim about
// the underlying text ("this ebook is thought to be free of copyright
// restrictions in the United States") -- US-scoped, exactly as they
// wrote it, every single page also explicitly warning it "may still
// be under copyright in other countries". This is deliberately NOT
// their CC0 badge (which covers their own markup/production, not the
// underlying Work) and deliberately NOT recorded as jurisdiction:
// null/global. See sources/standardEbooks.ts's doc comment for the
// full reasoning, and rights/assessGermanRights.ts for how (or
// whether) a DE assertion gets added on top of this, separately.
export const STANDARD_EBOOKS_RECORDS: Record<string, ExternalBookRecord> = {

  "virginia-woolf/to-the-lighthouse": {
    sourceId: "standard-ebooks", externalId: "virginia-woolf/to-the-lighthouse",
    title: "To the Lighthouse", authorNames: ["Virginia Woolf"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://standardebooks.org/ebooks/virginia-woolf/to-the-lighthouse/downloads/virginia-woolf_to-the-lighthouse.epub" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "william-shakespeare/hamlet": {
    sourceId: "standard-ebooks", externalId: "william-shakespeare/hamlet",
    title: "Hamlet", authorNames: ["William Shakespeare"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://standardebooks.org/ebooks/william-shakespeare/hamlet/downloads/william-shakespeare_hamlet.epub" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "william-shakespeare/romeo-and-juliet": {
    sourceId: "standard-ebooks", externalId: "william-shakespeare/romeo-and-juliet",
    title: "Romeo and Juliet", authorNames: ["William Shakespeare"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://standardebooks.org/ebooks/william-shakespeare/romeo-and-juliet/downloads/william-shakespeare_romeo-and-juliet.epub" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "jane-austen/pride-and-prejudice": {
    sourceId: "standard-ebooks", externalId: "jane-austen/pride-and-prejudice",
    title: "Pride and Prejudice", authorNames: ["Jane Austen"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/jane-austen_pride-and-prejudice.epub" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "virginia-woolf/mrs-dalloway": {
    sourceId: "standard-ebooks", externalId: "virginia-woolf/mrs-dalloway",
    title: "Mrs. Dalloway", authorNames: ["Virginia Woolf"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://standardebooks.org/ebooks/virginia-woolf/mrs-dalloway/downloads/virginia-woolf_mrs-dalloway.epub" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "mark-twain/the-adventures-of-huckleberry-finn": {
    sourceId: "standard-ebooks", externalId: "mark-twain/the-adventures-of-huckleberry-finn",
    title: "The Adventures of Huckleberry Finn", authorNames: ["Mark Twain"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://standardebooks.org/ebooks/mark-twain/the-adventures-of-huckleberry-finn/downloads/mark-twain_the-adventures-of-huckleberry-finn.epub" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  },
  "oscar-wilde/the-picture-of-dorian-gray": {
    sourceId: "standard-ebooks", externalId: "oscar-wilde/the-picture-of-dorian-gray",
    title: "The Picture of Dorian Gray", authorNames: ["Oscar Wilde"], language: "en",
    translatorName: null,
    formats: [
      { format: "epub", url: "https://standardebooks.org/ebooks/oscar-wilde/the-picture-of-dorian-gray/downloads/oscar-wilde_the-picture-of-dorian-gray.epub" }
    ],
    rights: [{ status: "public-domain", jurisdiction: "US" }]
  }

};
