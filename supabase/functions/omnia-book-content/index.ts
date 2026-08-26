import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// omnia-book-content — v11 (as deployed) had NO source anywhere in this
// repo; GitHub and production had already diverged before this phase
// touched anything. The exact live v11 source was pulled via the
// Supabase MCP (`get_edge_function`) and is reproduced verbatim below,
// with the RIGHTS/JURISDICTION HARDENING changes layered on top, so this
// file is once again the real, deployable source of what runs in
// production -- not a reconstruction, not an approximation.
//
// RIGHTS/JURISDICTION HARDENING PHASE -- THE CONFIRMED BUG:
// v11's isAccessAllowed() checked only `status === "public-domain" ||
// status === "open-license"` -- it read `jurisdiction` off every
// rights_assertions row (the select() explicitly listed the column) but
// never actually compared it to anything. Meanwhile Library eligibility
// (library_catalog_search.sql / library_language_facets.sql) and the
// frontend's own resolver (src/catalog/toReaderBook.ts's
// isAvailableInJurisdiction) both already require an EXACT match between
// a scoped public-domain assertion's jurisdiction and the visitor's own
// jurisdiction -- an edition whose only rights_assertions row is
// public-domain/DE is correctly hidden from a US visitor everywhere in
// the UI. But the UI has always worked by resolving an edition to this
// endpoint's URL and then simply GETting it -- so a direct, unauthenticated
// call to `omnia-book-content?editionId=<that DE-only edition>` served the
// file to literally anyone, regardless of jurisdiction, because this
// endpoint itself never looked at jurisdiction at all. That made this
// public, verify_jwt=false endpoint a complete bypass of the exact rights
// model the rest of the app enforces -- not a UI-only gap, a real one,
// since nothing stops a visitor (or a scraper) from calling this URL
// directly with any editionId it can discover.
//
// THE FIX -- jurisdiction is now a required request parameter, and
// access is gated by the SAME rule toReaderBook.ts's own
// isAvailableInJurisdiction already enforces client-side (see that
// function's own comment for the full reasoning this mirrors):
//   - a rights_assertions row only grants access when its own
//     `jurisdiction` column is non-null AND equals the requested
//     jurisdiction, exactly -- a row with jurisdiction=null is a "gap to
//     fill in later, not a claim of global validity" (verbatim from
//     types.ts's own RightsAssertion doc comment) and is NEVER, by
//     itself, sufficient here, matching toReaderBook.ts exactly.
//   - "public-domain somewhere -> readable everywhere" is exactly the
//     bypass being closed, so it is never accepted, no matter how many
//     other-jurisdiction rows an edition has.
//
// OPEN-LICENSE: v11 already accepted `status === "open-license"`
// alongside public-domain, but neither the live database (checked via a
// direct query -- see the written report) nor the frontend's own
// RightsStatus type (src/catalog/types.ts: only "public-domain" |
// "restricted" | "unknown") has ever actually used or modeled that
// status. There is no existing frontend rule to mirror for it. Per this
// phase's own instruction to prefer a conservative refusal over a
// invented global-permission rule when the existing model doesn't say
// enough: open-license is kept accepted (removing it outright would be
// an unrelated behavior change this phase wasn't asked to make) but is
// held to the EXACT SAME jurisdiction-match rule as public-domain, never
// a looser one -- so it can never become a new, wider bypass of its own.
// If a real open-license rights model is ever designed for this project
// (jurisdiction-independent by nature, in the general case), that is a
// deliberately separate, future decision -- not one improvised here.
//
// MISSING JURISDICTION -- NO SILENT DEFAULT, NO BACKWARDS-COMPATIBILITY
// EXCEPTION: a request with no `jurisdiction` parameter is rejected
// outright (400), before any rights lookup even happens. This is not a
// narrower version of the old behavior -- it is the only behavior
// consistent with the existing model: toReaderBook.ts's own resolver
// already treats an unknown visitor (jurisdiction: undefined) as never
// resolving a scoped assertion, and per this phase's explicit
// instruction, "missing jurisdiction -> US" or "missing jurisdiction ->
// DE" would just be a differently-shaped version of the exact bug being
// fixed. No currently-live edition's ONLY rights_assertions row is an
// unscoped (jurisdiction=null) one that this would need a compatibility
// carve-out for (checked directly against production); if one is ever
// added, it correctly stays unreadable through this endpoint until it
// carries a real, scoped assertion -- exactly like the frontend already
// treats it.
//
// URL PRODUCERS -- DELIBERATELY UNCHANGED (Option B): neither
// src/catalog/books.ts's static seed URL nor omnia-library-catalog's
// `${BOOK_CONTENT_ENDPOINT}?editionId=...` construction was changed to
// bake a jurisdiction into the URL at catalog-formation time. The
// visitor's jurisdiction is not known (or may change) at catalog-fetch
// time in a way that's meaningfully different from when Reader actually
// opens a book, and toReaderBook.ts -- the one existing choke point
// where a resolved edition becomes the final URL the reader fetches --
// already has the real, current reader jurisdiction in scope at exactly
// that moment (BookDetailView.tsx already reads it via
// useReaderJurisdiction()). toReaderBook.ts now appends
// `&jurisdiction=<value>` there instead, for exactly the editionId-only
// URLs this endpoint serves; see that file's own comment. Not the
// second, independent jurisdiction-state the instructions warn against:
// same value, same hook, one new place it's read.
//
// SECURITY: still verify_jwt=false, unchanged -- Reader's whole flow is
// through the public catalog, so this endpoint's own logic is the actual
// security boundary, not a JWT check. No service_role key reaches the
// browser; nothing here changes that.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey"
};

interface RightsAssertionRow {
  status: string;
  jurisdiction: string | null;
  license_uri: string | null;
}

// Mirrors src/catalog/toReaderBook.ts's isAvailableInJurisdiction exactly
// (see that function's own comment for the full reasoning): a row only
// grants access when its status is public-domain or open-license AND its
// jurisdiction is non-null AND equals the caller's requested
// jurisdiction. `jurisdiction` here is always a real, non-empty string --
// the caller (Deno.serve below) already rejected a missing/empty one
// before this is ever called, so there is no "unknown jurisdiction"
// branch to accidentally get right or wrong inside this function itself.
function isAccessAllowed(rows: RightsAssertionRow[], jurisdiction: string): boolean {
  return rows.some(r =>
    (r.status === "public-domain" || r.status === "open-license") &&
    r.jurisdiction !== null &&
    r.jurisdiction === jurisdiction
  );
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ ok: false, error: message }, null, 2), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

Deno.serve(async (req: Request) => {

  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonError("Method not allowed -- use GET with ?editionId=&jurisdiction=", 405);

  const url = new URL(req.url);
  const editionId = url.searchParams.get("editionId");
  if (!editionId) return jsonError("Missing editionId parameter", 400);

  // RIGHTS/JURISDICTION HARDENING: required, not optional -- see this
  // file's own header comment ("MISSING JURISDICTION") for why there is
  // no default and no backwards-compatibility exception. Checked, and
  // rejected on failure, BEFORE any database lookup at all -- an
  // unscoped request never gets far enough to leak even a "this edition
  // exists" 404-vs-403 distinction.
  const jurisdiction = (url.searchParams.get("jurisdiction") ?? "").trim();
  if (!jurisdiction) return jsonError("Missing required jurisdiction parameter", 400);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY in function environment", 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: edition, error: editionError } = await supabase
    .from("editions")
    .select("id,ingestion_status")
    .eq("id", editionId)
    .maybeSingle();
  if (editionError) {
    console.error(`omnia-book-content: editions query failed for ${editionId}`, editionError);
    return jsonError("Failed to look up edition", 500);
  }
  if (!edition) return jsonError("Edition not found", 404);
  if (edition.ingestion_status !== "ready") {
    return jsonError(`Edition is not ready (status: ${edition.ingestion_status})`, 403);
  }

  const { data: bookFile, error: bookFileError } = await supabase
    .from("book_files")
    .select("id,storage_path,ingestion_status")
    .eq("edition_id", editionId)
    .eq("kind", "normalized")
    .eq("format", "anki-json")
    .eq("ingestion_status", "ready")
    .maybeSingle();
  if (bookFileError) {
    console.error(`omnia-book-content: book_files query failed for ${editionId}`, bookFileError);
    return jsonError("Failed to look up normalized content file", 500);
  }
  if (!bookFile) return jsonError("No ready normalized (anki-json) file for this edition", 404);

  const { data: rightsAssertions, error: rightsError } = await supabase
    .from("rights_assertions")
    .select("status,jurisdiction,license_uri")
    .eq("edition_id", editionId);
  if (rightsError) {
    console.error(`omnia-book-content: rights_assertions query failed for ${editionId}`, rightsError);
    return jsonError("Failed to look up rights for this edition", 500);
  }
  if (!isAccessAllowed((rightsAssertions ?? []) as RightsAssertionRow[], jurisdiction)) {
    return jsonError(`This edition's rights do not permit reading it in jurisdiction "${jurisdiction}"`, 403);
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from("book-files")
    .download(bookFile.storage_path);
  if (downloadError || !fileBlob) {
    console.error(`omnia-book-content: storage download failed for ${bookFile.storage_path}`, downloadError);
    return jsonError("Failed to read normalized content from storage", 500);
  }

  return new Response(fileBlob, { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

});
