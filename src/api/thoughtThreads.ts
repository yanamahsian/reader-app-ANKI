import {
  getSession,
  getValidAccessToken,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL
} from "../auth/supabaseAuth";

const THREADS_ENDPOINT = `${SUPABASE_URL}/rest/v1/thought_threads`;
const ITEMS_ENDPOINT = `${SUPABASE_URL}/rest/v1/thought_thread_items`;
const RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc`;

export interface ThoughtThread {
  id: string;
  title: string;
  question: string | null;
  synthesisNote: string | null;
  annotationIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface ThreadRow {
  id: string;
  user_id: string;
  title: string;
  question: string | null;
  synthesis_note: string | null;
  created_at: string;
  updated_at: string;
}

interface ThreadItemRow {
  thread_id: string;
  annotation_id: string;
  position: number;
  created_at: string;
}

const NOT_AUTHENTICATED = "Не авторизован.";

async function authContext(extra?: Record<string, string>): Promise<{
  headers: Record<string, string>;
  userId: string;
}> {
  const session = getSession();
  const token = await getValidAccessToken();
  if (!session || !token) throw new Error(NOT_AUTHENTICATED);

  return {
    userId: session.user.id,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra
    }
  };
}

async function throwOnError(response: Response, action: string): Promise<void> {
  if (response.ok) return;
  const detail = await response.text().catch(() => "");
  console.error(`thoughtThreads ${action} failed (${response.status}):`, detail);
  throw new Error(`Не удалось выполнить действие с нитью мысли (${action}).`);
}

function fromRows(thread: ThreadRow, items: ThreadItemRow[]): ThoughtThread {
  return {
    id: thread.id,
    title: thread.title,
    question: thread.question,
    synthesisNote: thread.synthesis_note,
    annotationIds: items
      .filter(item => item.thread_id === thread.id)
      .sort((left, right) => left.position - right.position || left.created_at.localeCompare(right.created_at))
      .map(item => item.annotation_id),
    createdAt: thread.created_at,
    updatedAt: thread.updated_at
  };
}

// Two requests total, never N+1: one for all of the current user's Thread rows and one for
// all relation rows. RLS on both tables supplies the user filter, while the API combines them
// locally so a Thread that has lost all annotations still survives and renders its synthesis.
export async function listThoughtThreads(): Promise<ThoughtThread[]> {
  const { headers } = await authContext();

  const [threadsResponse, itemsResponse] = await Promise.all([
    fetch(
      `${THREADS_ENDPOINT}?select=id,user_id,title,question,synthesis_note,created_at,updated_at&order=updated_at.desc`,
      { headers }
    ),
    fetch(
      `${ITEMS_ENDPOINT}?select=thread_id,annotation_id,position,created_at&order=position.asc,created_at.asc`,
      { headers }
    )
  ]);

  await throwOnError(threadsResponse, "list-threads");
  await throwOnError(itemsResponse, "list-items");

  const threads = (await threadsResponse.json()) as ThreadRow[];
  const items = (await itemsResponse.json()) as ThreadItemRow[];
  return threads.map(thread => fromRows(thread, items));
}

export interface ThoughtThreadInput {
  title: string;
  question: string | null;
  synthesisNote: string | null;
  annotationIds: string[];
}

// Creation is one database transaction. The RPC verifies >=2 distinct annotations and proves
// that every annotation belongs to auth.uid() before inserting either the Thread or its items.
export async function createThoughtThread(input: ThoughtThreadInput): Promise<string> {
  const { headers } = await authContext();
  const response = await fetch(`${RPC_ENDPOINT}/create_thought_thread`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_title: input.title,
      p_question: input.question,
      p_synthesis_note: input.synthesisNote,
      p_annotation_ids: input.annotationIds
    })
  });
  await throwOnError(response, "create");
  const id = (await response.json()) as string;
  if (!id) throw new Error("Не удалось создать нить мысли.");
  return id;
}

// Atomic metadata + membership replacement. This avoids showing success after only half of an
// edit has reached Supabase. Unlike create, 0/1 items are legal so a Thread can survive source
// annotation deletion without destroying the user's synthesis.
export async function replaceThoughtThread(threadId: string, input: ThoughtThreadInput): Promise<void> {
  const { headers } = await authContext();
  const response = await fetch(`${RPC_ENDPOINT}/replace_thought_thread`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      p_thread_id: threadId,
      p_title: input.title,
      p_question: input.question,
      p_synthesis_note: input.synthesisNote,
      p_annotation_ids: input.annotationIds
    })
  });
  await throwOnError(response, "replace");
}

// Explicit low-level relation operations are available for future smaller interactions. The
// composite foreign keys in SQL still prove that thread, annotation and user_id all have the
// same owner, even if a caller bypasses this frontend entirely.
export async function addAnnotationToThoughtThread(
  threadId: string,
  annotationId: string,
  position = 0
): Promise<void> {
  const { headers, userId } = await authContext({ Prefer: "return=minimal" });
  const response = await fetch(ITEMS_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      thread_id: threadId,
      annotation_id: annotationId,
      user_id: userId,
      position
    })
  });
  await throwOnError(response, "add-item");
}

export async function removeAnnotationFromThoughtThread(threadId: string, annotationId: string): Promise<void> {
  const { headers } = await authContext({ Prefer: "return=minimal" });
  const response = await fetch(
    `${ITEMS_ENDPOINT}?thread_id=eq.${encodeURIComponent(threadId)}&annotation_id=eq.${encodeURIComponent(annotationId)}`,
    { method: "DELETE", headers }
  );
  await throwOnError(response, "remove-item");
}

export async function deleteThoughtThread(threadId: string): Promise<void> {
  const { headers } = await authContext({ Prefer: "return=minimal" });
  const response = await fetch(`${THREADS_ENDPOINT}?id=eq.${encodeURIComponent(threadId)}`, {
    method: "DELETE",
    headers
  });
  await throwOnError(response, "delete");
}
