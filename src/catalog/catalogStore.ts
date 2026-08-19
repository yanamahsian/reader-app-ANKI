import type { Book, Author, Edition } from "./types";
import { books as seedBooks } from "./books";
import { authors as seedAuthors } from "./authors";
import { applyGutenbergManifest } from "./ingestion/applyGutenbergManifest";
import { applyStandardEbooksManifest } from "./ingestion/applyStandardEbooksManifest";
import { applyWikisourceManifest } from "./ingestion/applyWikisourceManifest";
import { assessGermanRights } from "./assessGermanRights";
import { syncAvailableLanguages } from "./syncAvailableLanguages";

// The single place the rest of the catalog layer (search.ts,
// index.ts's lookups) reads books/authors from. Starts populated with
// the static seed data (books.ts/authors.ts) synchronously, at module
// load — so the app is fully usable immediately, including if
// Supabase is unreachable. loadRemoteCatalog() (remoteCatalog.ts)
// used to REPLACE this in-memory data outright once the remote
// catalog loaded. That was the bug: omnia-catalog's public gating
// (Stage 17) means its response can legitimately be a small subset of
// the full catalog — right now, only Works/Authors marked
// published+catalog_ready in Postgres, which in practice is just
// Jane Austen. A plain replace made every seed author/book with no
// remote counterpart yet (Tolstoy, Nietzsche, Shakespeare, Dante,
// ...) vanish from search the instant the remote call succeeded, even
// though their seed records were perfectly valid and still meant to
// be shown. Fixed below by merging instead of replacing: seed records
// are always kept, remote records are added, and a remote record only
// ever overwrites the seed record that shares its id — it can never
// remove one. search.ts stays a synchronous, pure function of (query,
// language) either way — only the data these getters return changes
// underneath it, and that data is now guaranteed to be a superset of
// the seed catalog, never a subset.

// Stage 19 runtime activation (round 4): books.ts is the hand-authored
// seed metadata only (titles, authors, taxonomy, and any editions this
// project's own ingestion actually produced -- e.g. Pride and
// Prejudice's real Postgres-backed edition, the-antichrist's local
// plaintext file). Every additional real, public-domain edition this
// catalog knows about is computed HERE, once, synchronously, at module
// load -- never hand-typed into books.ts, and never fetched over the
// network at startup:
//   1. applyGutenbergManifest -- Project Gutenberg editions (Stage 18,
//      its own standalone, already-verified implementation, left
//      untouched).
//   2. applyStandardEbooksManifest -- Standard Ebooks editions (Stage
//      19), via the shared ingestion/applyManifest.ts curation gate.
//      Only ever ADDS Editions to Works that already exist here (e.g.
//      a second Hamlet edition alongside the Gutenberg one) -- never
//      creates a new Work, never removes a Gutenberg edition.
//   3. applyWikisourceManifest -- same shared curation gate; a
//      genuine, real no-op right now since
//      sources/wikisourceManifest.ts / wikisourceRecords.ts are still
//      empty (wikisource.org could not be independently verified from
//      this sandbox -- see that file's own doc comment). Left wired
//      in rather than omitted so the day a verified Wikisource record
//      exists, no pipeline change is needed to pick it up.
//   4. assessGermanRights -- a SEPARATE catalog-level rights
//      assessment layer (assessGermanRights.ts), run after every
//      source's own Editions already exist, so it can see the real,
//      already-attached translatorName/sourceId data. Adds a DE
//      ("public domain in Germany") assertion to a specific Edition
//      only when real author/translator death-year data actually
//      supports it (life+70 rule) -- never edits or replaces a
//      source's own US-scoped claim.
//   5. syncAvailableLanguages -- derives availableLanguages from the
//      final, fully-enriched edition list, so it can never drift out
//      of sync with what's actually attached.
// Europeana is intentionally NOT part of this pipeline: its adapter
// has no verified content-type/format story yet, so nothing from it
// is wired into runtime this round.
const enrichedSeedBooks: Book[] = assessGermanRights(
  applyWikisourceManifest(
    applyStandardEbooksManifest(
      applyGutenbergManifest(seedBooks, seedAuthors),
      seedAuthors
    ),
    seedAuthors
  ),
  seedAuthors
).map(syncAvailableLanguages);

let currentBooks: Book[] = enrichedSeedBooks;
let currentAuthors: Author[] = seedAuthors;
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

// Merges `remote` on top of `seed` by id: every seed record is kept
// unless a remote record shares its id (in which case the remote
// version wins, since it reflects live Postgres data), and every
// remote record whose id isn't already in `seed` is appended as a
// new record. A Map is used specifically so a ordinary `Map.set()` on
// an id already present updates that record in place (preserving its
// original position, i.e. seed ordering) while a new id is appended
// at the end — meaning an empty or partial `remote` array leaves
// `seed`'s content and order completely unchanged, and there can
// never be two records sharing one id in the result.
//
// Used for Authors only. Books use mergeBooksById below instead — a
// plain field-level replace-by-id is wrong for Books specifically
// because a Book carries `editions`, and this project's own
// Gutenberg-sourced editions (applyGutenbergManifest.ts, computed
// into enrichedSeedBooks below) are not something any remote response
// currently knows about at all.
function mergeById<T extends { id: string }>(seed: T[], remote: T[]): T[] {
  const merged = new Map<string, T>();
  for (const record of seed) {
    merged.set(record.id, record);
  }
  for (const record of remote) {
    merged.set(record.id, record);
  }
  return Array.from(merged.values());
}

// Stage 18 follow-up fix (round 2): setRemoteCatalog() used to run
// Books through the same plain mergeById() as Authors -- a remote
// Book sharing a seed Work's id fully REPLACED it, editions included.
// That silently deleted this project's own Gutenberg editions
// (computed into enrichedSeedBooks, never known to omnia-catalog)
// the moment a remote record for that same Work id existed -- the
// same category of bug that mergeById() itself was originally written
// to fix for the seed/remote split (see the comment above it), just
// recurring one layer deeper, at the edition level instead of the
// whole-catalog level.
//
// mergeEditions merges two Editions arrays by Edition.id the same way
// mergeById merges by Work/Author id: a remote edition sharing an id
// with a seed/enriched edition updates it in place; a seed/enriched
// edition with no remote counterpart is kept, never dropped; a new
// remote edition id is appended. mergeBook then merges one seed Book
// with its matching remote Book: remote's scalar fields (title,
// description, taxonomy, etc.) are allowed to update the seed's, since
// they reflect live Postgres data, but `editions` is merged (not
// replaced) via mergeEditions, and `availableLanguages` is unioned
// (never shrunk) before being re-synced with syncAvailableLanguages so
// it stays accurate for the merged edition list. mergeBooksById then
// applies this per-Work merge across the whole catalog, falling back
// to a plain append for any remote Work id that has no seed
// counterpart (nothing to merge with, so no special handling needed).
function mergeEditions(seedEditions: Edition[], remoteEditions: Edition[]): Edition[] {
  const merged = new Map<string, Edition>();
  for (const edition of seedEditions) {
    merged.set(edition.id, edition);
  }
  for (const edition of remoteEditions) {
    merged.set(edition.id, edition);
  }
  return Array.from(merged.values());
}

// Stage 19 round 4: mergeBook no longer re-syncs availableLanguages
// itself -- that now happens once, across the WHOLE merged catalog, in
// setRemoteCatalog below, right after assessGermanRights re-runs (see
// that function's own comment for why). mergeBook's own job stays
// narrow: merge one seed Book with its matching remote Book without
// ever losing an existing Edition (editions merged by id, never
// replaced wholesale) or shrinking availableLanguages (unioned, never
// reduced).
function mergeBook(seed: Book, remote: Book): Book {
  const editions = mergeEditions(seed.editions, remote.editions);
  const availableLanguages = Array.from(new Set([...seed.availableLanguages, ...remote.availableLanguages]));
  return { ...seed, ...remote, editions, availableLanguages };
}

function mergeBooksById(seed: Book[], remote: Book[]): Book[] {
  const merged = new Map<string, Book>();
  for (const book of seed) {
    merged.set(book.id, book);
  }
  for (const book of remote) {
    const existing = merged.get(book.id);
    merged.set(book.id, existing ? mergeBook(existing, book) : book);
  }
  return Array.from(merged.values());
}

// Stage 19 round 4 fix: a remote Postgres edition sharing an id with a
// locally-computed one (e.g. a future Postgres-backed Hamlet Gutenberg
// row) replaces that edition's `rights` array wholesale via
// mergeEditions above -- which would silently drop a DE assertion
// assessGermanRights had already computed for it, since Postgres has
// no concept of this catalog's own DE assessment yet. Re-running
// assessGermanRights across the WHOLE merged catalog (not just the
// remote-touched books) after every merge is what makes that loss
// self-healing: assessGermanRights is pure and idempotent (its own
// alreadyHasGermanAssertion guard skips an edition that already
// carries a real DE assertion), so re-running it over books that
// didn't change is simply a no-op for them -- no duplicate assertions,
// no accidental drift. currentAuthors (already merged with any remote
// author data) is used here rather than seedAuthors, so a
// remote-updated deathYear would also be taken into account, though no
// such override exists in this catalog's data today.
export function setRemoteCatalog(books: Book[], authors: Author[]): void {
  currentAuthors = mergeById(seedAuthors, authors);
  const merged = mergeBooksById(enrichedSeedBooks, books);
  currentBooks = assessGermanRights(merged, currentAuthors).map(syncAvailableLanguages);
  remoteLoaded = true;
}
