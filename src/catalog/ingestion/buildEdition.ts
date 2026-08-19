import type { Edition } from "../types";
import { getNormalizedAssetUrl } from "../normalizedAssets";
import type { ExternalBookRecord } from "./types";

// Turns a confirmed ExternalBookRecord into an actual catalog Edition.
// Source provenance stays intact (`sourceId`, `externalIds`, and the original
// provider files), but a Work that has completed offline ingestion also gets
// its Omnia-owned `anki-json` file prepended to the Edition's files. The
// resolver already ranks `anki-json` first, so production reading becomes
// provider-agnostic without losing the original source information needed for
// auditing or re-ingestion.
//
// `editionId` follows `${workId}-${record.sourceId}-${record.externalId}`
// (slashes in some provider external ids are normalized by the caller). We use
// that stable delimiter only to recover the canonical Work id and look up the
// normalized asset; there are no per-book branches here.
export function buildEditionFromExternalRecord(
  record: ExternalBookRecord,
  editionId: string,
  isOriginal: boolean
): Edition {

  const sourceDelimiter = `-${record.sourceId}-`;
  const sourceOffset = editionId.indexOf(sourceDelimiter);
  const workId = sourceOffset >= 0 ? editionId.slice(0, sourceOffset) : null;
  const normalizedUrl = workId ? getNormalizedAssetUrl(workId) : null;

  const files: Edition["files"] = normalizedUrl
    ? [{ format: "anki-json", url: normalizedUrl }, ...record.formats]
    : [...record.formats];

  return {
    id: editionId,
    language: record.language,
    isOriginal,
    translatorName: record.translatorName ?? null,
    rights: record.rights,
    sourceId: record.sourceId,
    externalIds: { [record.sourceId]: record.externalId },
    files
  };
}
