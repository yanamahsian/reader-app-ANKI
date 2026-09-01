import { getValidAccessToken } from "../auth/supabaseAuth";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/atlas_memory_signals`;

export type AtlasMemorySignalType =
  | "library"
  | "progress"
  | "bookmark"
  | "highlight"
  | "note"
  | "thread"
  | "thread_evidence";

export type AtlasMemorySourceType =
  | "user_library"
  | "reader_progress"
  | "reader_bookmarks"
  | "annotations"
  | "thought_threads"
  | "thought_thread_items";

export interface AtlasMemorySignal {
  id: string;
  userId: string;
  signalType: AtlasMemorySignalType;
  sourceType: AtlasMemorySourceType;
  sourceId: string;
  workId: string | null;
  editionId: string | null;
  pageIndex: number | null;
  label: string | null;
  excerpt: string | null;
  noteText: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  firstSeenAt: string;
  updatedAt: string;
}

interface AtlasMemorySignalRow {
  id: string;
  user_id: string;
  signal_type: AtlasMemorySignalType;
  source_type: AtlasMemorySourceType;
  source_id: string;
  work_id: string | null;
  edition_id: string | null;
  page_index: number | null;
  label: string | null;
  excerpt: string | null;
  note_text: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: string;
  first_seen_at: string;
  updated_at: string;
}

function fromRow(row: AtlasMemorySignalRow): AtlasMemorySignal {
  return {
    id: row.id,
    userId: row.user_id,
    signalType: row.signal_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    workId: row.work_id,
    editionId: row.edition_id,
    pageIndex: row.page_index,
    label: row.label,
    excerpt: row.excerpt,
    noteText: row.note_text,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at
  };
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  if (!token) throw new Error("Не авторизован.");
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
}

export async function listAtlasMemorySignals(limit = 180): Promise<AtlasMemorySignal[]> {
  const safeLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const headers = await authHeaders();
  const response = await fetch(
    `${TABLE_ENDPOINT}?select=*&order=occurred_at.desc&limit=${safeLimit}`,
    { headers }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`atlas memory list failed (${response.status}):`, detail);
    throw new Error("Не удалось загрузить постоянную память Atlas.");
  }

  const rows = (await response.json()) as AtlasMemorySignalRow[];
  return rows.map(fromRow);
}
