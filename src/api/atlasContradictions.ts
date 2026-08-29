// ATLAS CONTRADICTIONS v1: a bounded search for meaningful intellectual
// disagreements between pairs of the visitor's own saved reading fragments
// -- answered by supabase/functions/omnia-ai's "atlas-contradictions"
// action.
//
// Unlike askAtlasQuestion (src/api/atlasQuestions.ts), this call sends no
// parameters at all beyond the action name: there is no question, no
// annotation id, nothing client-supplied for the server to (re-)verify
// ownership of. The Edge Function selects candidate fragments and forms
// pairs itself, from whatever this visitor's own token's Row Level
// Security scope returns -- exactly the same auth/token shape as
// askAtlasQuestion.
//
// No AI history/table is written anywhere in this flow -- results are
// ephemeral UI state, matching v1's explicitly-not-persisted framing (spec
// section 17): nothing here saves a contradiction, and running this again
// may return a different set as the visitor's Reading Memory changes.
import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";
import { AtlasSessionExpiredError } from "./atlasQuestions";

const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-ai`;

export type AtlasContradictionStatus = "ok" | "no_memory" | "insufficient_material";

export type AtlasContradictionRelation =
  | "direct_contradiction"
  | "opposing_emphasis"
  | "competing_interpretation";

export interface AtlasContradictionEvidence {
  annotationId: string;
  workId: string;
  bookTitle: string | null;
  author: string | null;
  quotePreview: string;
}

export interface AtlasContradiction {
  evidenceA: AtlasContradictionEvidence;
  evidenceB: AtlasContradictionEvidence;
  relation: AtlasContradictionRelation;
  confidence: number;
  synthesis: string;
}

export interface AtlasContradictionsResult {
  status: AtlasContradictionStatus;
  contradictions: AtlasContradiction[];
  message: string | null;
}

interface AtlasContradictionsResponseBody {
  status: AtlasContradictionStatus;
  contradictions: AtlasContradiction[];
  message: string | null;
}

const NOT_AUTHENTICATED = "Не авторизован.";

// Re-exported so callers of this module don't also need to import from
// atlasQuestions.ts just to catch the same expired-session case (spec 15.C
// requires this feature surface an explicit session error too, never a
// silently empty Atlas -- reusing the one error class keeps that contract
// identical across both Atlas AI features rather than inventing a second
// one with the same meaning).
export { AtlasSessionExpiredError };

export async function findAtlasContradictions(signal?: AbortSignal): Promise<AtlasContradictionsResult> {
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
      body: JSON.stringify({ action: "atlas-contradictions" })
    });
  } catch (networkError) {
    console.error("atlas-contradictions network failure:", networkError);
    throw new Error("Не удалось связаться с Atlas. Проверьте соединение и попробуйте снова.");
  }

  if (response.status === 401) {
    throw new AtlasSessionExpiredError(NOT_AUTHENTICATED);
  }

  if (!response.ok) {
    // Never log response body content here -- privacy rules for Atlas AI
    // features (spec section 14 of Cross-Book Questions, carried over
    // here) apply to diagnostics too.
    console.error(`atlas-contradictions failed with status ${response.status}`);
    throw new Error("Не удалось получить ответ от Atlas.");
  }

  const body = (await response.json()) as AtlasContradictionsResponseBody;
  return {
    status: body.status,
    contradictions: Array.isArray(body.contradictions) ? body.contradictions : [],
    message: body.message
  };
}
