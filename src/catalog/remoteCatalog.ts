import type { Book, Author } from "./types";
import { setRemoteCatalog } from "./catalogStore";

const CATALOG_ENDPOINT = "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-catalog";

// Supabase's gateway requires a valid `apikey` header on every Edge
// Function call, independent of the (already-disabled) "Verify JWT
// with legacy secret" setting. This is the public-safe "publishable
// key" -- never service_role. Per Supabase's own current docs,
// publishable/secret keys are NOT JWTs and must be sent ONLY on the
// `apikey` header -- never as `Authorization: Bearer`, which the
// platform tries to parse as a JWT and rejects.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X2hZ6bXgj5HHSSZQPiXYsw_mhF5NHpy";

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

    const response = await fetch(CATALOG_ENDPOINT, {
      headers: {
        "apikey": SUPABASE_PUBLISHABLE_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`omnia-catalog request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!isRemoteCatalogResponse(data)) {
      throw new Error("omnia-catalog returned an unexpected shape");
    }

    setRemoteCatalog(data.books, data.authors);

  } catch (error) {
    // Deliberately no user-visible error -- the app still works
    // against the static seed catalog. But this failure mode has a
    // real, silent consequence worth being loud about in the
    // console: any Work that exists only in Postgres (created via
    // Stage 2/omnia-resolve-work, not in the static books.ts/
    // authors.ts files) will not appear anywhere in search until this
    // succeeds -- console.error (not warn) so it isn't filtered out
    // by a default "warnings hidden" devtools log level, with the
    // practical consequence spelled out, not just the raw error.
    console.error(
      "omnia-catalog failed to load -- falling back to the static seed catalog. " +
      "Any Work that only exists in Postgres (created via Stage 2, not in books.ts/authors.ts) " +
      "will be invisible to search until this is fixed. Real cause:",
      error
    );
  }

}
