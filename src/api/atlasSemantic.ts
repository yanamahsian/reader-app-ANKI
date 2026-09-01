import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

const FUNCTION_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-atlas-semantic`;
const CONCEPTS_ENDPOINT = `${SUPABASE_URL}/rest/v1/atlas_semantic_concepts`;
const EVIDENCE_ENDPOINT = `${SUPABASE_URL}/rest/v1/atlas_semantic_evidence`;
const RELATIONSHIPS_ENDPOINT = `${SUPABASE_URL}/rest/v1/atlas_semantic_relationships`;
const PAGE_SIZE = 500;

export type AtlasSemanticEntityType = "concept" | "person";
export type AtlasSemanticSourceType = "annotation" | "thread";

export interface AtlasSemanticConcept {
  id: string;
  entityType: AtlasSemanticEntityType;
  canonicalKey: string;
  labelEn: string;
  labelRu: string;
  evidenceCount: number;
  sourceCount: number;
  workCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface AtlasSemanticEvidence {
  id: string;
  conceptId: string;
  sourceType: AtlasSemanticSourceType;
  sourceId: string;
  workId: string | null;
  excerpt: string | null;
  confidence: number;
  sourceRevisionAt: string;
}

export interface AtlasSemanticRelationship {
  id: string;
  leftConceptId: string;
  rightConceptId: string;
  relationshipType: "co_occurs_in_memory";
  sharedSourceCount: number;
  sharedWorkCount: number;
  evidenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface AtlasSemanticIndexResult {
  processed: number;
  stale: number;
  failed: number;
  remaining: number;
  indexed: boolean;
}

interface ConceptRow {
  id: string;
  entity_type: AtlasSemanticEntityType;
  canonical_key: string;
  label_en: string;
  label_ru: string;
  evidence_count: number;
  source_count: number;
  work_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

interface EvidenceRow {
  id: string;
  concept_id: string;
  source_type: AtlasSemanticSourceType;
  source_id: string;
  work_id: string | null;
  excerpt: string | null;
  confidence: number;
  source_revision_at: string;
}

interface RelationshipRow {
  id: string;
  left_concept_id: string;
  right_concept_id: string;
  relationship_type: "co_occurs_in_memory";
  shared_source_count: number;
  shared_work_count: number;
  evidence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

export class AtlasSemanticIndexError extends Error {
  constructor(
    public readonly kind:
      | "auth_required"
      | "monthly_limit"
      | "hourly_limit"
      | "service_unavailable"
      | "extraction_failed",
    message: string,
    public readonly resetAt: string | null = null
  ) {
    super(message);
    this.name = "AtlasSemanticIndexError";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new AtlasSemanticIndexError("auth_required", "Не авторизован.");
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

function fromConceptRow(row: ConceptRow): AtlasSemanticConcept {
  return {
    id: row.id,
    entityType: row.entity_type,
    canonicalKey: row.canonical_key,
    labelEn: row.label_en,
    labelRu: row.label_ru,
    evidenceCount: row.evidence_count,
    sourceCount: row.source_count,
    workCount: row.work_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

function fromEvidenceRow(row: EvidenceRow): AtlasSemanticEvidence {
  return {
    id: row.id,
    conceptId: row.concept_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    workId: row.work_id,
    excerpt: row.excerpt,
    confidence: row.confidence,
    sourceRevisionAt: row.source_revision_at
  };
}

function fromRelationshipRow(row: RelationshipRow): AtlasSemanticRelationship {
  return {
    id: row.id,
    leftConceptId: row.left_concept_id,
    rightConceptId: row.right_concept_id,
    relationshipType: row.relationship_type,
    sharedSourceCount: row.shared_source_count,
    sharedWorkCount: row.shared_work_count,
    evidenceCount: row.evidence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at
  };
}

export async function runAtlasSemanticIndex(): Promise<AtlasSemanticIndexResult> {
  const headers = await authHeaders();
  const response = await fetch(FUNCTION_ENDPOINT, {
    method: "POST",
    headers,
    body: "{}"
  });

  const body = await response.json().catch(() => ({})) as {
    processed?: number;
    stale?: number;
    failed?: number;
    remaining?: number;
    indexed?: boolean;
    error?: string;
    resetAt?: string | null;
  };

  if (response.ok) {
    return {
      processed: Number.isFinite(body.processed) ? Number(body.processed) : 0,
      stale: Number.isFinite(body.stale) ? Number(body.stale) : 0,
      failed: Number.isFinite(body.failed) ? Number(body.failed) : 0,
      remaining: Number.isFinite(body.remaining) ? Number(body.remaining) : 0,
      indexed: body.indexed === true
    };
  }

  if (response.status === 401 || body.error === "auth_required") {
    throw new AtlasSemanticIndexError("auth_required", "Сессия истекла. Войдите снова.");
  }
  if (response.status === 429 && body.error === "ai_monthly_limit_reached") {
    throw new AtlasSemanticIndexError("monthly_limit", "Месячный лимит Atlas AI исчерпан.", body.resetAt ?? null);
  }
  if (response.status === 429 && body.error === "ai_hourly_limit_reached") {
    throw new AtlasSemanticIndexError("hourly_limit", "Часовой лимит Atlas AI исчерпан.", body.resetAt ?? null);
  }
  if (body.error === "semantic_extraction_failed") {
    throw new AtlasSemanticIndexError("extraction_failed", "Не удалось проиндексировать новую память Atlas.");
  }
  throw new AtlasSemanticIndexError("service_unavailable", "Смысловая индексация Atlas временно недоступна.");
}

async function fetchPaged<T>(endpoint: string, order: string, filters = ""): Promise<T[]> {
  const headers = await authHeaders();
  const rows: T[] = [];
  let offset = 0;
  const prefix = filters ? `${filters}&` : "";

  while (true) {
    const response = await fetch(
      `${endpoint}?${prefix}select=*&order=${order}&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers }
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`Atlas semantic list failed (${response.status}):`, detail);
      throw new Error("Не удалось загрузить смысловой граф Atlas.");
    }
    const page = (await response.json()) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return rows;
}

export async function listAtlasSemanticConcepts(): Promise<AtlasSemanticConcept[]> {
  const rows = await fetchPaged<ConceptRow>(
    CONCEPTS_ENDPOINT,
    "source_count.desc,evidence_count.desc,work_count.desc,last_seen_at.desc"
  );
  return rows.map(fromConceptRow);
}

export async function listAtlasSemanticEvidence(conceptId: string): Promise<AtlasSemanticEvidence[]> {
  if (!conceptId.trim()) return [];
  const rows = await fetchPaged<EvidenceRow>(
    EVIDENCE_ENDPOINT,
    "source_revision_at.desc,confidence.desc",
    `concept_id=eq.${encodeURIComponent(conceptId)}`
  );
  return rows.map(fromEvidenceRow);
}

export async function listAtlasSemanticRelationships(): Promise<AtlasSemanticRelationship[]> {
  const rows = await fetchPaged<RelationshipRow>(
    RELATIONSHIPS_ENDPOINT,
    "shared_source_count.desc,shared_work_count.desc,evidence_count.desc,last_seen_at.desc"
  );
  return rows.map(fromRelationshipRow);
}

export async function loadAtlasSemanticGraph(): Promise<{
  concepts: AtlasSemanticConcept[];
  relationships: AtlasSemanticRelationship[];
}> {
  const [concepts, relationships] = await Promise.all([
    listAtlasSemanticConcepts(),
    listAtlasSemanticRelationships()
  ]);
  return { concepts, relationships };
}
