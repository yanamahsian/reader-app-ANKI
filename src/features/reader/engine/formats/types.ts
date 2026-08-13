import type { Book } from "../types";

export interface LoadedPage {
  html: string;
  rawText: string;
}

export interface LoadedChapter {
  // A known, real chapter title (e.g. from an EPUB's table of
  // contents). null means "no real chapter structure" — the reader
  // engine falls back to its plain-text heading heuristic per page
  // instead of trusting this value.
  title: string | null;
  pages: LoadedPage[];
}

export interface LoadedDocument {
  chapters: LoadedChapter[];
  // true only when chapters reflect the book's real structure (EPUB).
  // Plain text sets this to false so the reader shows overall book
  // progress instead of a fabricated "pages left in chapter" count.
  hasRealChapters: boolean;
}

export interface FormatLoader {
  canHandle(book: Book): boolean;
  load(book: Book): Promise<LoadedDocument>;
}
