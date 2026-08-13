const AI_ENDPOINT =
  "https://prknybetxirzbzkvmovw.supabase.co/functions/v1/omnia-ai";

interface TranslateResponse {
  translation: string;
}

interface ExplainResponse {
  answer: string;
}

async function callAI<T>(action: string, payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {

  const response = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal,
    body: JSON.stringify({ action, ...payload })
  });

  if (!response.ok) {
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
