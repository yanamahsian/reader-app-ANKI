import type { Author, Book } from "../types";
import type { ExternalBookRecord } from "./types";
import { normalize } from "../normalize";

export type MatchConfidence = "high" | "ambiguous" | "none";

export interface MatchResult {
  confidence: MatchConfidence;
  workId: string | null;
  // Human-readable reasons, meant to be shown in a manual review
  // queue — never used programmatically, only for a person to judge
  // an "ambiguous" result by.
  reasons: string[];
}

const VOLUME_OR_PART_PATTERN = /\b(vol(ume)?\.?\s*\d+|part\s*\d+|книга\s*\d+|том\s*\d+)\b/i;

function titleMatchesWork(normalizedExternalTitle: string, work: Book): boolean {

  const candidates = [work.title, work.originalTitle, ...work.alternativeTitles];

  return candidates.some(candidate => candidate && normalize(candidate) === normalizedExternalTitle);

}

function authorMatchesWork(normalizedExternalNames: string[], work: Book, authors: Author[]): boolean {

  const author = authors.find(candidate => candidate.id === work.authorId);
  if (!author) return false;

  const candidates = [author.name, ...author.alternativeNames].map(normalize);

  return normalizedExternalNames.some(name => candidates.includes(name));

}

// Fast path: if any edition already carries this exact
// (sourceId, externalId) pair, this is a re-import of an already
// confirmed record — always high confidence, no re-matching needed.
// This is also what prevents the "War and Peace, Vol. 1" problem from
// ever resurfacing as a fresh ambiguous case on every re-run.
function findCachedMatch(record: ExternalBookRecord, works: Book[]): string | null {

  for (const work of works) {
    for (const edition of work.editions) {
      if (edition.sourceId === record.sourceId && edition.externalIds[record.sourceId] === record.externalId) {
        return work.id;
      }
    }
  }

  return null;

}

// A best-effort attempt to turn an archival "Last, First, dates" name
// into "First Last" for comparison purposes only (not stored anywhere
// — matching concern, not a data transformation applied to the
// catalog). Falls back to the original string if it doesn't look like
// that pattern.
function looseNameVariant(name: string): string {

  const match = name.match(/^([^,]+),\s*([^,]+)(?:,.*)?$/);
  if (!match) return name;

  const [, last, first] = match;
  return `${first.trim()} ${last.trim()}`;

}

export function matchExternalRecord(record: ExternalBookRecord, works: Book[], authors: Author[]): MatchResult {

  const cachedWorkId = findCachedMatch(record, works);
  if (cachedWorkId) {
    return { confidence: "high", workId: cachedWorkId, reasons: ["cached external id from a previous confirmed match"] };
  }

  const normalizedTitle = normalize(record.title);
  const normalizedAuthorNames = record.authorNames.flatMap(name => [normalize(name), normalize(looseNameVariant(name))]);

  const hasVolumeOrPartMarker = VOLUME_OR_PART_PATTERN.test(record.title);

  let bestWorkId: string | null = null;
  let bestReasons: string[] = [];
  let bestConfidence: MatchConfidence = "none";

  for (const work of works) {

    const titleExact = titleMatchesWork(normalizedTitle, work);
    const authorExact = authorMatchesWork(normalizedAuthorNames, work, authors);

    if (!titleExact && !authorExact) continue;

    const reasons: string[] = [];
    if (titleExact) reasons.push("title matches exactly (or a known alternative title)");
    if (authorExact) reasons.push("author matches exactly (or a known alternative spelling)");
    if (hasVolumeOrPartMarker) reasons.push("title contains a volume/part marker — verify this is the complete work, not one volume of it");
    if (record.language !== work.originalLanguage) reasons.push(`language (${record.language}) differs from the work's original language (${work.originalLanguage}) — likely a translation edition, not an error`);

    let confidence: MatchConfidence;

    if (titleExact && authorExact && !hasVolumeOrPartMarker) {
      confidence = "high";
    } else if (titleExact || authorExact) {
      confidence = "ambiguous";
    } else {
      confidence = "none";
    }

    // Prefer the strongest match found across all works; ties are not
    // expected in a seed catalog this small, but if they occurred,
    // this would keep the first (arbitrary) — a real ingestion
    // pipeline would surface all candidates for review instead of
    // picking one, which is a reasonable future improvement, not a
    // gap this minimal proof needs to solve.
    if (confidence === "high" || (confidence === "ambiguous" && bestConfidence !== "high")) {
      bestWorkId = work.id;
      bestReasons = reasons;
      bestConfidence = confidence;
    }

  }

  // Low/ambiguous confidence never attaches automatically and never
  // creates a Work — the caller must treat "ambiguous" as "needs a
  // human to confirm", exactly like "none".
  return {
    confidence: bestConfidence,
    workId: bestConfidence === "high" ? bestWorkId : null,
    reasons: bestReasons.length ? bestReasons : ["no title or author match found against the existing catalog"]
  };

}
