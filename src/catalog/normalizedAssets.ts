import { BATCH_50_WORK_IDS } from "./batch50Catalog";

// Omnia-owned normalized reader assets that have completed offline ingestion.
// The first list is the already-deployed migration; BATCH_50_WORK_IDS is the
// curated expansion generated and validated by the batch ingestion workflow.
const NORMALIZED_WORK_IDS = new Set<string>([
  "war-and-peace",
  "anna-karenina",
  "crime-and-punishment",
  "brothers-karamazov",
  "faust",
  "hamlet",
  "romeo-and-juliet",
  "divine-comedy",
  "beyond-good-and-evil",
  "thus-spoke-zarathustra",
  "mrs-dalloway",
  "picture-of-dorian-gray",
  "huckleberry-finn",
  "iliad",
  "odyssey",
  "the-metamorphosis",
  "to-the-lighthouse",
  ...BATCH_50_WORK_IDS
]);

export function getNormalizedAssetUrl(workId: string): string | null {
  if (!NORMALIZED_WORK_IDS.has(workId)) return null;

  const configuredBase = import.meta.env?.BASE_URL ?? "/reader-app-ANKI/";
  const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;

  return `${base}books-normalized/${workId}.json`;
}

export function hasNormalizedAsset(workId: string): boolean {
  return NORMALIZED_WORK_IDS.has(workId);
}
