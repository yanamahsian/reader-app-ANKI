import type { Book, Author } from "../types";
import { matchExternalRecord } from "./match";
import { buildEditionFromExternalRecord } from "./buildEdition";
import { GUTENBERG_MANIFEST } from "../sources/gutenbergManifest";
import { GUTENBERG_RECORDS } from "../sources/gutenbergRecords";

// The real, deterministic, network-free mechanism that turns
// gutenbergManifest.ts + gutenbergRecords.ts into actual Editions on
// actual Works. Called once, synchronously, at catalog init (see
// catalogStore.ts) -- no network request happens anywhere in this
// file. fetchGutenbergRecord() (the live Gutendex adapter,
// sources/gutenberg.ts) is intentionally NOT called from this runtime
// path: it remains available as the tool a future OFFLINE maintenance
// script would use to populate/refresh gutenbergRecords.ts, not
// something the app calls on every start. No such script exists yet
// -- that's an honest limitation, not a claim this file makes.
//
// Pure function: neither `books` nor `authors` is mutated; a new
// array is returned. match.ts's own contract is enforced exactly as
// verified during the Stage 18 investigation: "ambiguous" and "none"
// confidence never auto-attach — only a manifest entry carrying a
// human-authored `reviewNote` may accept a non-"high" match, and only
// for the workId that reviewNote was written to confirm. Every
// skip/reject is logged via console.error so a broken manifest entry
// fails loudly during development instead of silently shipping a
// missing book.
export function applyGutenbergManifest(books: Book[], authors: Author[]): Book[] {

  const result = books.map(work => ({ ...work, editions: [...work.editions] }));
  const byId = new Map(result.map(work => [work.id, work]));

  const seenEditionIds = new Set<string>();
  for (const work of result) {
    for (const edition of work.editions) {
      seenEditionIds.add(edition.id);
    }
  }

  for (const entry of GUTENBERG_MANIFEST) {

    const record = GUTENBERG_RECORDS[entry.gutenbergId];
    const work = byId.get(entry.workId);

    if (!record) {
      console.error(`applyGutenbergManifest: no cached record for gutenberg #${entry.gutenbergId} (manifest entry "${entry.workId}") -- add it to sources/gutenbergRecords.ts`);
      continue;
    }

    if (!work) {
      console.error(`applyGutenbergManifest: manifest entry "${entry.workId}" does not match any seed Work id`);
      continue;
    }

    // Matched against the ORIGINAL, unmodified `books`/`authors` --
    // exactly as verified by hand during the Stage 18 investigation
    // (each manifest entry's confidence tier and reviewNote were
    // recorded against this same real match.ts run).
    const match = matchExternalRecord(record, books, authors);

    const accepted =
      (match.confidence === "high" && match.workId === entry.workId) ||
      ((match.confidence === "ambiguous" || match.confidence === "none") && Boolean(entry.reviewNote));

    if (!accepted) {
      console.error(`applyGutenbergManifest: rejected "${entry.workId}" (gutenberg #${entry.gutenbergId}) -- confidence=${match.confidence}, matchedWorkId=${match.workId}, reviewNote=${entry.reviewNote ? "present" : "MISSING"}`);
      continue;
    }

    const editionId = `${entry.workId}-${record.sourceId}-${record.externalId}`;

    if (seenEditionIds.has(editionId)) {
      console.error(`applyGutenbergManifest: skipped "${entry.workId}" -- duplicate edition id "${editionId}"`);
      continue;
    }
    seenEditionIds.add(editionId);

    const isOriginal = record.language === work.originalLanguage;
    work.editions.push(buildEditionFromExternalRecord(record, editionId, isOriginal));

  }

  return result;

}
