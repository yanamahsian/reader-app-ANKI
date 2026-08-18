// Same shape as sources/gutenbergManifest.ts /
// standardEbooksManifest.ts, for Wikisource. Deliberately EMPTY this
// round: see sources/wikisource.ts's doc comment -- wikisource.org
// could not be independently fetched from this sandbox (every
// language subdomain returned a "cache-only" network policy error),
// so no candidate could clear this project's "never attach without
// independently verifying" bar. The pipeline is still genuinely wired
// (ingestion/applyWikisourceManifest.ts runs this empty array through
// the exact same real applyManifest.ts every other source uses) --
// this file being empty is an honest reflection of what was verified,
// not a stub standing in for unfinished wiring.
//
// Real candidates that WERE found via search (title, real URL) but
// NOT independently verified are listed in
// sources/wikisourceReviewCandidates.ts instead -- kept separate from
// this file specifically so they can never accidentally get attached:
// nothing reads that file except a human reviewing it.
export interface WikisourceManifestEntry {
  workId: string;
  lang: string;
  pageTitle: string;
  reviewNote?: string;
}

export const WIKISOURCE_MANIFEST: WikisourceManifestEntry[] = [];
