import { getValidAccessToken } from "../auth/supabaseAuth";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

const RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc/refresh_my_atlas_graph`;
const CONCEPTS_ENDPOINT = `${SUPABASE_URL}/rest/v1/atlas_concepts`;
const RELATIONSHIPS_ENDPOINT = `${SUPABASE_URL}/rest/v1/atlas_relationships`;
const PAGE_SIZE = 500;

export type AtlasConceptType = "theme" | "genre" | "movement" | "author";

export interface AtlasConcept {
  id: string;
  conceptType: AtlasConceptType;
  conceptKey: string;
  label: string;
  evidenceCount: number;
  workCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface AtlasRelationship {
  id: string;
  leftConceptId: string;
  rightConceptId: string;
  relationshipType: "co_occurs_in_reading";
  sharedWorkCount: number;
  evidenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface AtlasGraphState {
  sourceSignalCount: number;
  activeWorkCount: number;
  conceptCount: number;
  relationshipCount: number;
  refreshedAt: string | null;
}

interface AtlasConceptRow {
  id: string;
  concept_type: AtlasConceptType;
  concept_key: string;
  label: string;
  evidence_count: number;
  work_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

interface AtlasRelationshipRow {
  id: string;
  left_concept_id: string;
  right_concept_id: string;
  relationship_type: "co_occurs_in_reading";
  shared_work_count: number;
  evidence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

interface AtlasGraphStateRow {
  source_signal_count: number;
  active_work_count: number;
  concept_count: number;
  relationship_count: number;
  refreshed_at: string | null;
}

async function authHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Не авторизован.");
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function throwOnError(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => "");
  console.error(`atlas graph ${action} failed (${response.status}):`, detail);
  throw new Error("Не удалось загрузить граф Atlas.");
}

function fromConceptRow(row: AtlasConceptRow): AtlasConcept {
  return {
    id: row.id,
    conceptType: row.concept_type,
    conceptKey: row.concept_key,
    label: row.label,
    evidenceCount: row.evidence_count,
    workCount: row.work_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

function fromRelationshipRow(row: AtlasRelationshipRow): AtlasRelationship {
  return {
    id: row.id,
    leftConceptId: row.left_concept_id,
    rightConceptId: row.right_concept_id,
    relationshipType: row.relationship_type,
    sharedWorkCount: row.shared_work_count,
    evidenceCount: row.evidence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

async function fetchPaged<T>(endpoint: string, order: string): Promise<T[]> {
  const headers = await authHeaders();
  const rows: T[] = [];
  let offset = 0;

  while (true) {
    const response = await fetch(
      `${endpoint}?select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers }
    );
    await throwOnError(response, "list");
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function refreshAtlasGraph(): Promise<AtlasGraphState> {
  const headers = await authHeaders({ Prefer: "return=representation" });
  const response = await fetch(RPC_ENDPOINT, {
    method: "POST",
    headers,
    body: "{}"
  });
  await throwOnError(response, "refresh");
  const rows = (await response.json()) as AtlasGraphStateRow[];
  const row = rows[0];
  if (!row) {
    return {
      sourceSignalCount: 0,
      activeWorkCount: 0,
      conceptCount: 0,
      relationshipCount: 0,
      refreshedAt: null
    };
  }
  return {
    sourceSignalCount: row.source_signal_count,
    activeWorkCount: row.active_work_count,
    conceptCount: row.concept_count,
    relationshipCount: row.relationship_count,
    refreshedAt: row.refreshed_at
  };
}

export async function listAtlasConcepts(): Promise<AtlasConcept[]> {
  const rows = await fetchPaged<AtlasConceptRow>(
    CONCEPTS_ENDPOINT,
    "work_count.desc,evidence_count.desc,last_seen_at.desc"
  );
  return rows.map(fromConceptRow);
}

export async function listAtlasRelationships(): Promise<AtlasRelationship[]> {
  const rows = await fetchPaged<AtlasRelationshipRow>(
    RELATIONSHIPS_ENDPOINT,
    "shared_work_count.desc,evidence_count.desc,last_seen_at.desc"
  );
  return rows.map(fromRelationshipRow);
}

export async function loadAtlasGraph(): Promise<{
  state: AtlasGraphState;
  concepts: AtlasConcept[];
  relationships: AtlasRelationship[];
}> {
  const state = await refreshAtlasGraph();
  const [concepts, relationships] = await Promise.all([
    listAtlasConcepts(),
    listAtlasRelationships()
  ]);
  return { state, concepts, relationships };
}
