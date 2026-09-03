// THE CANON v1 -- client data layer for the Atlas "Canon" section.
//
// Reads public.canon_collections / canon_paths / canon_path_collections /
// canon_path_works directly via PostgREST (same raw-fetch-to-REST
// convention every other api/*.ts file in this app uses -- there is no
// supabase-js client anywhere in this codebase, see atlasMemory.ts/
// userLibrary.ts). This works for Canon specifically -- and would NOT
// work for public.works/authors/editions -- because the Canon tables
// carry an explicit "public can read published rows" RLS policy for
// both anon and authenticated (see supabase/sql/catalog_the_canon_
// schema_v1.sql), unlike works/editions/taxonomy_terms, which are
// RLS-locked with zero policies and only ever served through the
// service-role omnia-library-catalog Edge Function.
//
// That's exactly why work metadata (title/author/publicationYear/genre/
// movement/epoch) is deliberately NOT re-fetched or re-shaped here: this
// module resolves every work_id it encounters through the SAME
// fetchAndMergeWorksByIds() + getBookById() path Library/Search/My
// Library/Atlas already use (see userLibrary.ts's own comment on why
// that Edge Function exists), so a work opened from a Canon path is the
// exact same Book object the rest of the app already knows about --
// never a second, Canon-only copy of catalog data.
//
// Query shape: getCanonPath() below is 2 REST calls (one for the path +
// its collection links via a nested PostgREST embed, one for its
// path_works) plus 1 batched Edge Function call for every work_id in
// that path at once -- never one request per work ("no N+1").
// getCanonCollections() and getCanonPathsForCollection() are each a
// single REST call (with a nested embed for the per-collection
// published-path count / the paths themselves, respectively).
//
// Caching: a simple session-lifetime, no-TTL module-level cache -- the
// same idiom src/i18n/index.ts's own comment attributes to
// catalog/catalogStore.ts ("this codebase's other shared client-side
// state"). Reasonable here specifically because Canon content is
// editorial and changes rarely; there is no user-mutation path that
// would ever need to invalidate it within a single session.

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, getValidAccessToken } from "../auth/supabaseAuth";
import { fetchAndMergeWorksByIds } from "./userLibrary";
import { getBookById, epochs, movements, genres, type Book, type TaxonomyTerm } from "../catalog";

const REST_URL = `${SUPABASE_URL}/rest/v1`;

export type CanonStatus = "draft" | "published" | "archived";
export type CanonReadingStage = "entry" | "intermediate" | "advanced";

// Open-ended on purpose -- not narrowed to the app's current
// SUPPORTED_LOCALES, so a locale this jsonb map already has (added via a
// plain UPDATE, no migration -- see the schema migration's own comment)
// resolves correctly even before the interface-language list catches up.
export type CanonI18nMap = Record<string, string>;

export interface CanonCollection {
  id: string;
  title: string;
  titleI18n: CanonI18nMap;
  description: string | null;
  descriptionI18n: CanonI18nMap;
  status: CanonStatus;
  position: number;
  publishedPathCount: number;
}

export interface CanonPathSummary {
  id: string;
  title: string;
  titleI18n: CanonI18nMap;
  description: string | null;
  descriptionI18n: CanonI18nMap;
  status: CanonStatus;
  position: number;
  positionInCollection: number;
}

export interface CanonPathCollectionRef {
  id: string;
  title: string;
  titleI18n: CanonI18nMap;
}

export interface CanonPathWork {
  id: string;
  workId: string;
  position: number;
  readingStage: CanonReadingStage | null;
  isCore: boolean | null;
  rationale: string | null;
  rationaleI18n: CanonI18nMap;
  prerequisiteWorkId: string | null;
  work: Book | undefined;
  prerequisiteWork: Book | undefined;
}

export interface CanonPathDetail {
  id: string;
  title: string;
  titleI18n: CanonI18nMap;
  description: string | null;
  descriptionI18n: CanonI18nMap;
  status: CanonStatus;
  position: number;
  collections: CanonPathCollectionRef[];
  works: CanonPathWork[];
}

// Resolves a localized field with the same fallback chain the schema
// migration documents: exact locale match in the *_i18n map, else the
// required plain-text base column. Pure/no React -- callers pass in
// whatever locale useI18n() currently reports, so this file stays a
// plain data layer and the interface-language mechanism (src/i18n --
// left untouched here, per instruction not to touch the separate i18n
// branch or hardcode Russian) stays entirely the caller's concern.
export function resolveCanonText(base: string, i18n: CanonI18nMap | null | undefined, locale: string): string {
  const localized = i18n?.[locale];
  return localized && localized.trim().length > 0 ? localized : base;
}

async function canonHeaders(): Promise<Record<string, string>> {
  // Canon rows are readable by BOTH anon and authenticated per RLS --
  // unlike userLibrary.ts's authHeaders(), this never throws when
  // signed out: it just authenticates as anon (the publishable key
  // doubles as the anon bearer token, the standard Supabase pattern for
  // an unauthenticated PostgREST request). In practice Canon only ever
  // mounts inside AtlasView's existing isAuthenticated gate today (see
  // AtlasCanonSection's own comment), but this module makes no
  // assumption about that so it keeps working correctly if Canon is
  // ever exposed to guests later.
  const token = await getValidAccessToken().catch(() => null);
  return {
    "apikey": SUPABASE_PUBLISHABLE_KEY,
    "Authorization": `Bearer ${token ?? SUPABASE_PUBLISHABLE_KEY}`
  };
}

async function restGet<T>(path: string): Promise<T> {
  const headers = await canonHeaders();
  const response = await fetch(`${REST_URL}${path}`, { headers });
  if (!response.ok) {
    console.error("Canon REST request failed:", response.status, await response.text().catch(() => ""));
    throw new Error("Не удалось загрузить данные The Canon.");
  }
  return (await response.json()) as T;
}

function labelFor(terms: TaxonomyTerm[], id: string | null): string | null {
  if (!id) return null;
  return terms.find(term => term.id === id)?.label ?? null;
}

export function canonEpochLabel(book: Book): string | null {
  return labelFor(epochs, book.epochId);
}
export function canonMovementLabel(book: Book): string | null {
  return labelFor(movements, book.movementId);
}
export function canonGenreLabels(book: Book): string[] {
  return book.genreIds.map(id => labelFor(genres, id)).filter((label): label is string => Boolean(label));
}

// ---- caching ----------------------------------------------------------

let collectionsCache: CanonCollection[] | null = null;
const pathsForCollectionCache = new Map<string, CanonPathSummary[]>();
const pathDetailCache = new Map<string, CanonPathDetail>();

// Not wired to any UI action today (Canon content never changes from
// inside the client) -- exported so a future editorial-refresh action,
// or a test, can force a clean re-read without a full page reload.
export function invalidateCanonCache(): void {
  collectionsCache = null;
  pathsForCollectionCache.clear();
  pathDetailCache.clear();
}

// ---- reads --------------------------------------------------------------

interface CanonCollectionRow {
  id: string;
  title: string;
  title_i18n: CanonI18nMap;
  description: string | null;
  description_i18n: CanonI18nMap;
  status: CanonStatus;
  position: number;
  canon_path_collections: { count: number }[];
}

function fromCollectionRow(row: CanonCollectionRow): CanonCollection {
  return {
    id: row.id,
    title: row.title,
    titleI18n: row.title_i18n ?? {},
    description: row.description,
    descriptionI18n: row.description_i18n ?? {},
    status: row.status,
    position: row.position,
    publishedPathCount: row.canon_path_collections?.[0]?.count ?? 0
  };
}

export async function getCanonCollections(): Promise<CanonCollection[]> {
  if (collectionsCache) return collectionsCache;

  const rows = await restGet<CanonCollectionRow[]>(
    "/canon_collections?select=id,title,title_i18n,description,description_i18n,status,position,canon_path_collections(count)&order=position.asc"
  );
  collectionsCache = rows.map(fromCollectionRow);
  return collectionsCache;
}

interface CanonPathEmbedRow {
  id: string;
  title: string;
  title_i18n: CanonI18nMap;
  description: string | null;
  description_i18n: CanonI18nMap;
  status: CanonStatus;
  position: number;
}

interface CanonPathForCollectionRow {
  position: number;
  canon_paths: CanonPathEmbedRow;
}

export async function getCanonPathsForCollection(collectionId: string): Promise<CanonPathSummary[]> {
  const cached = pathsForCollectionCache.get(collectionId);
  if (cached) return cached;

  const rows = await restGet<CanonPathForCollectionRow[]>(
    `/canon_path_collections?collection_id=eq.${encodeURIComponent(collectionId)}` +
      "&select=position,canon_paths(id,title,title_i18n,description,description_i18n,status,position)" +
      "&order=position.asc"
  );

  const paths = rows
    .filter(row => row.canon_paths)
    .map(row => ({
      id: row.canon_paths.id,
      title: row.canon_paths.title,
      titleI18n: row.canon_paths.title_i18n ?? {},
      description: row.canon_paths.description,
      descriptionI18n: row.canon_paths.description_i18n ?? {},
      status: row.canon_paths.status,
      position: row.canon_paths.position,
      positionInCollection: row.position
    }));

  pathsForCollectionCache.set(collectionId, paths);
  return paths;
}

interface CanonPathRootRow {
  id: string;
  title: string;
  title_i18n: CanonI18nMap;
  description: string | null;
  description_i18n: CanonI18nMap;
  status: CanonStatus;
  position: number;
  canon_path_collections: { position: number; canon_collections: { id: string; title: string; title_i18n: CanonI18nMap } }[];
}

interface CanonPathWorkRow {
  id: string;
  work_id: string;
  position: number;
  reading_stage: CanonReadingStage | null;
  is_core: boolean | null;
  prerequisite_work_id: string | null;
  rationale: string | null;
  rationale_i18n: CanonI18nMap;
}

export async function getCanonPath(pathId: string): Promise<CanonPathDetail | null> {
  const cached = pathDetailCache.get(pathId);
  if (cached) return cached;

  const [pathRows, workRows] = await Promise.all([
    restGet<CanonPathRootRow[]>(
      `/canon_paths?id=eq.${encodeURIComponent(pathId)}` +
        "&select=id,title,title_i18n,description,description_i18n,status,position," +
        "canon_path_collections(position,canon_collections(id,title,title_i18n))"
    ),
    restGet<CanonPathWorkRow[]>(
      `/canon_path_works?path_id=eq.${encodeURIComponent(pathId)}` +
        "&select=id,work_id,position,reading_stage,is_core,prerequisite_work_id,rationale,rationale_i18n" +
        "&order=position.asc"
    )
  ]);

  const pathRow = pathRows[0];
  if (!pathRow) return null;

  // One batched fetch for every work_id this path needs (the works
  // themselves plus any prerequisite pointers), never one call per row.
  const allWorkIds = Array.from(
    new Set([
      ...workRows.map(row => row.work_id),
      ...workRows.map(row => row.prerequisite_work_id).filter((id): id is string => Boolean(id))
    ])
  );
  if (allWorkIds.length > 0) {
    try {
      await fetchAndMergeWorksByIds(allWorkIds);
    } catch (error) {
      // Not authenticated, or the batch lookup failed -- works simply
      // resolve to undefined below (rendered as "unavailable" by the
      // UI) rather than throwing the whole path detail away. See this
      // module's header comment: today Canon only ever loads while
      // signed in, so this is a defensive fallback, not the expected
      // path.
      console.error("Canon work metadata fetch failed:", error);
    }
  }

  const collections: CanonPathCollectionRef[] = pathRow.canon_path_collections
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(link => ({
      id: link.canon_collections.id,
      title: link.canon_collections.title,
      titleI18n: link.canon_collections.title_i18n ?? {}
    }));

  const works: CanonPathWork[] = workRows
    .slice()
    .sort((a, b) => a.position - b.position)
    .map(row => ({
      id: row.id,
      workId: row.work_id,
      position: row.position,
      readingStage: row.reading_stage,
      isCore: row.is_core,
      rationale: row.rationale,
      rationaleI18n: row.rationale_i18n ?? {},
      prerequisiteWorkId: row.prerequisite_work_id,
      work: getBookById(row.work_id),
      prerequisiteWork: row.prerequisite_work_id ? getBookById(row.prerequisite_work_id) : undefined
    }));

  const detail: CanonPathDetail = {
    id: pathRow.id,
    title: pathRow.title,
    titleI18n: pathRow.title_i18n ?? {},
    description: pathRow.description,
    descriptionI18n: pathRow.description_i18n ?? {},
    status: pathRow.status,
    position: pathRow.position,
    collections,
    works
  };

  pathDetailCache.set(pathId, detail);
  return detail;
}
