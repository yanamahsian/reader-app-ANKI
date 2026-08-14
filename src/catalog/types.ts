// Internal library catalog — data model only. Not wired into search,
// the reader, or any UI in this phase (that is a later, separate
// phase). Nothing here touches omnia-library, omnia-ai, or the
// existing reader engine's own Book type
// (src/features/reader/engine/types.ts), which stays exactly as it
// is — that type describes "a book the reader can open right now";
// this one describes "a work in AN.KI's own catalog", a broader,
// separate concept that a later phase will connect to the former.

export type RightsStatus = "public-domain" | "restricted" | "unknown";

export type BookFormat = "plaintext" | "epub" | "fb2" | "pdf";

export interface BookFile {
  format: BookFormat;
  url: string;
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

  // Zero or more actual files, one per available format. Empty for
  // seed entries that do not have real hosted content yet (see
  // books.ts) — an empty array means "not available to read yet",
  // not an error.
  files: BookFile[];

  rightsStatus: RightsStatus;

  collectionIds: string[];
}
