import type { Book } from "../features/reader/engine/types";

const LIBRARY_ENDPOINT =
  "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-library";

export interface SearchBooksParams {
  query: string;
  language?: string;
  signal?: AbortSignal;
}

// Wraps the existing omnia-library Edge Function as-is. The function's
// own contract is unchanged in phase 2 — this only adds types on the
// client side.
export async function searchBooks(params: SearchBooksParams): Promise<Book[]> {

  const response = await fetch(LIBRARY_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: params.query,
      language: params.language || ""
    }),
    signal: params.signal
  });

  if (!response.ok) {
    throw new Error("Library request failed");
  }

  const data = (await response.json()) as unknown;

  if (!Array.isArray(data)) {
    throw new Error("Unexpected library response shape");
  }

  return data as Book[];

}
