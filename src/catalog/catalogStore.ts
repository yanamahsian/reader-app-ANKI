import type { Book, Author, Edition, RightsAssertion, BookFile } from "./types";
import { books as seedBooks } from "./books";
import { authors as seedAuthors } from "./authors";
import { BATCH50_BOOKS, BATCH50_AUTHORS } from "./batch50";
import { applyGutenbergManifest } from "./ingestion/applyGutenbergManifest";
import { applyStandardEbooksManifest } from "./ingestion/applyStandardEbooksManifest";
import { applyWikisourceManifest } from "./ingestion/applyWikisourceManifest";
import { assessGermanRights } from "./assessGermanRights";
import { syncAvailableLanguages } from "./syncAvailableLanguages";

// The catalog remains synchronous and network-free at runtime. The first large
// Omnia batch is curated data just like the seed catalog; its physical content
// has already been normalized into same-origin anki-json assets before merge.
const baseBooks: Book[] = [...seedBooks, ...BATCH50_BOOKS];
const baseAuthors: Author[] = [...seedAuthors, ...BATCH50_AUTHORS];

const enrichedSeedBooks: Book[] = assessGermanRights(
  applyWikisourceManifest(
    applyStandardEbooksManifest(
      applyGutenbergManifest(baseBooks, baseAuthors),
      baseAuthors
    ),
    baseAuthors
  ),
  baseAuthors
).map(syncAvailableLanguages);

let currentBooks: Book[] = enrichedSeedBooks;
let currentAuthors: Author[] = baseAuthors;
let remoteLoaded = false;

export function getBooks(): Book[] {
  return currentBooks;
}

export function getAuthors(): Author[] {
  return currentAuthors;
}

export function isRemoteCatalogLoaded(): boolean {
  return remoteLoaded;
}

// Original HEAD 1e3faae helpers -- used ONLY by setRemoteCatalog below,
// unchanged in semantics: a plain last-write-wins merge by id (remote
// always overwrites an existing seed record wholesale on a matching id).
// setRemoteCatalog's own behavior must stay byte/semantically identical
// to before the Library work -- these are kept exactly as they were
// rather than switched to the curated-safe logic below, which is for
// mergeLibraryPage only (see that function's own comment).
function mergeById<T extends { id: string }>(seed: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const record of seed) merged.set(record.id, record);
  for (const record of remote) merged.set(record.id, record);
  return Array.from(merged.values());
}

function mergeEditions(seedEditions: Edition[], remoteEditions: Edition[]): Edition[] {
  const merged = new Map<string, Edition>();
  for (const edition of seedEditions) merged.set(edition.id, edition);
  for (const edition of remoteEditions) merged.set(edition.id, edition);
  return Array.from(merged.values());
}

function mergeBook(seed: Book, remote: Book): Book {
  const editions = mergeEditions(seed.editions, remote.editions);
  const availableLanguages = Array.from(new Set([...seed.availableLanguages, ...remote.availableLanguages]));
  return { ...seed, ...remote, editions, availableLanguages };
}

function mergeBooksById(seed: Book[], remote: Book[]): Book[] {
  const merged = new Map<string, Book>();
  for (const book of seed) merged.set(book.id, book);
  for (const book of remote) {
    const existing = merged.get(book.id);
    merged.set(book.id, existing ? mergeBook(existing, book) : book);
  }
  return Array.from(merged.values());
}

export function setRemoteCatalog(books: Book[], authors: Author[]): void {
  currentAuthors = mergeById(baseAuthors, authors);
  const merged = mergeBooksById(enrichedSeedBooks, books);
  currentBooks = assessGermanRights(merged, currentAuthors).map(syncAvailableLanguages);
  remoteLoaded = true;
}

// --- Everything below is used ONLY by mergeLibraryPage, never by
// setRemoteCatalog above. ---
//
// A curated (seed/batch50) record is never overwritten wholesale by an
// incoming remote one -- only an actually-empty field on the existing
// record may be filled in from the incoming side. "Filled" for a
// string (including the nullable string fields) means non-null and
// non-blank; isFilledString is the one shared test for that.
function isFilledString(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unionStrings(seed: string[], remote: string[]): string[] {
  return Array.from(new Set([...seed, ...remote]));
}

// existing (seed) author is always the base record; only an author id
// that doesn't exist yet is taken from remote as-is. portraitImage is
// never taken from remote at all, in either direction -- a curated
// author's portrait (including a deliberate null, meaning "known, no
// portrait yet") must never be replaced just because a Library/Search
// page happened to merge that same author in again.
function mergeLibraryAuthor(seed: Author, remote: Author): Author {
  return {
    id: seed.id,
    name: isFilledString(seed.name) ? seed.name : remote.name,
    alternativeNames: unionStrings(seed.alternativeNames, remote.alternativeNames),
    birthYear: seed.birthYear ?? remote.birthYear,
    deathYear: seed.deathYear ?? remote.deathYear,
    portraitImage: seed.portraitImage
  };
}

function mergeLibraryAuthorsById(seed: Author[], remote: Author[]): Author[] {
  const merged = new Map<string, Author>();
  for (const author of seed) merged.set(author.id, author);
  for (const author of remote) {
    const existing = merged.get(author.id);
    merged.set(author.id, existing ? mergeLibraryAuthor(existing, author) : author);
  }
  return Array.from(merged.values());
}

// Rights/files don't carry their own id -- "union" here means: keep
// every existing entry, then add any incoming entry that isn't already
// present (compared field-by-field), rather than either silently
// dropping one side or accumulating exact duplicates across repeated
// merges of the same edition (e.g. the same Supabase edition appearing
// again on a later Library/Search page).
function mergeLibraryRights(seedRights: RightsAssertion[], remoteRights: RightsAssertion[]): RightsAssertion[] {
  const merged = [...seedRights];
  for (const assertion of remoteRights) {
    const alreadyPresent = merged.some(existing =>
      existing.status === assertion.status &&
      existing.jurisdiction === assertion.jurisdiction &&
      existing.assessedBy === assertion.assessedBy
    );
    if (!alreadyPresent) merged.push(assertion);
  }
  return merged;
}

function mergeLibraryFiles(seedFiles: BookFile[], remoteFiles: BookFile[]): BookFile[] {
  const merged = [...seedFiles];
  for (const file of remoteFiles) {
    const alreadyPresent = merged.some(existing => existing.format === file.format && existing.url === file.url);
    if (!alreadyPresent) merged.push(file);
  }
  return merged;
}

// Same "existing is the base, incoming only fills genuinely empty
// fields" rule as mergeLibraryBook below, applied per-Edition.
// rights/files are unioned (mergeLibraryRights/mergeLibraryFiles above),
// never replaced -- this is specifically what keeps an existing DE
// catalog-assessment rights entry (added by assessGermanRights, see
// below) from being lost: it's already in `seed.rights`, so it survives
// the union unconditionally.
function mergeLibraryEdition(seed: Edition, remote: Edition): Edition {
  return {
    id: seed.id,
    language: isFilledString(seed.language) ? seed.language : remote.language,
    isOriginal: seed.isOriginal,
    translatorName: isFilledString(seed.translatorName) ? seed.translatorName : remote.translatorName,
    rights: mergeLibraryRights(seed.rights, remote.rights),
    sourceId: isFilledString(seed.sourceId) ? seed.sourceId : remote.sourceId,
    externalIds: { ...remote.externalIds, ...seed.externalIds },
    files: mergeLibraryFiles(seed.files, remote.files)
  };
}

function mergeLibraryEditions(seedEditions: Edition[], remoteEditions: Edition[]): Edition[] {
  const merged = new Map<string, Edition>();
  for (const edition of seedEditions) merged.set(edition.id, edition);
  for (const edition of remoteEditions) {
    const existing = merged.get(edition.id);
    merged.set(edition.id, existing ? mergeLibraryEdition(existing, edition) : edition);
  }
  return Array.from(merged.values());
}

// existing (seed) book is always the base record; incoming (remote)
// only fills fields that are genuinely empty on the existing record
// (isFilledString / publicationYear !== null), and only ever adds to
// the array fields (unionStrings) -- it can never blank out a curated
// title, description, cover, taxonomy reference, etc. by merging in an
// incoming record that simply doesn't have that field populated.
function mergeLibraryBook(seed: Book, remote: Book): Book {
  const editions = mergeLibraryEditions(seed.editions, remote.editions);
  return {
    id: seed.id,
    title: isFilledString(seed.title) ? seed.title : remote.title,
    originalTitle: isFilledString(seed.originalTitle) ? seed.originalTitle : remote.originalTitle,
    alternativeTitles: unionStrings(seed.alternativeTitles, remote.alternativeTitles),
    authorId: isFilledString(seed.authorId) ? seed.authorId : remote.authorId,
    authorName: isFilledString(seed.authorName) ? seed.authorName : remote.authorName,
    originalLanguage: isFilledString(seed.originalLanguage) ? seed.originalLanguage : remote.originalLanguage,
    availableLanguages: unionStrings(seed.availableLanguages, remote.availableLanguages),
    publicationYear: seed.publicationYear !== null ? seed.publicationYear : remote.publicationYear,
    countryId: isFilledString(seed.countryId) ? seed.countryId : remote.countryId,
    centuryId: isFilledString(seed.centuryId) ? seed.centuryId : remote.centuryId,
    epochId: isFilledString(seed.epochId) ? seed.epochId : remote.epochId,
    movementId: isFilledString(seed.movementId) ? seed.movementId : remote.movementId,
    genreIds: unionStrings(seed.genreIds, remote.genreIds),
    themeIds: unionStrings(seed.themeIds, remote.themeIds),
    description: isFilledString(seed.description) ? seed.description : remote.description,
    cover: isFilledString(seed.cover) ? seed.cover : remote.cover,
    editions,
    collectionIds: unionStrings(seed.collectionIds, remote.collectionIds)
  };
}

function mergeLibraryBooksById(seed: Book[], remote: Book[]): Book[] {
  const merged = new Map<string, Book>();
  for (const book of seed) merged.set(book.id, book);
  for (const book of remote) {
    const existing = merged.get(book.id);
    merged.set(book.id, existing ? mergeLibraryBook(existing, book) : book);
  }
  return Array.from(merged.values());
}

// INCREMENTAL, curated-safe merge -- NOT the same helpers setRemoteCatalog
// above uses. setRemoteCatalog is called exactly once, at app startup,
// from a single omnia-catalog response, and its remote-wins-on-conflict
// semantics are unchanged from before the Library work. This is for
// Library/Search, which pull in additional pages of AN.KI's real internal
// catalog (omnia-library-catalog) over time, as the visitor pages through
// or searches -- each call adds to whatever is already in currentBooks/
// currentAuthors rather than replacing it, so a book merged in from an
// earlier page or an earlier search stays reachable (by getBookById, from
// Book Detail/Author Detail/back-navigation) after a later call runs --
// and a curated seed/batch50 record's own fields (title, description,
// cover, portraitImage, etc.) are never blanked out by an incoming
// Supabase record that simply doesn't have that field populated.
//
// This is the ONLY way a real Supabase-catalog book becomes openable via
// the existing BookDetailView/AuthorDetailView/toReaderBook pipeline: it
// has to actually be IN this store, under its real id, with its real
// author/editions/rights -- never a parallel, display-only object with a
// fabricated authorId or empty editions (see the written report for why
// an earlier draft of this feature did that, and why it was wrong).
export function mergeLibraryPage(books: Book[], authors: Author[]): void {
  currentAuthors = mergeLibraryAuthorsById(currentAuthors, authors);
  const merged = mergeLibraryBooksById(currentBooks, books);
  currentBooks = assessGermanRights(merged, currentAuthors).map(syncAvailableLanguages);
}
