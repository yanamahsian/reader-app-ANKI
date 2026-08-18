import type { ExternalBookRecord } from "../ingestion/types";

// Same lockfile philosophy as sources/gutenbergRecords.ts /
// standardEbooksRecords.ts -- a hand-verified snapshot, not a live
// query. Deliberately EMPTY this round. See sources/wikisource.ts's
// doc comment for the full explanation: wikisource.org (ru. and de.
// subdomains both explicitly tested) could not be reached by this
// project's own fetch tool in this sandbox this round, so no page's
// actual content, completeness, or rights notice could be
// independently confirmed -- and this project's standing rule is to
// never attach an Edition on search-result evidence alone. Real,
// concrete candidates that were found (with real URLs) but NOT
// verified are listed instead in
// sources/wikisourceReviewCandidates.ts, for a future maintenance run
// with real access to wikisource.org.
export const WIKISOURCE_RECORDS: Record<string, ExternalBookRecord> = {};
