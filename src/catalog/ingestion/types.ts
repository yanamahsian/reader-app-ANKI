import type { BookFormat, RightsAssertion } from "../types";

// The shape every source adapter must produce, regardless of what API
// or data format the source itself uses underneath. match.ts and the
// Work/Edition/BookFile model only ever see this shape — never a
// provider-specific response type. This is what makes it possible to
// later replace gutenberg.ts's internals (e.g. Gutendex today, the
// official Project Gutenberg catalog or a self-hosted mirror later)
// without touching matching, the catalog types, or the resolver.
export interface ExternalBookRecord {
  sourceId: string;
  externalId: string;

  title: string;
  // As provided by the source, verbatim — may be in an archival
  // format (e.g. "Austen, Jane, 1775-1817"). Normalization happens in
  // match.ts, not here, so the raw form is preserved for review.
  authorNames: string[];

  language: string;

  // Optional: the named translator of this specific edition, when the
  // source records one (most Project Gutenberg records do, for a
  // non-original-language edition). null/undefined means either the
  // source didn't report one or this edition is in the work's
  // original language. Added for the Gutenberg library-expansion pass
  // (see sources/gutenbergManifest.ts) so a translated Edition's
  // `translatorName` (already part of the catalog's own Edition type)
  // can be populated with real, source-reported data instead of
  // always being left null.
  translatorName?: string | null;

  formats: Array<{ format: BookFormat; url: string }>;

  rights: RightsAssertion[];
}
