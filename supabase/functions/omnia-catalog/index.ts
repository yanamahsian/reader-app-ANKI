import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Public startup catalog. It deliberately returns only the curated Free
// corpus; paid discovery is handled by omnia-library-catalog after user
// identity/plan resolution.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, apikey"
};

const BOOK_CONTENT_ENDPOINT = "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-book-content";

interface WorkRow {
  id: string;
  title: string;
  original_title: string | null;
  alternative_titles: string[];
  author_id: string;
  original_language: string;
  description: string | null;
  cover: string | null;
  publication_year: number | null;
  available_languages: string[];
  country_id: string | null;
  century_id: string | null;
  epoch_id: string | null;
  movement_id: string | null;
  genre_ids: string[];
  theme_ids: string[];
  collection_ids: string[];
  publication_status: string;
}

interface AuthorRow {
  id: string;
  name: string;
  alternative_names: string[];
  birth_year: number | null;
  death_year: number | null;
}

interface EditionRow {
  id: string;
  work_id: string;
  language: string;
  is_original: boolean;
  translator_name: string | null;
  ingestion_status: string;
}

interface BookFileRow {
  id: string;
  edition_id: string;
  kind: string;
  format: string;
  ingestion_status: string;
}

interface RightsRow {
  edition_id: string;
  status: string;
  jurisdiction: string | null;
}

interface WorkReadinessRow {
  work_id: string;
  catalog_ready: boolean;
}

interface FreeCatalogWorkRow {
  work_id: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY", { status: 500, headers: CORS_HEADERS });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const [worksRes, authorsRes, editionsRes, filesRes, rightsRes, readinessRes, freeCatalogRes] = await Promise.all([
      supabase.from("works").select("*"),
      supabase.from("authors").select("*"),
      supabase.from("editions").select("id, work_id, language, is_original, translator_name, ingestion_status"),
      supabase.from("book_files").select("id, edition_id, kind, format, ingestion_status").eq("kind", "normalized"),
      supabase.from("rights_assertions").select("edition_id, status, jurisdiction"),
      supabase.from("work_readiness").select("work_id, catalog_ready"),
      supabase.from("free_catalog_works").select("work_id").eq("enabled", true)
    ]);

    for (const [name, res] of Object.entries({ works: worksRes, authors: authorsRes, editions: editionsRes, files: filesRes, rights: rightsRes, readiness: readinessRes, freeCatalog: freeCatalogRes })) {
      if (res.error) {
        console.error(`omnia-catalog: ${name} query failed`, res.error);
        return new Response(`Failed to query ${name}: ${res.error.message}`, { status: 500, headers: CORS_HEADERS });
      }
    }

    const works = worksRes.data as WorkRow[];
    const authors = authorsRes.data as AuthorRow[];
    const editions = editionsRes.data as EditionRow[];
    const files = filesRes.data as BookFileRow[];
    const rights = rightsRes.data as RightsRow[];
    const readiness = readinessRes.data as WorkReadinessRow[];
    const freeCatalogWorks = freeCatalogRes.data as FreeCatalogWorkRow[];

    const catalogReadyWorkIds = new Set(
      readiness.filter(row => row.catalog_ready === true).map(row => row.work_id)
    );
    const freeWorkIds = new Set(freeCatalogWorks.map(row => row.work_id));

    const publicWorks = works.filter(work =>
      work.publication_status === "published" &&
      catalogReadyWorkIds.has(work.id) &&
      freeWorkIds.has(work.id)
    );

    const authorById = new Map(authors.map(author => [author.id, author]));

    const rightsByEdition = new Map<string, RightsRow[]>();
    for (const right of rights) {
      const list = rightsByEdition.get(right.edition_id) ?? [];
      list.push(right);
      rightsByEdition.set(right.edition_id, list);
    }

    const readyFilesByEdition = new Map<string, BookFileRow[]>();
    for (const file of files) {
      if (file.ingestion_status !== "ready") continue;
      const list = readyFilesByEdition.get(file.edition_id) ?? [];
      list.push(file);
      readyFilesByEdition.set(file.edition_id, list);
    }

    const editionsByWork = new Map<string, EditionRow[]>();
    for (const edition of editions) {
      const list = editionsByWork.get(edition.work_id) ?? [];
      list.push(edition);
      editionsByWork.set(edition.work_id, list);
    }

    const responseBooks = publicWorks.map(work => {
      const author = authorById.get(work.author_id);
      const workEditions = editionsByWork.get(work.id) ?? [];

      return {
        id: work.id,
        title: work.title,
        originalTitle: work.original_title,
        alternativeTitles: work.alternative_titles ?? [],
        authorId: work.author_id,
        authorName: author?.name ?? "",
        originalLanguage: work.original_language,
        availableLanguages: work.available_languages ?? [],
        publicationYear: work.publication_year,
        countryId: work.country_id,
        centuryId: work.century_id,
        epochId: work.epoch_id,
        movementId: work.movement_id,
        genreIds: work.genre_ids ?? [],
        themeIds: work.theme_ids ?? [],
        description: work.description ?? "",
        cover: work.cover,
        collectionIds: work.collection_ids ?? [],
        editions: workEditions.map(edition => ({
          id: edition.id,
          language: edition.language,
          isOriginal: edition.is_original,
          translatorName: edition.translator_name,
          rights: (rightsByEdition.get(edition.id) ?? []).map(r => ({ status: r.status, jurisdiction: r.jurisdiction })),
          sourceId: "gutenberg",
          externalIds: {},
          files: edition.ingestion_status === "ready"
            ? (readyFilesByEdition.get(edition.id) ?? []).map(file => ({
                format: file.format,
                url: `${BOOK_CONTENT_ENDPOINT}?editionId=${encodeURIComponent(edition.id)}`
              }))
            : []
        }))
      };
    });

    const referencedAuthorIds = new Set(publicWorks.map(work => work.author_id));
    const responseAuthors = authors
      .filter(author => referencedAuthorIds.has(author.id))
      .map(author => ({
        id: author.id,
        name: author.name,
        alternativeNames: author.alternative_names ?? [],
        birthYear: author.birth_year,
        deathYear: author.death_year
      }));

    return new Response(
      JSON.stringify({ books: responseBooks, authors: responseAuthors }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("omnia-catalog: unhandled exception", error);
    return new Response(
      `omnia-catalog failed: ${error instanceof Error ? error.message : String(error)}`,
      { status: 500, headers: CORS_HEADERS }
    );
  }
});
