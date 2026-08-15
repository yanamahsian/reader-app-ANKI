// Shared types for the reader engine and the API layer that feeds it.
// Kept intentionally close to the shape omnia-library already returns,
// since the Edge Function contract is not changing in this phase.

export interface Book {
  id: string;
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

export interface ReadingPosition {
  page: number;
}
