// THE CANON v2 -- dynamic catalog-backed data layer.
//
// The old Canon pilot read one hand-authored Collection / Path / nine-work
// sequence. v2 deliberately does not read those tables at all. The Canon is
// now derived from AN.KI's live readable catalog by a Work's ORIGINAL
// language (literary tradition), not by the language of an available
// translation. That distinction is essential: a Russian translation of
// Kafka belongs in Library's Russian-language filter, but Kafka must never
// become "Russian literature" in The Canon.
//
// Route order is produced server-side by canon_catalog_search:
// publication year -> author -> title -> id. Pagination therefore preserves
// one deterministic route across every eligible Work in the tradition;
// adding another catalog-ready Work automatically inserts it into the route
// without editing Canon content by hand.

import type { Book } from "../catalog/types";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  getValidAccessToken
} from "../auth/supabaseAuth";

const CANON_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-canon-catalog`;

export interface CanonSectionSummary {
  code: string;
  count: number;
}

export interface CanonPage {
  books: Book[];
  total: number;
  hasMore: boolean;
}

async function buildHeaders(): Promise<Record<string, string>> {
  const accessToken = await getValidAccessToken();
  if (!accessToken) throw new Error("Canon requires an authenticated session");

  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`
  };
}

async function canonFetch<T>(url: URL, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url.toString(), {
    headers: await buildHeaders(),
    signal
  });

  if (!response.ok) {
    throw new Error(`omnia-canon-catalog request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchCanonSections(params: {
  jurisdiction?: string;
  signal?: AbortSignal;
} = {}): Promise<CanonSectionSummary[]> {
  const url = new URL(CANON_ENDPOINT);
  if (params.jurisdiction) url.searchParams.set("jurisdiction", params.jurisdiction);

  const data = await canonFetch<{ sections?: unknown }>(url, params.signal);
  if (!Array.isArray(data.sections)) throw new Error("Canon sections returned an unexpected shape");

  return data.sections.filter((entry): entry is CanonSectionSummary => {
    if (typeof entry !== "object" || entry === null) return false;
    const candidate = entry as Partial<CanonSectionSummary>;
    return typeof candidate.code === "string" && typeof candidate.count === "number";
  });
}

export async function fetchCanonPage(params: {
  originalLanguage: string;
  jurisdiction?: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}): Promise<CanonPage> {
  const url = new URL(CANON_ENDPOINT);
  url.searchParams.set("originalLanguage", params.originalLanguage);
  url.searchParams.set("limit", String(params.limit ?? 100));
  url.searchParams.set("offset", String(params.offset ?? 0));
  if (params.jurisdiction) url.searchParams.set("jurisdiction", params.jurisdiction);

  const data = await canonFetch<Partial<CanonPage>>(url, params.signal);
  if (
    !Array.isArray(data.books) ||
    typeof data.total !== "number" ||
    typeof data.hasMore !== "boolean"
  ) {
    throw new Error("Canon page returned an unexpected shape");
  }

  return {
    books: data.books as Book[],
    total: data.total,
    hasMore: data.hasMore
  };
}
