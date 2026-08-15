import type { Book, Author } from "./types";
import { setRemoteCatalog } from "./catalogStore";

const CATALOG_ENDPOINT = "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-catalog";

interface RemoteCatalogResponse {
  books: Book[];
  authors: Author[];
}

function isRemoteCatalogResponse(data: unknown): data is RemoteCatalogResponse {
  if (typeof data !== "object" || data === null) return false;
  const candidate = data as Partial<RemoteCatalogResponse>;
  return Array.isArray(candidate.books) && Array.isArray(candidate.authors);
}

// Called once, at app startup (see App.tsx). Deliberately does not
// throw and does not block rendering: the app already works against
// the static seed catalog (catalogStore.ts) the instant it starts, so
// a slow or failed Supabase request degrades gracefully to that
// instead of blanking the app.
export async function loadRemoteCatalog(): Promise<void> {

  try {

    const response = await fetch(CATALOG_ENDPOINT);

    if (!response.ok) {
      throw new Error(`omnia-catalog request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!isRemoteCatalogResponse(data)) {
      throw new Error("omnia-catalog returned an unexpected shape");
    }

    setRemoteCatalog(data.books, data.authors);

  } catch (error) {
    console.warn("Falling back to the static seed catalog — could not load the Supabase catalog.", error);
  }

}
