import type { Book, Author } from "../catalog/types";

// omnia-library-catalog (see supabase/functions/omnia-library-catalog/
// index.ts) — AN.KI's OWN internal catalog (public.works/authors/
// editions/book_files/rights_assertions), paginated and searchable. This
// is a different function from omnia-catalog (small, fixed, legacy) and
// from omnia-library (external Gutendex/Wikisource aggregator, see
// api/library.ts) — neither of those reads these tables.
const CATALOG_ENDPOINT =
  "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-library-catalog";

// Same requirement as every other Edge Function call in this app (see
// catalog/remoteCatalog.ts's own comment): Supabase's gateway requires a
// valid `apikey` header on every call, sent only on `apikey`, never as
// `Authorization: Bearer`. Public-safe publishable key, never
// service_role.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X2hZ6bXgj5HHSSZQPiXYsw_mhF5NHpy";

export interface LibraryCatalogParams {
  query?: string;
  language?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

export interface LibraryCatalogPage {
  books: Book[];
  authors: Author[];
  total: number;
  hasMore: boolean;
}

function isLibraryCatalogPage(data: unknown): data is LibraryCatalogPage {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as Partial<LibraryCatalogPage>;
  return (
    Array.isArray(candidate.books) &&
    Array.isArray(candidate.authors) &&
    typeof candidate.total === "number" &&
    typeof candidate.hasMore === "boolean"
  );
}

// Fetches one real, server-paginated page of AN.KI's internal catalog.
// Every call is a genuine network round trip -- there is no client-side
// slicing of a larger in-memory response anywhere in this function; the
// Edge Function itself only returns the rows for this exact
// offset/limit window (see its own SQL .range() call).
export async function fetchLibraryCatalogPage(params: LibraryCatalogParams): Promise<LibraryCatalogPage> {

  const url = new URL(CATALOG_ENDPOINT);
  if (params.query) url.searchParams.set("q", params.query);
  if (params.language) url.searchParams.set("language", params.language);
  url.searchParams.set("limit", String(params.limit ?? 24));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const response = await fetch(url.toString(), {
    headers: {
      "apikey": SUPABASE_PUBLISHABLE_KEY
    },
    signal: params.signal
  });

  if (!response.ok) {
    throw new Error(`omnia-library-catalog request failed: ${response.status}`);
  }

  const data = await response.json();

  if (!isLibraryCatalogPage(data)) {
    throw new Error("omnia-library-catalog returned an unexpected shape");
  }

  return data;

}
