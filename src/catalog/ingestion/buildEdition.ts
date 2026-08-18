import type { Edition } from "../types";
import type { ExternalBookRecord } from "./types";

// The one piece the Phase 8 adapter/matcher pair (sources/gutenberg.ts
// + ingestion/match.ts) stopped short of providing: turning a
// confirmed ExternalBookRecord into an actual catalog Edition that
// pickPreferredEditionAndFile() (toReaderBook.ts) can find and
// resolve. Deliberately generic over `sourceId` — nothing here is
// Gutenberg-specific, so the same function serves any future source
// adapter that produces an ExternalBookRecord.
//
// `editionId` must be unique across the whole catalog. The convention
// used throughout this pass (see sources/gutenbergManifest.ts and its
// callers) is `${workId}-${record.sourceId}-${record.externalId}` —
// e.g. "war-and-peace-gutenberg-2600" — so it's traceable back to
// both the Work it belongs to and the exact external record it came
// from, and can never collide with another Work's edition id.
//
// `isOriginal` is deliberately a required parameter, not inferred
// from `record.language`: inferring it (e.g. "true if record.language
// matches some passed-in originalLanguage") is one string compare
// away from silently mislabeling a translation as original on a
// locale mismatch (e.g. a language code variant). The caller already
// knows this for certain — it's the whole reason the record was
// matched to this Work in the first place — so it's passed through
// explicitly instead.
export function buildEditionFromExternalRecord(
  record: ExternalBookRecord,
  editionId: string,
  isOriginal: boolean
): Edition {
  return {
    id: editionId,
    language: record.language,
    isOriginal,
    translatorName: record.translatorName ?? null,
    rights: record.rights,
    sourceId: record.sourceId,
    externalIds: { [record.sourceId]: record.externalId },
    files: record.formats
  };
}
