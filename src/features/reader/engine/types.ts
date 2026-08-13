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
