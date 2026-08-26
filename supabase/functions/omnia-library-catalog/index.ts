// omnia-library-catalog — NEW Edge Function (not yet deployed).
//
// Reads AN.KI's own internal catalog (public.works / authors / editions /
// book_files / rights_assertions, gated through public.work_readiness) and
// serves it, paginated and searchable, to the frontend's Library screen
// and to Home's SearchPanel. This is deliberately a SEPARATE function from
// `omnia-library` (an external Gutendex/Wikisource aggregator, contract
// confirmed separately -- action:"search", non-empty query, no relation to
// these tables) and from `omnia-catalog` (a small, fixed, non-paginated
// legacy response -- also unrelated to these tables). Neither of those is
// touched by this file.
//
// WHY A NEW EDGE FUNCTION AND NOT DIRECT FRONTEND TABLE ACCESS:
// RLS is enabled on all five base tables. A direct PostgREST read from the
// frontend, using only the public anon/publishable key, was tested against
// the live project (`/rest/v1/works?select=...&apikey=...`) and returned
// `[]` for every table -- the empty-array-not-an-error pattern RLS
// produces when no policy grants the `anon` role SELECT, rather than an
// outright 401/403. So there is no way for the browser, using only the
// public key, to read these tables at all. This function runs server-side
// with the project's SERVICE_ROLE key (via the standard
// `SUPABASE_SERVICE_ROLE_KEY` environment variable every Supabase Edge
// Function receives automatically -- never sent to or embedded in the
// frontend bundle) specifically so it can bypass RLS *safely*, deciding
// itself exactly which columns and which rows are safe to expose.
//
// DEPLOYMENT REQUIREMENT -- verify_jwt = false:
// This is a public, read-only endpoint. The frontend calls it with only
// the public Supabase `apikey` header (see src/api/libraryCatalog.ts) and
// never sends an `Authorization: Bearer` JWT -- the same pattern this
// project's existing public functions (omnia-catalog, omnia-book-content)
// already use, both already deployed with JWT verification disabled at
// the gateway. This function must be deployed the same way (see
// supabase/config.toml in this repo, or `--no-verify-jwt` at deploy
// time) -- otherwise the gateway rejects every browser request before it
// ever reaches the code below. This is a gateway-level setting, separate
// from (and in addition to) the service-role/RLS access control
// described above -- one controls who may call the function at all, the
// other controls what the function itself is allowed to read once called.
//
// ELIGIBILITY -- CANONICAL, NOT HAND-ROLLED:
// A work is eligible for Library/Search exactly when
// `work_readiness.catalog_ready = true AND works.publication_status <>
// 'hidden'`. This is enforced by a single Postgres function,
// public.library_catalog_search (see supabase/sql/library_catalog_search.sql),
// called below via supabase.rpc(...) with the service-role client -- not
// duplicated here as a second, hand-rolled approximation of readiness.
// publication_status is NOT used as the primary gate: on a live snapshot
// checked during this work, the large majority of catalog-ready works
// were publication_status='draft', with only a small handful 'published'
// (ingestion keeps changing these counts -- see the written report for a
// timestamped snapshot total rather than a number hardcoded here). draft
// stays in the database and does not block a catalog-ready work from
// appearing here -- see the SQL file's own header comment for the full
// reasoning. No mass UPDATE of publication_status was made or is needed.
//
// FILTERING HAPPENS BEFORE PAGINATION, IN THE DATABASE:
// library_catalog_search applies the full catalog_ready + publication_status
// + search + language filter, THEN paginates with LIMIT/OFFSET, THEN
// reports `total_count` via a window function computed over the complete
// filtered set (before the outer LIMIT clips it). This function never
// fetches a page and discards rows client-side to "make it fit" -- total
// and hasMore below are read directly from that already-filtered count.
//
// LANGUAGE FACETS (server-driven-facets phase): every response also
// carries `facets.languages: {code, count}[]`, sourced from the sibling
// public.library_language_facets function (see
// supabase/sql/library_language_facets.sql). This is the ONE source of
// truth the frontend now uses to know which languages exist to filter
// by -- src/catalog/languages.ts no longer decides WHICH languages are
// offered, only how a given code is LABELED. `count` is a Work count
// (a Work with several qualifying editions in one language still counts
// once), matches the exact same catalog_ready + qualifying-edition rule
// this file already applies below, and reacts to `q` + `jurisdiction`
// but deliberately NOT to the active `language` filter -- see the RPC
// call below for why.
//
// Schema note: every column name below was empirically confirmed against
// the live project by probing PostgREST's own "column does not exist"
// (400) vs "valid query" (200, RLS-empty []) responses. works.author_id ->
// authors.id, editions.work_id -> works.id, book_files.edition_id ->
// editions.id, rights_assertions.edition_id -> editions.id, and
// rights_assertions.book_file_id -> book_files.id, and
// work_readiness.work_id -> works.id are all directly confirmed
// relationships (the last one via a direct live join query, see the SQL
// file's own header comment) -- not guesses, no hedging needed on any of
// these.
const WORKS_COLUMNS = `
  id, title, original_title, alternative_titles, author_id, original_language,
  available_languages, publication_year, country_id, century_id, epoch_id,
  movement_id, genre_ids, theme_ids, description, cover, collection_ids
`;

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 100;

const BOOK_CONTENT_ENDPOINT =
  "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-book-content";

// Same reader-supported-format preference as the frontend's own
// toReaderBook.ts (READER_SUPPORTED_FORMATS) -- anki-json first. Kept as a
// small local copy rather than a shared import: this function has no
// access to the frontend's src/ tree at deploy time (Edge Functions are
// deployed standalone), so the two lists are necessarily separate copies
// of the same ordering, not one shared module.
const FORMAT_PRIORITY = ["anki-json", "epub", "plaintext"];

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

// Generic, client-facing failure. The real cause is always logged
// server-side via console.error before this is returned -- never the raw
// error/detail itself, which could otherwise leak internal PostgREST/DB
// error text (table/column names, constraint names) to a public,
// unauthenticated caller.
function serverErrorResponse(): Response {
  return jsonResponse({ error: "omnia-library-catalog request failed" }, 500);
}

// Deno + npm: specifier via this function's own deno.json import map
// ("supabase" -> npm:@supabase/supabase-js@2.112.4), per the currently
// recommended Supabase Edge Functions dependency-management pattern
// (checked against the live Supabase docs, deno.json + pinned npm:
// specifier over an unpinned esm.sh URL). 2.112.4 was the latest published
// @supabase/supabase-js version at the time this was written, confirmed
// directly against the npm registry -- pin bumps are a deliberate,
// separate decision, not something this function does automatically.
// @ts-ignore -- "supabase" resolves via this directory's deno.json import
// map at deploy time; this repo's own tsconfig excludes supabase/functions
// from its frontend TS project, so this import is never type-checked by
// Vite/tsc either way.
import { createClient } from "supabase";

Deno.serve(async (req: Request) => {

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed -- use GET" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    // These two are populated automatically for every Supabase Edge
    // Function -- if this fires, the function isn't actually running in a
    // Supabase deployment, not a real runtime condition to design around
    // further. Still returned generically, not with the missing var names,
    // for the same reason as serverErrorResponse above.
    console.error("omnia-library-catalog misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
    return serverErrorResponse();
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const url = new URL(req.url);
  const rawQuery = (url.searchParams.get("q") ?? "").trim();
  const language = (url.searchParams.get("language") ?? "").trim();
  const jurisdiction = (url.searchParams.get("jurisdiction") ?? "").trim();
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0") || 0);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT)) || DEFAULT_LIMIT)
  );

  // A query shorter than 2 characters is treated as "no filter" (browse
  // all), same threshold Library's own empty-query browse and Search's
  // "don't refine on a single keystroke" behavior already agree on
  // client-side -- kept here too so the two stay consistent even if this
  // endpoint is ever called directly.
  const searchQuery = rawQuery.length >= 2 ? rawQuery : null;

  try {

    // Step 1: which works are eligible, and how many total, entirely
    // inside the database -- see library_catalog_search's own header
    // comment (supabase/sql/library_catalog_search.sql) for exactly how
    // catalog_ready + publication_status + search + language are applied
    // and why a bound function parameter (not a hand-built filter string)
    // is what makes the search argument here safe against PostgREST
    // filter-injection.
    //
    // Language facets (server-driven-facets phase): fetched via the same
    // RPC round trip window (Promise.all, not sequential) from the
    // sibling public.library_language_facets function -- see
    // supabase/sql/library_language_facets.sql for the full contract.
    // Deliberately called with q + jurisdiction but WITHOUT `language`:
    // facets answer "what languages exist for this search, in this
    // jurisdiction", not "what languages exist within the language I
    // already picked" -- passing the active language filter here would
    // make every language but the selected one vanish from the list the
    // moment a visitor picks one, which is exactly the bug this
    // mechanism exists to avoid. See LibraryView.tsx / SearchPanel.tsx
    // for how the frontend consumes this.
    const [searchResult, facetsResult] = await Promise.all([
      supabase.rpc("library_catalog_search", {
        p_query: searchQuery,
        p_language: language || null,
        p_limit: limit,
        p_offset: offset,
        p_jurisdiction: jurisdiction || null
      }),
      supabase.rpc("library_language_facets", {
        p_query: searchQuery,
        p_jurisdiction: jurisdiction || null
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

    // Step 2: fetch full details for exactly these work ids -- never a
    // broader scan. Every table read below is still service-role (RLS
    // bypassed deliberately, as explained above), but scoped tightly to
    // this one page's ids.
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

    // Only editions that are themselves ingestion_status=ready -- reader_ready
    // (and so catalog_ready) is defined per-edition, not per-work, so a
    // work can have some ready and some not-yet-ready editions.
    const { data: editionRows, error: editionsError } = await supabase
      .from("editions")
      .select("id, work_id, language, is_original, translator_name, source_id, external_id")
      .in("work_id", workIds)
      .eq("ingestion_status", "ready");
    if (editionsError) throw editionsError;

    const editions = (editionRows ?? []) as any[];
    const editionIds = editions.map(e => e.id);

    // Exact reader_ready file match: kind=normalized AND format=anki-json
    // AND ingestion_status=ready -- all three, not just format +
    // ingestion_status as the previous version checked. A book_file
    // missing any one of these is not a qualifying file, matching
    // work_readiness's own reader_ready definition exactly.
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

        const qualifyingEditions = candidateEditions
          .map((edition: any) => {

            const readyFormats = new Set(
              (filesByEdition.get(edition.id) ?? []).map((file: any) => file.format as string)
            );
            const editionRights = rightsByEdition.get(edition.id) ?? [];

            if (editionRights.length === 0) return null;

            // Prefer anki-json (this project's own normalized content)
            // over epub/plaintext, same priority as the frontend reader --
            // only ONE file entry per edition here, matching every
            // existing seed Edition's own convention (one edition, one
            // file). In practice the reader_ready file filter above
            // (kind=normalized, format=anki-json) already narrows this to
            // anki-json specifically; the priority list is kept so this
            // still degrades sensibly if that filter is ever loosened.
            const bestFormat = FORMAT_PRIORITY.find(format => readyFormats.has(format));
            if (!bestFormat) return null;

            // editions.source_id / editions.external_id are real columns
            // on the live schema -- use them when present rather than
            // always reporting the generic "anki-catalog" placeholder.
            // "anki-catalog" is now only a fallback for the genuine edge
            // case of a ready edition that itself has no recorded
            // source_id, not the default for every internal-catalog
            // edition regardless of its real provenance.
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

        // catalog_ready implies at least one qualifying edition should
        // exist; if this particular work has none by the time of this
        // detail-fetch (a data-consistency edge case, not expected in
        // normal operation), it is simply left out of this page rather
        // than shown with an empty editions array a visitor could open
        // into a book with nothing to read.
        if (qualifyingEditions.length === 0) return null;

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

      })
      .filter((book): book is NonNullable<typeof book> => book !== null);

    // Re-ordered to match the RPC's own ordering (workIds, w.id asc) --
    // the detail-fetch .in() calls above do not themselves guarantee
    // response row order, so books is rebuilt by that map above rather
    // than trusted to already be in page order, then reordered here.
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
