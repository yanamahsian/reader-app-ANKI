// Shared types for the reader engine and the API layer that feeds it.
// Kept intentionally close to the shape omnia-library already returns,
// since the Edge Function contract is not changing in this phase.

export interface Book {
  id: string;
  // NOTES + HIGHLIGHTS PHASE: the catalog Work id, as distinct from
  // `id` above (the Edition id -- see toReaderBook.ts's own comment on
  // why Book.id became the Edition id). Optional and additive: every
  // existing caller that builds a Book directly (e.g. App.tsx's dev-only
  // TEST_EPUB_BOOK) simply omits it, which readerEngine.ts/ReaderView.tsx
  // treat as "no real Work behind this book" -- real annotation saving is
  // quietly unavailable for that one case (falls back to the pre-existing
  // guest Fragment mechanism), nothing else changes.
  workId?: string;
  title: string;
  author?: string;
  language?: string;
  year?: number | string;
  cover?: string;
  url: string;
  // Explicit format hint from the library API, when it provides one.
  // Falls back to detecting by book.url's file extension (see
  // formats/detect.ts) when absent — omnia-library's contract is not
  // being changed to require this field. "anki-json" (Phase 9) is
  // AN.KI's own normalized reader content — not a source format, so
  // it never gets detected by extension, only ever set explicitly.
  format?: "epub" | "plaintext" | "fb2" | "pdf" | "anki-json";
}

export interface Fragment {
  id: string;
  bookId: string;
  bookTitle: string;
  author: string;
  page: number;
  text: string;
  createdAt: number;
}

// A saved position in a book — Reader Complete. Deliberately simpler
// than Fragment (no text, no author): a bookmark just marks a place
// to jump back to. chapterTitle is denormalized at save time (same
// pattern as Book.author on catalog types) purely for display in the
// bookmarks list — it is never used to locate the page again, only
// pageIndex is.
export interface Bookmark {
  id: string;
  bookId: string;
  pageIndex: number;
  chapterTitle: string | null;
  createdAt: number;
}

export interface ReadingPosition {
  page: number;
}
