import { getValidAccessToken } from "../auth/supabaseAuth";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

const TABLE_ENDPOINT = `${SUPABASE_URL}/rest/v1/atlas_memory_signals`;
const PAGE_SIZE = 500;

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

// Atlas is long-lived memory, so do not silently truncate it at a UI-friendly
// number. PostgREST is read in bounded pages while RLS still restricts every
// page to the authenticated visitor's own rows. The UI itself can choose how
// many recent signals to render after receiving the complete durable set.
export async function listAtlasMemorySignals(): Promise<AtlasMemorySignal[]> {
  const headers = await authHeaders();
  const signals: AtlasMemorySignal[] = [];
  let offset = 0;

  while (true) {
    const response = await fetch(
      `${TABLE_ENDPOINT}?select=*&order=occurred_at.desc&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`atlas memory list failed (${response.status}):`, detail);
      throw new Error("Не удалось загрузить постоянную память Atlas.");
    }

    const rows = (await response.json()) as AtlasMemorySignalRow[];
    signals.push(...rows.map(fromRow));
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return signals;
}
