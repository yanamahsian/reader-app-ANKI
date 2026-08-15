import type { Author, Book } from "./types";
import { getBooks, getAuthors } from "./catalogStore";
import { genres, epochs, movements, themes } from "./taxonomy";

export interface RankedBook {
  book: Book;
  score: number;
}

export interface SearchResult {
  query: string;
  matchedAuthors: Author[];
  books: RankedBook[];
}

// Score tiers, per the agreed ranking:
// exact title > exact author > exact alternative title/name >
// prefix > partial > metadata.
const SCORE_EXACT_TITLE = 100;
const SCORE_EXACT_AUTHOR = 95;
const SCORE_EXACT_ALTERNATIVE = 90;
const SCORE_PREFIX = 70;
const SCORE_PARTIAL = 40;
const SCORE_METADATA = 10;

// Exported for reuse by catalog/ingestion/match.ts — text
// normalization is a shared, generic concern. The matching/ranking
// logic itself below is NOT reused by ingestion — identity matching
// (is this external record the same Work?) has different confidence
// requirements than search ranking (how good a match is this for a
// human's query?), and lives in its own module by design.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ё", "е")
    .trim()
    .replace(/\s+/g, " ");
}

// Highest tier reached by `query` against any of `candidates`, using
// the three scores supplied for exact / prefix / partial matches on
// this particular field group.
function bestMatchScore(
  query: string,
  candidates: Array<string | null | undefined>,
  exactScore: number,
  prefixScore: number,
  partialScore: number
): number {

  let best = 0;

  for (const raw of candidates) {
    if (!raw) continue;
    const candidate = normalize(raw);
    if (!candidate) continue;

    if (candidate === query) {
      best = Math.max(best, exactScore);
    } else if (candidate.startsWith(query)) {
      best = Math.max(best, prefixScore);
    } else if (candidate.includes(query)) {
      best = Math.max(best, partialScore);
    }
  }

  return best;

}

const genreLabelById = new Map(genres.map(term => [term.id, term.label]));
const epochLabelById = new Map(epochs.map(term => [term.id, term.label]));
const movementLabelById = new Map(movements.map(term => [term.id, term.label]));
const themeLabelById = new Map(themes.map(term => [term.id, term.label]));

function metadataLabels(book: Book): string[] {

  const labels: string[] = [];

  for (const id of book.genreIds) {
    const label = genreLabelById.get(id);
    if (label) labels.push(label);
  }

  if (book.epochId) {
    const label = epochLabelById.get(book.epochId);
    if (label) labels.push(label);
  }

  if (book.movementId) {
    const label = movementLabelById.get(book.movementId);
    if (label) labels.push(label);
  }

  for (const id of book.themeIds) {
    const label = themeLabelById.get(id);
    if (label) labels.push(label);
  }

  return labels;

}

function scoreBook(book: Book, author: Author | undefined, query: string): number {

  let score = 0;

  // Title (canonical + original) — the only field allowed to reach
  // the top tier.
  score = Math.max(
    score,
    bestMatchScore(query, [book.title, book.originalTitle], SCORE_EXACT_TITLE, SCORE_PREFIX, SCORE_PARTIAL)
  );

  // Author's canonical name.
  if (author) {
    score = Math.max(
      score,
      bestMatchScore(query, [author.name], SCORE_EXACT_AUTHOR, SCORE_PREFIX, SCORE_PARTIAL)
    );
  }

  // Alternative titles and alternative author name spellings —
  // exact match here is one tier below an exact canonical match,
  // but prefix/partial matches share the normal tiers.
  score = Math.max(
    score,
    bestMatchScore(query, book.alternativeTitles, SCORE_EXACT_ALTERNATIVE, SCORE_PREFIX, SCORE_PARTIAL)
  );

  if (author) {
    score = Math.max(
      score,
      bestMatchScore(query, author.alternativeNames, SCORE_EXACT_ALTERNATIVE, SCORE_PREFIX, SCORE_PARTIAL)
    );
  }

  // Metadata (genre/epoch/movement/theme labels) — a coarse category
  // match, always low priority, never allowed to outrank a real
  // title/author match.
  score = Math.max(
    score,
    bestMatchScore(query, metadataLabels(book), SCORE_METADATA, SCORE_METADATA, SCORE_METADATA)
  );

  return score;

}

// Whether an author qualifies for their own "matched author" section
// — deliberately stricter than book-level scoring (exact or prefix
// only): a loose partial match on the author's name still helps rank
// their books via scoreBook() above, but should not be confident
// enough to announce "this is the author you're looking for".
function authorMatchScore(author: Author, query: string): number {
  return bestMatchScore(query, [author.name, ...author.alternativeNames], SCORE_EXACT_AUTHOR, SCORE_PREFIX, 0);
}

function matchesLanguage(book: Book, language: string): boolean {
  if (!language) return true;
  return book.originalLanguage === language || book.availableLanguages.includes(language);
}

export function searchCatalog(query: string, language: string = ""): SearchResult {

  const normalizedQuery = normalize(query);

  if (!normalizedQuery) {
    return { query, matchedAuthors: [], books: [] };
  }

  const authorById = new Map(getAuthors().map(author => [author.id, author]));

  const matchedAuthors = getAuthors().filter(author => authorMatchScore(author, normalizedQuery) >= SCORE_PREFIX);

  const ranked: RankedBook[] = [];

  for (const book of getBooks()) {

    if (!matchesLanguage(book, language)) continue;

    const author = authorById.get(book.authorId);
    const score = scoreBook(book, author, normalizedQuery);

    if (score > 0) {
      ranked.push({ book, score });
    }

  }

  ranked.sort((a, b) => b.score - a.score);

  return { query, matchedAuthors, books: ranked };

}
