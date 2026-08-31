const WORKS_COLUMNS = `
  id, title, original_title, alternative_titles, author_id, original_language,
  available_languages, publication_year, country_id, century_id, epoch_id,
  movement_id, genre_ids, theme_ids, description, cover, collection_ids
`;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;
const BOOK_CONTENT_ENDPOINT =
  "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-book-content";
const FORMAT_PRIORITY = ["anki-json", "epub", "plaintext"];
const MAX_WORK_IDS = 200;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const PAID_PLANS = new Set(["library", "atlas", "academy"]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
}

function serverErrorResponse(): Response {
  return jsonResponse({ error: "omnia-library-catalog request failed" }, 500);
}

// @ts-ignore -- resolved through deno.json import map.
import { createClient } from "supabase";

function buildQualifyingEditions(
  candidateEditions: any[],
  filesByEdition: Map<string, any[]>,
  rightsByEdition: Map<string, any[]>
): any[] {
  return candidateEditions
    .map((edition: any) => {
      const readyFormats = new Set(
        (filesByEdition.get(edition.id) ?? []).map((file: any) => file.format as string)
      );
      const editionRights = rightsByEdition.get(edition.id) ?? [];
      if (editionRights.length === 0) return null;

      const bestFormat = FORMAT_PRIORITY.find(format => readyFormats.has(format));
      if (!bestFormat) return null;

      const hasSourceId = typeof edition.source_id === "string" && edition.source_id.trim().length > 0;
      const sourceId = hasSourceId ? edition.source_id : "anki-catalog";
      const externalIds = hasSourceId && edition.external_id
        ? { [edition.source_id]: edition.external_id as string }
        : {};

      return {
        id: edition.id,
        language: edition.language,
        isOriginal: Boolean(edition.is_original),
        translatorName: edition.translator_name ?? null,
        rights: editionRights.map((assertion: any) => ({
          status: assertion.status,
          jurisdiction: assertion.jurisdiction ?? null
        })),
        sourceId,
        externalIds,
        files: [{
          format: bestFormat,
          url: `${BOOK_CONTENT_ENDPOINT}?editionId=${encodeURIComponent(edition.id)}`
        }]
      };
    })
    .filter((edition): edition is NonNullable<typeof edition> => edition !== null);
}

function buildBookFromWork(row: any, qualifyingEditions: any[], authorNameById: Map<string, string>): any {
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
    editions: qualifyingEditions,
    collectionIds: row.collection_ids ?? []
  };
}

async function resolveEffectivePlan(supabase: any, req: Request): Promise<{ plan: string } | { errorResponse: Response }> {
  if (!req.headers.has("Authorization")) return { plan: "free" };

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { errorResponse: jsonResponse({ error: "Invalid or expired session", code: "unauthorized" }, 401) };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return { errorResponse: jsonResponse({ error: "Invalid or expired session", code: "unauthorized" }, 401) };
  }

  const { data: planData, error: planError } = await supabase.rpc("effective_plan_for_user", {
    p_user_id: userData.user.id
  });
  if (planError) {
    console.error(`omnia-library-catalog: effective_plan_for_user failed for user ${userData.user.id}`, planError);
    return { errorResponse: serverErrorResponse() };
  }

  return { plan: typeof planData === "string" && planData ? planData : "free" };
}

async function handleWorkIdsLookup(supabase: any, req: Request, workIdsParam: string): Promise<Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return jsonResponse({ error: "Missing Authorization bearer token" }, 401);

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return jsonResponse({ error: "Invalid or expired session" }, 401);

  const workIds = Array.from(new Set(
    workIdsParam.split(",").map(id => id.trim()).filter(Boolean)
  )).slice(0, MAX_WORK_IDS);

  if (workIds.length === 0) return jsonResponse({ books: [], authors: [] });

  const { data: workRows, error: worksError } = await supabase
    .from("works")
    .select(WORKS_COLUMNS)
    .in("id", workIds);
  if (worksError) throw worksError;
  const works = (workRows ?? []) as any[];

  const authorIds = Array.from(new Set(works.map(w => w.author_id).filter(Boolean)));
  const { data: authorRows, error: authorsError } = authorIds.length
    ? await supabase
        .from("authors")
        .select("id, name, alternative_names, birth_year, death_year")
        .in("id", authorIds)
    : { data: [] as any[], error: null };
  if (authorsError) throw authorsError;

  const { data: editionRows, error: editionsError } = await supabase
    .from("editions")
    .select("id, work_id, language, is_original, translator_name, source_id, external_id, ingestion_status")
    .in("work_id", workIds)
    .eq("ingestion_status", "ready");
  if (editionsError) throw editionsError;

  const editions = (editionRows ?? []) as any[];
  const editionIds = editions.map(e => e.id);

  const { data: fileRows, error: filesError } = editionIds.length
    ? await supabase
        .from("book_files")
        .select("id, edition_id, format, kind, ingestion_status")
        .in("edition_id", editionIds)
        .eq("kind", "normalized")
        .eq("format", "anki-json")
        .eq("ingestion_status", "ready")
    : { data: [] as any[], error: null };
  if (filesError) throw filesError;

  const { data: rightsRows, error: rightsError } = editionIds.length
    ? await supabase
        .from("rights_assertions")
        .select("id, edition_id, status, jurisdiction")
        .in("edition_id", editionIds)
        .eq("status", "public-domain")
    : { data: [] as any[], error: null };
  if (rightsError) throw rightsError;

  const files = (fileRows ?? []) as any[];
  const rights = (rightsRows ?? []) as any[];

  const filesByEdition = new Map<string, any[]>();
  for (const file of files) {
    const list = filesByEdition.get(file.edition_id) ?? [];
    list.push(file);
    filesByEdition.set(file.edition_id, list);
  }

  const rightsByEdition = new Map<string, any[]>();
  for (const assertion of rights) {
    const list = rightsByEdition.get(assertion.edition_id) ?? [];
    list.push(assertion);
    rightsByEdition.set(assertion.edition_id, list);
  }

  const editionsByWork = new Map<string, any[]>();
  for (const edition of editions) {
    const list = editionsByWork.get(edition.work_id) ?? [];
    list.push(edition);
    editionsByWork.set(edition.work_id, list);
  }

  const authorNameById = new Map((authorRows ?? []).map((a: any) => [a.id, a.name as string]));

  const books = works.map((row: any) => {
    const candidateEditions = editionsByWork.get(row.id) ?? [];
    const qualifyingEditions = buildQualifyingEditions(candidateEditions, filesByEdition, rightsByEdition);
    return buildBookFromWork(row, qualifyingEditions, authorNameById);
  });

  const authors = (authorRows ?? []).map((a: any) => ({
    id: a.id,
    name: a.name,
    alternativeNames: a.alternative_names ?? [],
    birthYear: a.birth_year ?? null,
    deathYear: a.death_year ?? null
  }));

  return jsonResponse({ books, authors });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed -- use GET" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("omnia-library-catalog misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
    return serverErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(req.url);

  const workIdsParam = (url.searchParams.get("workIds") ?? "").trim();
  if (workIdsParam) {
    try {
      return await handleWorkIdsLookup(supabase, req, workIdsParam);
    } catch (error) {
      console.error("omnia-library-catalog workIds lookup failed:", error);
      return serverErrorResponse();
    }
  }

  const rawQuery = (url.searchParams.get("q") ?? "").trim();
  const language = (url.searchParams.get("language") ?? "").trim();
  const jurisdiction = (url.searchParams.get("jurisdiction") ?? "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT)
  );
  const searchQuery = rawQuery.length >= 2 ? rawQuery : null;

  const planResult = await resolveEffectivePlan(supabase, req);
  if ("errorResponse" in planResult) return planResult.errorResponse;
  const freeOnly = !PAID_PLANS.has(planResult.plan);

  try {
    const [searchResult, facetsResult] = await Promise.all([
      supabase.rpc("library_catalog_search", {
        p_query: searchQuery,
        p_language: language || null,
        p_limit: limit,
        p_offset: offset,
        p_jurisdiction: jurisdiction || null,
        p_free_only: freeOnly
      }),
      supabase.rpc("library_language_facets", {
        p_query: searchQuery,
        p_jurisdiction: jurisdiction || null,
        p_free_only: freeOnly
      })
    ]);

    if (searchResult.error) throw searchResult.error;
    if (facetsResult.error) throw facetsResult.error;

    const facetRows = (facetsResult.data ?? []) as Array<{ language: string; work_count: number | string }>;
    const facets = {
      languages: facetRows.map(row => ({ code: row.language, count: Number(row.work_count) }))
    };

    const rows = (searchResult.data ?? []) as Array<{ work_id: string; total_count: number | string }>;
    const workIds = rows.map(row => row.work_id);
    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    if (workIds.length === 0) {
      return jsonResponse({ books: [], authors: [], total, hasMore: false, facets });
    }

    const { data: workRows, error: worksError } = await supabase
      .from("works")
      .select(WORKS_COLUMNS)
      .in("id", workIds);
    if (worksError) throw worksError;
    const works = (workRows ?? []) as any[];

    const authorIds = Array.from(new Set(works.map(w => w.author_id).filter(Boolean)));
    const { data: authorRows, error: authorsError } = authorIds.length
      ? await supabase
          .from("authors")
          .select("id, name, alternative_names, birth_year, death_year")
          .in("id", authorIds)
      : { data: [] as any[], error: null };
    if (authorsError) throw authorsError;

    const { data: editionRows, error: editionsError } = await supabase
      .from("editions")
      .select("id, work_id, language, is_original, translator_name, source_id, external_id")
      .in("work_id", workIds)
      .eq("ingestion_status", "ready");
    if (editionsError) throw editionsError;

    const editions = (editionRows ?? []) as any[];
    const editionIds = editions.map(e => e.id);

    const { data: fileRows, error: filesError } = editionIds.length
      ? await supabase
          .from("book_files")
          .select("id, edition_id, format, kind, ingestion_status")
          .in("edition_id", editionIds)
          .eq("kind", "normalized")
          .eq("format", "anki-json")
          .eq("ingestion_status", "ready")
      : { data: [] as any[], error: null };
    if (filesError) throw filesError;

    const { data: rightsRows, error: rightsError } = editionIds.length
      ? await supabase
          .from("rights_assertions")
          .select("id, edition_id, status, jurisdiction")
          .in("edition_id", editionIds)
          .eq("status", "public-domain")
      : { data: [] as any[], error: null };
    if (rightsError) throw rightsError;

    const files = (fileRows ?? []) as any[];
    const rights = (rightsRows ?? []) as any[];

    const filesByEdition = new Map<string, any[]>();
    for (const file of files) {
      const list = filesByEdition.get(file.edition_id) ?? [];
      list.push(file);
      filesByEdition.set(file.edition_id, list);
    }

    const rightsByEdition = new Map<string, any[]>();
    for (const assertion of rights) {
      const list = rightsByEdition.get(assertion.edition_id) ?? [];
      list.push(assertion);
      rightsByEdition.set(assertion.edition_id, list);
    }

    const editionsByWork = new Map<string, any[]>();
    for (const edition of editions) {
      const list = editionsByWork.get(edition.work_id) ?? [];
      list.push(edition);
      editionsByWork.set(edition.work_id, list);
    }

    const authorNameById = new Map((authorRows ?? []).map((a: any) => [a.id, a.name as string]));

    const books = works
      .map((row: any) => {
        const candidateEditions = editionsByWork.get(row.id) ?? [];
        const qualifyingEditions = buildQualifyingEditions(candidateEditions, filesByEdition, rightsByEdition);
        if (qualifyingEditions.length === 0) return null;
        return buildBookFromWork(row, qualifyingEditions, authorNameById);
      })
      .filter((book): book is NonNullable<typeof book> => book !== null);

    const booksById = new Map(books.map(book => [book.id, book]));
    const orderedBooks = workIds
      .map(id => booksById.get(id))
      .filter((book): book is NonNullable<typeof book> => book !== undefined);

    const authors = (authorRows ?? []).map((a: any) => ({
      id: a.id,
      name: a.name,
      alternativeNames: a.alternative_names ?? [],
      birthYear: a.birth_year ?? null,
      deathYear: a.death_year ?? null
    }));

    return jsonResponse({
      books: orderedBooks,
      authors,
      total,
      hasMore: offset + workIds.length < total,
      facets
    });
  } catch (error) {
    console.error("omnia-library-catalog failed:", error);
    return serverErrorResponse();
  }
});
