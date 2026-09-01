import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";
import { AIEntitlementError, toAIEntitlementError } from "./aiEntitlements";

const REVEAL_ENDPOINT = `${SUPABASE_URL}/functions/v1/omnia-reveal`;

export interface RevealRequest {
  text: string;
  language: string;
  contextBefore: string;
  book: {
    title: string;
    author: string | null;
    year: string | null;
    sourceLanguage: string | null;
    chapterTitle: string | null;
    pageIndex: number;
    totalPages: number;
  };
}

interface RevealResponse {
  answer: string;
}

export async function revealPassage(input: RevealRequest, signal?: AbortSignal): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new AIEntitlementError("auth_required");

  let response: Response;
  try {
    response = await fetch(REVEAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      signal,
      body: JSON.stringify(input)
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error("Reveal request failed");
  }

  if (!response.ok) {
    const entitlementError = await toAIEntitlementError(response);
    if (entitlementError.kind !== "generic") throw entitlementError;
    throw new Error("Reveal request failed");
  }

  const result = (await response.json()) as RevealResponse;
  if (!result.answer?.trim()) throw new Error("Reveal response was empty");
  return result.answer.trim();
}
