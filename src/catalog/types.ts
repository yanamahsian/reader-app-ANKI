// Internal library catalog — data model only. Not wired into search,
// the reader, or any UI in this phase (that is a later, separate
// phase). Nothing here touches omnia-library, omnia-ai, or the
// existing reader engine's own Book type
// (src/features/reader/engine/types.ts), which stays exactly as it
// is — that type describes "a book the reader can open right now";
// this one describes "a work in AN.KI's own catalog", a broader,
// separate concept that a later phase will connect to the former.

export type RightsStatus = "public-domain" | "restricted" | "unknown";

// "anki-json" (Phase 9) is AN.KI's own normalized reader content —
// not a raw source format like the other three, but the format the
// resolver now prefers whenever it's available (see
// toReaderBook.ts's READER_SUPPORTED_FORMATS).
export type BookFormat = "plaintext" | "epub" | "fb2" | "pdf" | "anki-json";

export interface BookFile {
  format: BookFormat;
  url: string;
}

// A rights determination scoped to a jurisdiction — never treat a
// source's own "public domain" claim as globally true. Project
// Gutenberg, for example, states its status explicitly as "public
// domain in the USA", not worldwide. jurisdiction is an ISO 3166-1
// country code, or null when the claim genuinely isn't
// jurisdiction-scoped (e.g. this project's own seed data, entered
// without a specific territory in mind — that is a gap to fill in
// later, not a claim of global validity). An Edition can carry more
// than one assertion (e.g. confirmed public-domain in the US, still
// unknown in the EU) without any type change later.
//
// Stage 19 addition: `assessedBy` distinguishes a claim a source
// itself makes ("source", e.g. Gutenberg's/Standard Ebooks' own
// "public domain in the USA" statement, copied as-is) from a
// determination this catalog computed independently
// ("catalog-assessment", e.g. rights/assessGermanRights.ts deriving a
// DE assertion from a real author/translator death year rather than
// trusting a source's US-scoped claim to mean anything about
// Germany). Optional and omitted on every assertion recorded before
// this field existed -- an absent value means "source claim, as
// before", not "unknown" or "unverified".
export interface RightsAssertion {
  status: RightsStatus;
  jurisdiction: string | null;
  assessedBy?: "source" | "catalog-assessment";
}

// A specific published version of a Work: a language, a translation
// (or the original), and the file(s) available for it. One Work can
// have several Editions (original + translations, or the same
// language from two different sources) — see catalog/ingestion for
// how external editions get attached to an existing Work.
export interface Edition {
  id: string;
  language: string;
  isOriginal: boolean;
  translatorName: string | null;
  rights: RightsAssertion[];
  // "seed" for this project's own hand-entered data, or a source id
  // such as "gutenberg" for an ingested edition.
  sourceId: string;
  // Source-specific identifiers, cached after a confirmed match so a
  // later re-import of the same external record is recognized
  // instantly instead of re-running identity matching. Empty for
  // seed data.
  externalIds: Record<string, string>;
  files: BookFile[];
}

// A literary work's author. Deliberately its own entity (not a bare
// string on Book) so the same author can be referenced consistently
// across every work, and found under any of their name's spellings.
export interface Author {
  id: string;
  name: string;
  alternativeNames: string[];
  birthYear: number | null;
  deathYear: number | null;
}

// A single system-taxonomy dictionary entry (epoch, century, country
// or literary tradition, movement, genre, or theme). Books reference
// these by id, never by free-text label — that is what lets one book
// record automatically surface under every matching filter, instead
// of needing a duplicated copy per category.
export interface TaxonomyTerm {
  id: string;
  label: string;
}

// A curated AN.KI editorial collection — deliberately separate from
// system taxonomy: this is an opinionated, human-made grouping, not a
// classification fact about the work.
export interface Collection {
  id: string;
  title: string;
  description: string;
  // Full path relative to /public (e.g. "collections/philosophy.jpg"),
  // not just a bare filename — the component that renders it only
  // prepends BASE_URL, it never derives or guesses a path from the
  // collection's id. null means no image yet; UI must fall back
  // gracefully, never to a broken-image icon.
  image: string | null;
}

// A canonical Work in AN.KI's catalog — "War and Peace" as one
// concept, regardless of how many languages, translations, or files
// exist for it. Rights are no longer a single flat field here: they
// live per-Edition (see RightsAssertion), because a translation's
// rights status is not automatically the same as the original's.
export interface Book {
  id: string;
  title: string;
  originalTitle: string | null;
  alternativeTitles: string[];

  authorId: string;
  // Denormalized for convenient display without a join; authorId
  // above remains the source of truth for identity and lookups.
  authorName: string;

  originalLanguage: string;
  availableLanguages: string[];

  publicationYear: number | null;

  countryId: string | null;
  centuryId: string | null;
  epochId: string | null;
  movementId: string | null;
  genreIds: string[];
  themeIds: string[];

  description: string;
  cover: string | null;

  // Zero or more Editions. An edition with an empty `files` array
  // means "known to exist, not available to read yet" — not an
  // error. A Work with zero editions altogether shouldn't normally
  // happen once migrated, but is handled the same way by the
  // resolver: nothing to read.
  editions: Edition[];

  collectionIds: string[];
}

