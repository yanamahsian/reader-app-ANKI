import type { Book, Author } from "../types";
import type { ExternalBookRecord } from "./types";
import { matchExternalRecord } from "./match";
import { buildEditionFromExternalRecord } from "./buildEdition";

// Stage 19: the same real, deterministic, network-free mechanism as
// ingestion/applyGutenbergManifest.ts, generalized so every additional
// provider (Standard Ebooks now; Wikisource and Europeana once a
// record actually clears independent verification) shares ONE real
// implementation instead of copy-pasting the matching/curation logic
// again per source. applyGutenbergManifest.ts itself is left
// completely untouched by this file -- it keeps its own,
// already-verified standalone implementation, so nothing about the
// existing Gutenberg pipeline's proven behavior changes just because
// new sources were added.
//
// The curation gate lives here, identically to
// applyGutenbergManifest.ts: `books` is the existing, closed allowlist
// of Works. An entry naming a workId not already in `books` is
// skipped and logged -- NEVER auto-created. No provider, ever, can add
// a new Work to this catalog; the only thing any manifest entry can
// do is attach an Edition to a Work that already exists. Confidence
// rules are unchanged from match.ts's original contract: "ambiguous"
// and "none" confidence never auto-attach without a human-authored
// reviewNote confirming that exact workId.
export interface ManifestEntry {
  workId: string;
  externalId: string;
  reviewNote?: string;
}

export function applyManifest(
  books: Book[],
  authors: Author[],
  manifest: ManifestEntry[],
  records: Record<string, ExternalBookRecord>
): Book[] {

  const result = books.map(work => ({ ...work, editions: [...work.editions] }));
  const byId = new Map(result.map(work => [work.id, work]));

  const seenEditionIds = new Set<string>();
  for (const work of result) {
    for (const edition of work.editions) {
      seenEditionIds.add(edition.id);
    }
  }

  for (const entry of manifest) {

    const record = records[entry.externalId];
    const work = byId.get(entry.workId);

    if (!record) {
      console.error(`applyManifest: no cached record for external id "${entry.externalId}" (manifest entry "${entry.workId}")`);
      continue;
    }

    if (!work) {
      console.error(`applyManifest: manifest entry "${entry.workId}" does not match any existing catalog Work id -- refusing to create a new Work`);
      continue;
    }

    // Matched against the ORIGINAL, unmodified `books`/`authors` --
    // same identity-matching contract as applyGutenbergManifest.ts.
    const match = matchExternalRecord(record, books, authors);

    const accepted =
      (match.confidence === "high" && match.workId === entry.workId) ||
      ((match.confidence === "ambiguous" || match.confidence === "none") && Boolean(entry.reviewNote));

    if (!accepted) {
      console.error(`applyManifest: rejected "${entry.workId}" (${record.sourceId} #${entry.externalId}) -- confidence=${match.confidence}, matchedWorkId=${match.workId}, reviewNote=${entry.reviewNote ? "present" : "MISSING"}`);
      continue;
    }

    const editionId = `${entry.workId}-${record.sourceId}-${record.externalId.replace(/\//g, "-")}`;

    if (seenEditionIds.has(editionId)) {
      console.error(`applyManifest: skipped "${entry.workId}" -- duplicate edition id "${editionId}"`);
      continue;
    }
    seenEditionIds.add(editionId);

    const isOriginal = record.language === work.originalLanguage;
    work.editions.push(buildEditionFromExternalRecord(record, editionId, isOriginal));

  }

  return result;

}
