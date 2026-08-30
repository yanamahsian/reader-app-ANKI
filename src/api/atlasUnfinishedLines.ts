// ATLAS UNFINISHED LINES OF THOUGHT v1: a bounded, on-demand search for new
// reading (saved AFTER a Thought Thread was left unresolved, from a
// different Work) that may genuinely continue, complicate, challenge,
// partially answer, or reframe that thread's own open question -- answered
// by supabase/functions/omnia-ai's "atlas-unfinished-lines" action.
//
// Same shape as findAtlasContradictions (src/api/atlasContradictions.ts):
// no parameters beyond the action name, nothing client-supplied for the
// server to (re-)verify ownership of. The Edge Function selects unresolved
// threads and candidate fragments itself, from whatever this visitor's own
// token's Row Level Security scope returns.
//
// No new persistence anywhere in this flow -- results are ephemeral UI
// state. Marking a suggestion "handled" is not a separate write: adding it
// to its thread via replaceThoughtThread() (src/api/thoughtThreads.ts)
// naturally advances that thread's own updated_at, which is what stops the
// same candidate from qualifying as "new" again on a later run.
import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";
import { AtlasSessionExpiredError } from "./atlasQuestions";

const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-ai`;

export type AtlasUnfinishedLineStatus = "ok" | "no_memory" | "insufficient_material";

export type AtlasUnfinishedLineRelation =
  | "extends"
  | "complicates"
  | "challenges"
  | "partially_answers"
  | "reframes";

export interface AtlasUnfinishedLineEvidence {
  annotationId: string;
  workId: string;
  bookTitle: string | null;
  author: string | null;
  quotePreview: string;
}

export interface AtlasUnfinishedLine {
  threadId: string;
  threadTitle: string;
  threadQuestion: string;
  oldEvidence: AtlasUnfinishedLineEvidence[];
  newEvidence: AtlasUnfinishedLineEvidence;
  relation: AtlasUnfinishedLineRelation;
  confidence: number;
  synthesis: string;
}

export interface AtlasUnfinishedLinesResult {
  status: AtlasUnfinishedLineStatus;
  lines: AtlasUnfinishedLine[];
  message: string | null;
}

interface AtlasUnfinishedLinesResponseBody {
  status: AtlasUnfinishedLineStatus;
  lines: AtlasUnfinishedLine[];
  message: string | null;
}

const NOT_AUTHENTICATED = "Не авторизован.";

// Re-exported so callers of this module don't also need to import from
// atlasQuestions.ts just to catch the same expired-session case -- reusing
// the one error class keeps that contract identical across all three Atlas
// AI features rather than inventing a third one with the same meaning.
export { AtlasSessionExpiredError };

export async function findAtlasUnfinishedLines(signal?: AbortSignal): Promise<AtlasUnfinishedLinesResult> {
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
      body: JSON.stringify({ action: "atlas-unfinished-lines" })
    });
  } catch (networkError) {
    console.error("atlas-unfinished-lines network failure:", networkError);
    throw new Error("Не удалось связаться с Atlas. Проверьте соединение и попробуйте снова.");
  }

  if (response.status === 401) {
    throw new AtlasSessionExpiredError(NOT_AUTHENTICATED);
  }

  if (!response.ok) {
    // Never log response body content here -- privacy rules for Atlas AI
    // features (spec section 14 of Cross-Book Questions, carried over here
    // and to Contradictions) apply to diagnostics too.
    console.error(`atlas-unfinished-lines failed with status ${response.status}`);
    throw new Error("Не удалось получить ответ от Atlas.");
  }

  const body = (await response.json()) as AtlasUnfinishedLinesResponseBody;
  return {
    status: body.status,
    lines: Array.isArray(body.lines) ? body.lines : [],
    message: body.message
  };
}
