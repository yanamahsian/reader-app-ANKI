// SUBSCRIPTION & AI ENTITLEMENTS FOUNDATION v1: translate/explain now
// require a real signed-in visitor -- the server enforces this
// unconditionally via omnia-ai's consumeAiAllowance() gate regardless of
// what this client does, but this file adds the real Authorization
// header (previously these two calls were fully anonymous) and a local
// fast-path: with no local access token, there is no point making a
// network request that will only fail the same way server-side, so this
// throws the same typed AIEntitlementError("auth_required") locally
// instead.
import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";
import { AIEntitlementError, toAIEntitlementError } from "./aiEntitlements";

const AI_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-ai`;

interface TranslateResponse {
  translation: string;
}

interface ExplainResponse {
  answer: string;
}

async function callAI<T>(action: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {

  const token = await getValidAccessToken();
  if (!token) {
    throw new AIEntitlementError("auth_required");
  }

  let response: Response;
  try {
    response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      signal,
      body: JSON.stringify({ action, ...payload })
    });
  } catch (networkError) {
    // AbortError (the caller cancelled a superseded translate/explain
    // request) must keep propagating as-is -- readerEngine.ts's own
    // runTranslate/runExplain specifically check error.name for this and
    // must never see it repackaged as a generic failure.
    if ((networkError as Error).name === "AbortError") throw networkError;
    throw new Error("AI request failed");
  }

  if (!response.ok) {
    const entitlementError = await toAIEntitlementError(response);
    if (entitlementError.kind !== "generic") throw entitlementError;
    throw new Error("AI request failed");
  }

  return (await response.json()) as T;

}

export async function translateText(text: string, language: string, signal?: AbortSignal): Promise<string> {
  const result = await callAI<TranslateResponse>("translate", { text, language }, signal);
  return result.translation;
}

export async function explainText(text: string, language: string, signal?: AbortSignal): Promise<string> {
  const result = await callAI<ExplainResponse>("explain", { text, language }, signal);
  return result.answer;
}
