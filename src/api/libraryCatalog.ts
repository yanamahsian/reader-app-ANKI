import type { Book, Author } from "../catalog/types";
import { getValidAccessToken } from "../auth/supabaseAuth";

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

// FREE / LIBRARY CATALOG BOUNDARY v1 -- CORRECTION: omnia-library-catalog's
// default (q/language/pagination) path now resolves the caller's plan
// from an optional Authorization header. Signed-out visitors omit it;
// signed-in visitors send their own current access token. `apikey` stays
// present independently on every request.
async function buildCatalogRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
  const accessToken = await getValidAccessToken();
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return headers;
}

export interface LibraryCatalogParams {
  query?: string;
  language?: string;
  jurisdiction?: string;
  // Internationalization v1, part 2: a RANKING signal, never a filter --
  // see supabase/sql/library_catalog_preferred_language_ranking_v1.sql's
  // own comment. Works with a qualifying edition in one of these
  // languages sort first in the server's response; every other Work
  // stays in the result set. `language` above is unaffected and remains
  // the only hard filter -- passing both is meaningful (though the boost
  // is moot once every result already matches an explicit `language`
  // filter) and passing this alone with no `language` set is the normal
  // "unfiltered browse, but my languages first" case.
  preferredLanguages?: string[];
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

// Server-driven-facets phase: one entry per language that currently has
// at least one genuinely qualifying (ready + reader-format + public-domain,
// jurisdiction-matched) Edition -- see supabase/sql/library_language_facets.sql
// for the exact eligibility rule, which is deliberately the SAME rule
// LibraryCatalogPage.books' own editions were already filtered by, not a
// looser or separate one. `count` is a Work count, not an Edition count.
export interface LanguageFacet {
  code: string;
  count: number;
}

export interface LibraryCatalogPage {
  books: Book[];
  authors: Author[];
  total: number;
  hasMore: boolean;
  // Optional (not required) so a response from a not-yet-redeployed
  // Edge Function, or any other legacy caller of this type, still
  // satisfies the shape -- callers should treat a missing/empty facets
  // as "not known yet", never as "no languages exist".
  facets?: { languages: LanguageFacet[] };
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

// Best-effort extraction of the facets.languages array out of a raw
// LibraryCatalogPage -- tolerant of an absent/malformed `facets` field
// (older cached response, a network edge case) rather than throwing;
// callers already treat an empty array as "not known yet", per
// LibraryCatalogPage.facets' own doc comment above.
export function extractLanguageFacets(page: LibraryCatalogPage): LanguageFacet[] {
  const languages = page.facets?.languages;
  if (!Array.isArray(languages)) return [];
  return languages.filter(
    (item): item is LanguageFacet =>
      typeof item === "object" && item !== null &&
      typeof (item as LanguageFacet).code === "string" &&
      typeof (item as LanguageFacet).count === "number"
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
  if (params.jurisdiction) url.searchParams.set("jurisdiction", params.jurisdiction);
  if (params.preferredLanguages && params.preferredLanguages.length > 0) {
    url.searchParams.set("preferredLanguages", params.preferredLanguages.join(","));
  }
  url.searchParams.set("limit", String(params.limit ?? 24));
  url.searchParams.set("offset", String(params.offset ?? 0));

  const response = await fetch(url.toString(), {
    headers: await buildCatalogRequestHeaders(),
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

// Single shared way to ask "which languages currently have real,
// readable content" -- used by both LibraryView's own filter dropdown
// and SearchPanel's, per the server-driven-facets contract: the backend
// decides which languages exist, the frontend only decides how to label
// them (see src/catalog/languages.ts's getLanguageLabel). Deliberately
// reuses fetchLibraryCatalogPage itself rather than a second endpoint or
// a parallel fetch mechanism -- facets are just a field on the same
// response every Library/Search request already receives, so priming
// them (e.g. before a visitor has typed anything) is just this same call
// with limit=1 and the books/authors themselves discarded.
//
// Never passes `language` -- see omnia-library-catalog/index.ts's own
// comment on why facets must be computed independently of the active
// language filter (test case F: picking a language must not make the
// other languages disappear from the list).
export async function fetchLanguageFacets(
  params: { query?: string; jurisdiction?: string; signal?: AbortSignal } = {}
): Promise<LanguageFacet[]> {
  const page = await fetchLibraryCatalogPage({
    query: params.query,
    jurisdiction: params.jurisdiction,
    limit: 1,
    offset: 0,
    signal: params.signal
  });
  return extractLanguageFacets(page);
}
