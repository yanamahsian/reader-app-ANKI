// Omnia-owned normalized reader assets that have completed offline ingestion.
//
// This list is data, not reader logic: once a Work is present here, every
// external Edition attached to that Work can expose the same trusted
// `anki-json` asset alongside its original provider files. The resolver already
// ranks `anki-json` ahead of EPUB/plaintext, so the production Reader uses the
// Omnia-owned copy while the original provider URLs remain available only as
// provenance/re-ingestion inputs.
//
// Adding another successfully-ingested book requires adding only its Work id
// here and committing the corresponding public/books-normalized/<workId>.json
// asset. No Reader change is required.
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
  "to-the-lighthouse"
]);

export function getNormalizedAssetUrl(workId: string): string | null {
  if (!NORMALIZED_WORK_IDS.has(workId)) return null;

  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  return `${base}books-normalized/${workId}.json`;
}

export function hasNormalizedAsset(workId: string): boolean {
  return NORMALIZED_WORK_IDS.has(workId);
}
