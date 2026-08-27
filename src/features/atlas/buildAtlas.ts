import type { Book } from "../../catalog";
import { collections, countries, centuries, epochs, genres, movements, themes } from "../../catalog";

export type AtlasReasonKind =
  | "author"
  | "theme"
  | "movement"
  | "epoch"
  | "collection"
  | "genre"
  | "country"
  | "century"
  | "time";

export interface AtlasReason {
  kind: AtlasReasonKind;
  label: string;
  weight: number;
}

export interface AtlasConnection {
  id: string;
  left: Book;
  right: Book;
  score: number;
  strength: "strong" | "medium";
  reasons: AtlasReason[];
}

const countryLabels = new Map(countries.map(term => [term.id, term.label]));
const centuryLabels = new Map(centuries.map(term => [term.id, term.label]));
const epochLabels = new Map(epochs.map(term => [term.id, term.label]));
const movementLabels = new Map(movements.map(term => [term.id, term.label]));
const genreLabels = new Map(genres.map(term => [term.id, term.label]));
const themeLabels = new Map(themes.map(term => [term.id, term.label]));
const collectionLabels = new Map(collections.map(item => [item.id, item.title]));

function shared(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter(value => rightSet.has(value));
}

function labels(ids: string[], dictionary: Map<string, string>): string {
  return ids.map(id => dictionary.get(id) ?? id).join(", ");
}

function addReason(reasons: AtlasReason[], kind: AtlasReasonKind, label: string, weight: number): void {
  reasons.push({ kind, label, weight });
}

export function scoreAtlasPair(left: Book, right: Book): AtlasConnection | null {
  if (left.id === right.id) return null;

  const reasons: AtlasReason[] = [];

  if (left.authorId === right.authorId) {
    addReason(reasons, "author", `Один автор: ${left.authorName}`, 8);
  }

  const sharedThemes = shared(left.themeIds, right.themeIds);
  if (sharedThemes.length) {
    addReason(
      reasons,
      "theme",
      `Общие темы: ${labels(sharedThemes, themeLabels)}`,
      5 + Math.max(0, sharedThemes.length - 1) * 2
    );
  }

  if (left.movementId && left.movementId === right.movementId) {
    addReason(reasons, "movement", `Одно направление: ${movementLabels.get(left.movementId) ?? left.movementId}`, 4);
  }

  if (left.epochId && left.epochId === right.epochId) {
    addReason(reasons, "epoch", `Одна эпоха: ${epochLabels.get(left.epochId) ?? left.epochId}`, 3);
  }

  const sharedCollections = shared(left.collectionIds, right.collectionIds);
  if (sharedCollections.length) {
    addReason(
      reasons,
      "collection",
      `Вместе в подборках: ${labels(sharedCollections, collectionLabels)}`,
      3 + Math.max(0, sharedCollections.length - 1) * 2
    );
  }

  const sharedGenres = shared(left.genreIds, right.genreIds);
  if (sharedGenres.length) {
    addReason(reasons, "genre", `Общий жанр: ${labels(sharedGenres, genreLabels)}`, 2 + Math.max(0, sharedGenres.length - 1));
  }

  if (left.countryId && left.countryId === right.countryId) {
    addReason(reasons, "country", `Одна литературная традиция: ${countryLabels.get(left.countryId) ?? left.countryId}`, 2);
  }

  if (left.centuryId && left.centuryId === right.centuryId) {
    addReason(reasons, "century", `Один период: ${centuryLabels.get(left.centuryId) ?? left.centuryId}`, 1);
  }

  if (left.publicationYear && right.publicationYear) {
    const distance = Math.abs(left.publicationYear - right.publicationYear);
    if (distance <= 15) {
      addReason(reasons, "time", `Опубликованы с разницей ${distance} ${distance === 1 ? "год" : "лет"}`, 1);
    }
  }

  const score = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  if (score < 4) return null;

  const [firstId, secondId] = [left.id, right.id].sort();
  return {
    id: `${firstId}::${secondId}`,
    left,
    right,
    score,
    strength: score >= 8 ? "strong" : "medium",
    reasons: reasons.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))
  };
}

export function buildAtlasConnections(books: Book[], limit = 36): AtlasConnection[] {
  const uniqueBooks = Array.from(new Map(books.map(book => [book.id, book])).values());
  const connections: AtlasConnection[] = [];

  for (let leftIndex = 0; leftIndex < uniqueBooks.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < uniqueBooks.length; rightIndex += 1) {
      const connection = scoreAtlasPair(uniqueBooks[leftIndex], uniqueBooks[rightIndex]);
      if (connection) connections.push(connection);
    }
  }

  return connections
    .sort((a, b) => b.score - a.score || a.left.title.localeCompare(b.left.title) || a.right.title.localeCompare(b.right.title))
    .slice(0, limit);
}
