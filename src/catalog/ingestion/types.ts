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

  formats: Array<{ format: BookFormat; url: string }>;

  rights: RightsAssertion[];
}
