// Dynamic The Canon catalog endpoint.
// Canon is derived from AN.KI's live, readable public-domain catalog by
// ORIGINAL language/tradition. It never reads the old hand-authored
// canon_path_works pilot, so every eligible work in a tradition participates
// automatically and new catalog additions appear without editing a route.

// @ts-ignore -- resolved through deno.json import map.
import { createClient } from "supabase";

const BOOK_CONTENT_ENDPOINT =
  "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-book-content";
const MAX_LIMIT = 100;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

function serverErrorResponse(): Response {
  return jsonResponse({ error: "omnia-canon-catalog request failed" }, 500);
}

function buildBook(row: any, editions: any[], authorNameById: Map<string, string>): any {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.original_title ?? null,
    alternativeTitles: row.alternative_titles ?? [],
    authorId: row.author_id ?? "",
    authorName: authorNameById.get(row.author_id) ?? "",
    originalLanguage: row.original_language ?? "",
    availableLanguages: row.available_languages ?? [],
    publicationYear: row.publication_year ?? null,
    countryId: row.country_id ?? null,
    centuryId: row.century_id ?? null,
    epochId: row.epoch_id ?? null,
    movementId: row.movement_id ?? null,
    genreIds: row.genre_ids ?? [],
    themeIds: row.theme_ids ?? [],
    description: row.description ?? "",
    cover: row.cover ?? null,
    editions,
    collectionIds: row.collection_ids ?? []
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return serverErrorResponse();

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(req.url);
  const jurisdiction = (url.searchParams.get("jurisdiction") ?? "").trim();
  const originalLanguage = (url.searchParams.get("originalLanguage") ?? "").trim();

  try {
    if (!originalLanguage) {
      const { data, error } = await supabase.rpc("canon_catalog_sections", {
        p_jurisdiction: jurisdiction || null
      });
      if (error) throw error;

      const sections = (data ?? []).map((row: any) => ({
        code: row.original_language,
        count: Number(row.work_count)
      }));
      return jsonResponse({ sections });
    }

    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number(url.searchParams.get("limit") ?? String(MAX_LIMIT)) || MAX_LIMIT)
    );

    const { data: routeRows, error: routeError } = await supabase.rpc("canon_catalog_search", {
      p_original_language: originalLanguage,
      p_limit: limit,
      p_offset: offset,
      p_jurisdiction: jurisdiction || null
    });
    if (routeError) throw routeError;

    const rows = (routeRows ?? []) as Array<{ work_id: string; total_count: number | string }>;
    const workIds = rows.map(row => row.work_id);
    const total = rows.length ? Number(rows[0].total_count) : 0;

    if (!workIds.length) {
      return jsonResponse({ books: [], total, hasMore: false });
    }

    const { data: workRows, error: worksError } = await supabase
      .from("works")
      .select("id,title,original_title,alternative_titles,author_id,original_language,available_languages,publication_year,country_id,century_id,epoch_id,movement_id,genre_ids,theme_ids,description,cover,collection_ids")
      .in("id", workIds);
    if (worksError) throw worksError;

    const worksById = new Map((workRows ?? []).map((row: any) => [String(row.id), row]));
    const orderedWorks = workIds.map(id => worksById.get(id)).filter(Boolean) as any[];
    const authorIds = Array.from(new Set(orderedWorks.map(row => row.author_id).filter(Boolean)));

    const { data: authorRows, error: authorsError } = authorIds.length
      ? await supabase.from("authors").select("id,name").in("id", authorIds)
      : { data: [] as any[], error: null };
    if (authorsError) throw authorsError;
    const authorNameById = new Map((authorRows ?? []).map((row: any) => [row.id, row.name as string]));

    const { data: editionRows, error: editionsError } = await supabase
      .from("editions")
      .select("id,work_id,language,is_original,translator_name,source_id,external_id,ingestion_status")
      .in("work_id", workIds)
      .eq("ingestion_status", "ready");
    if (editionsError) throw editionsError;

    const editions = (editionRows ?? []) as any[];
    const editionIds = editions.map(row => row.id);

    const { data: fileRows, error: filesError } = editionIds.length
      ? await supabase
          .from("book_files")
          .select("edition_id,format,kind,ingestion_status")
          .in("edition_id", editionIds)
          .eq("kind", "normalized")
          .eq("format", "anki-json")
          .eq("ingestion_status", "ready")
      : { data: [] as any[], error: null };
    if (filesError) throw filesError;

    let rightsQuery = editionIds.length
      ? supabase
          .from("rights_assertions")
          .select("edition_id,status,jurisdiction")
          .in("edition_id", editionIds)
          .eq("status", "public-domain")
      : null;
    if (rightsQuery && jurisdiction) rightsQuery = rightsQuery.eq("jurisdiction", jurisdiction);
    const rightsResult = rightsQuery ? await rightsQuery : { data: [] as any[], error: null };
    if (rightsResult.error) throw rightsResult.error;

    const readyEditionIds = new Set((fileRows ?? []).map((row: any) => row.edition_id));
    const rightsByEdition = new Map<string, any[]>();
    for (const assertion of rightsResult.data ?? []) {
      const current = rightsByEdition.get(assertion.edition_id) ?? [];
      current.push({ status: assertion.status, jurisdiction: assertion.jurisdiction ?? null });
      rightsByEdition.set(assertion.edition_id, current);
    }

    const editionsByWork = new Map<string, any[]>();
    for (const edition of editions) {
      const rights = rightsByEdition.get(edition.id) ?? [];
      if (!readyEditionIds.has(edition.id) || rights.length === 0) continue;
      const current = editionsByWork.get(String(edition.work_id)) ?? [];
      current.push({
        id: edition.id,
        language: edition.language,
        isOriginal: Boolean(edition.is_original),
        translatorName: edition.translator_name ?? null,
        rights,
        sourceId: edition.source_id || "anki-catalog",
        externalIds: edition.source_id && edition.external_id
          ? { [edition.source_id]: edition.external_id }
          : {},
        files: [{
          format: "anki-json",
          url: `${BOOK_CONTENT_ENDPOINT}?editionId=${encodeURIComponent(edition.id)}`
        }]
      });
      editionsByWork.set(String(edition.work_id), current);
    }

    const books = orderedWorks.map(row =>
      buildBook(row, editionsByWork.get(String(row.id)) ?? [], authorNameById)
    );

    return jsonResponse({
      books,
      total,
      hasMore: offset + books.length < total
    });
  } catch (error) {
    console.error("omnia-canon-catalog failed:", error);
    return serverErrorResponse();
  }
});
