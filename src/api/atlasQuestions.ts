// ATLAS CROSS-BOOK QUESTIONS v1: a bounded question over the visitor's own
// Reading Memory (saved quotes, personal notes, Thought Threads) --
// answered by supabase/functions/omnia-ai's new "atlas-question" action.
//
// Unlike translateText/explainText in src/api/ai.ts (both anonymous),
// this call requires the visitor's real Supabase access token: the Edge
// Function forwards it unchanged to PostgREST to read annotations/
// thought_threads/thought_thread_items, so Row Level Security -- not this
// file, not the Edge Function's own code -- is what decides which
// fragments can ever be used to answer. There is no annotationId sent in
// the request; nothing here could widen what RLS already returns for this
// visitor's own token.
//
// No AI history/table is written anywhere in this flow -- a question and
// its answer are ephemeral UI state, never persisted, matching v1's
// explicitly-not-a-chat-app framing.
import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-ai`;

export type AtlasQuestionStatus = "ok" | "no_memory" | "insufficient_material";

export interface AtlasQuestionEvidence {
  annotationId: string;
  workId: string;
  bookTitle: string | null;
  author: string | null;
  quotePreview: string;
}

export interface AtlasQuestionResult {
  status: AtlasQuestionStatus;
  answer: string | null;
  evidence: AtlasQuestionEvidence[];
  message: string | null;
}

interface AtlasQuestionResponseBody {
  status: AtlasQuestionStatus;
  answer: string | null;
  evidence: AtlasQuestionEvidence[];
  message: string | null;
}

const NOT_AUTHENTICATED = "Не авторизован.";

// Thrown specifically so callers can tell "your session expired" apart
// from a generic network/AI failure (requirement: expired session must
// surface as an explicit error, never as a silently empty Atlas).
export class AtlasSessionExpiredError extends Error {}

export async function askAtlasQuestion(question: string, signal?: AbortSignal): Promise<AtlasQuestionResult> {
  const token = await getValidAccessToken();
  if (!token) throw new AtlasSessionExpiredError(NOT_AUTHENTICATED);

  let response: Response;
  try {
    response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_PUBLISHABLE_KEY
      },
      signal,
      body: JSON.stringify({ action: "atlas-question", question })
    });
  } catch (networkError) {
    console.error("atlas-question network failure:", networkError);
    throw new Error("Не удалось связаться с Atlas. Проверьте соединение и попробуйте снова.");
  }

  if (response.status === 401) {
    throw new AtlasSessionExpiredError(NOT_AUTHENTICATED);
  }

  if (!response.ok) {
    // Never log response body content here -- it may echo the visitor's
    // own question text back in an error payload, and privacy rules for
    // this feature (spec section 14) apply to diagnostics too.
    console.error(`atlas-question failed with status ${response.status}`);
    throw new Error("Не удалось получить ответ от Atlas.");
  }

  const body = (await response.json()) as AtlasQuestionResponseBody;
  return {
    status: body.status,
    answer: body.answer,
    evidence: Array.isArray(body.evidence) ? body.evidence : [],
    message: body.message
  };
}
