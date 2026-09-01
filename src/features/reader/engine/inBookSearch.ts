import type { LoadedDocument } from "./formats/types";

export const MAX_IN_BOOK_SEARCH_RESULTS = 300;

export interface InBookSearchResult {
  pageIndex: number;
  chapterTitle: string | null;
  startOffset: number;
  endOffset: number;
  beforeText: string;
  matchText: string;
  afterText: string;
  leadingEllipsis: boolean;
  trailingEllipsis: boolean;
}

export interface InBookSearchResponse {
  results: InBookSearchResult[];
  totalMatches: number;
  truncated: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function buildQueryPattern(query: string): string | null {
  const parts = query.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map(escapeRegExp).join("\\s+");
}

export function searchLoadedDocument(
  document: LoadedDocument,
  query: string,
  limit: number = MAX_IN_BOOK_SEARCH_RESULTS
): InBookSearchResponse {

  const pattern = buildQueryPattern(query);
  if (!pattern) return { results: [], totalMatches: 0, truncated: false };

  const safeLimit = Math.max(1, limit);
  const contextRadius = 84;
  const results: InBookSearchResult[] = [];
  let totalMatches = 0;
  let pageIndex = 0;

  for (const chapter of document.chapters) {

    for (const page of chapter.pages) {

      const matcher = new RegExp(pattern, "giu");
      let match: RegExpExecArray | null;

      while ((match = matcher.exec(page.rawText)) !== null) {

        if (match[0].length === 0) {
          matcher.lastIndex += 1;
          continue;
        }

        totalMatches += 1;

        if (results.length < safeLimit) {
          const startOffset = match.index;
          const endOffset = startOffset + match[0].length;
          const contextStart = Math.max(0, startOffset - contextRadius);
          const contextEnd = Math.min(page.rawText.length, endOffset + contextRadius);

          results.push({
            pageIndex,
            chapterTitle: chapter.title,
            startOffset,
            endOffset,
            beforeText: compactWhitespace(page.rawText.slice(contextStart, startOffset)),
            matchText: compactWhitespace(page.rawText.slice(startOffset, endOffset)),
            afterText: compactWhitespace(page.rawText.slice(endOffset, contextEnd)),
            leadingEllipsis: contextStart > 0,
            trailingEllipsis: contextEnd < page.rawText.length
          });
        }

      }

      pageIndex += 1;

    }

  }

  return {
    results,
    totalMatches,
    truncated: totalMatches > results.length
  };

}
