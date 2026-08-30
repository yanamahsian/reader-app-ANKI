// SUBSCRIPTION & AI ENTITLEMENTS FOUNDATION v1: the one shared, typed
// client-side layer every AI-cost-controlled request now goes through.
//
// Two responsibilities, both purely classificatory -- nothing here
// enforces anything, computes a plan, or duplicates the database's own
// limit logic (that truth lives exclusively in
// supabase/sql/ai_entitlements_foundation_v1.sql and the Edge Function's
// consumeAiAllowance() helper, which forwards the caller's own token to
// the consume_ai_allowance RPC and classifies its result):
//
//   1. AIEntitlementError / AIEntitlementErrorKind -- a stable,
//      non-string discriminant for the four typed HTTP responses the
//      Edge Function can now return for a costly AI action (401
//      auth_required, 429 ai_monthly_limit_reached, 429
//      ai_hourly_limit_reached, 503 entitlement_service_unavailable).
//      `kind` is the discriminant callers switch on -- never a Russian
//      message string, which stays a per-feature UI concern (Reader and
//      Atlas each choose their own wording via describeAIEntitlementErrorRu
//      below, or their own copy, as they already did for session-expired
//      errors).
//
//   2. getMyEntitlementSnapshot() -- a typed client for the new read-only
//      get_my_entitlement_snapshot() RPC (auth.uid() only, no arguments),
//      used by SubscriptionView to show the visitor's real effective plan
//      and AI usage instead of the previous hardcoded "Free is current".
//
// Same raw-fetch + publishable-key + bearer-token pattern every other
// authenticated API client in src/api/ already uses (see
// atlasQuestions.ts, thoughtThreads.ts) -- no @supabase/supabase-js here
// either.
import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

export type AIEntitlementErrorKind =
  | "auth_required"
  | "monthly_limit_reached"
  | "hourly_limit_reached"
  | "service_unavailable"
  | "generic";

export interface AIEntitlementErrorOptions {
  plan?: string | null;
  bucket?: string | null;
  resetAt?: string | null;
  message?: string;
}

// The discriminant a caller should switch on is `kind` -- never
// `message` or `error.message`, which is only ever an English fallback
// for logging. Feature UIs (readerEngine.ts, the Atlas Sections) pick
// their own Russian copy per kind, either via describeAIEntitlementErrorRu
// below or their own local wording.
export class AIEntitlementError extends Error {
  readonly kind: AIEntitlementErrorKind;
  readonly plan: string | null;
  readonly bucket: string | null;
  readonly resetAt: string | null;

  constructor(kind: AIEntitlementErrorKind, options?: AIEntitlementErrorOptions) {
    super(options?.message ?? `AI entitlement error: ${kind}`);
    this.name = "AIEntitlementError";
    this.kind = kind;
    this.plan = options?.plan ?? null;
    this.bucket = options?.bucket ?? null;
    this.resetAt = options?.resetAt ?? null;
  }
}

interface AIEntitlementResponseBody {
  status?: string;
  error?: string;
  plan?: string;
  bucket?: string;
  resetAt?: string;
  message?: string;
}

// Maps the Edge Function's own typed error payload (spec: 401
// {error:"auth_required"}, 429 {error:"ai_monthly_limit_reached"}, 429
// {error:"ai_hourly_limit_reached"}, 503
// {error:"entitlement_service_unavailable"}) onto a client-side kind. Any
// response this function doesn't recognize -- wrong shape, an unrelated
// 4xx/5xx, a real provider/network failure -- classifies as "generic":
// this must never silently relabel a genuine bug as a fake entitlement
// state, and callers already have their own generic-failure handling to
// fall back to.
export function classifyAIEntitlementResponse(
  status: number,
  body: AIEntitlementResponseBody | null
): AIEntitlementErrorKind {
  if (status === 401 && body?.error === "auth_required") return "auth_required";
  if (status === 429 && body?.error === "ai_monthly_limit_reached") return "monthly_limit_reached";
  if (status === 429 && body?.error === "ai_hourly_limit_reached") return "hourly_limit_reached";
  if (status === 503 && body?.error === "entitlement_service_unavailable") return "service_unavailable";
  return "generic";
}

// Builds an AIEntitlementError from a non-ok fetch Response, reading its
// JSON body (if any) to classify it. Always resolves -- a body that
// isn't valid JSON, or isn't the expected shape, simply classifies as
// "generic" rather than throwing a second, unrelated error out of this
// helper itself. Uses response.clone() so the original response body
// remains readable by the caller if it wants to log it separately.
export async function toAIEntitlementError(response: Response): Promise<AIEntitlementError> {
  let body: AIEntitlementResponseBody | null = null;
  try {
    body = (await response.clone().json()) as AIEntitlementResponseBody;
  } catch {
    body = null;
  }
  const kind = classifyAIEntitlementResponse(response.status, body);
  return new AIEntitlementError(kind, {
    plan: body?.plan ?? null,
    bucket: body?.bucket ?? null,
    resetAt: body?.resetAt ?? null
  });
}

// Shared Russian copy per entitlement kind -- deliberately generic
// enough to read correctly from either Reader (Translate/Explain) or
// Atlas (Ask/Contradictions/Unfinished Lines); a feature is free to use
// its own wording instead where a more specific sentence reads better
// (this is a convenience default, not a mandated string).
export function describeAIEntitlementErrorRu(kind: AIEntitlementErrorKind): string {
  switch (kind) {
    case "auth_required":
      return "Войдите в аккаунт, чтобы воспользоваться этой функцией.";
    case "monthly_limit_reached":
      return "Месячный лимит AI-запросов на вашем плане исчерпан. Он обновится в начале следующего месяца.";
    case "hourly_limit_reached":
      return "Слишком много запросов подряд. Попробуйте снова немного позже.";
    case "service_unavailable":
      return "Сервис AI сейчас недоступен. Попробуйте снова чуть позже.";
    case "generic":
      return "Не удалось выполнить запрос.";
  }
}

const RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc`;

export interface AIBucketSnapshot {
  used: number;
  monthlyLimit: number | null;
  resetAt: string | null;
}

export type EffectivePlan = "free" | "library" | "atlas" | "academy";

export interface EntitlementSnapshot {
  effectivePlan: EffectivePlan;
  aiTierName: string;
  readerAi: AIBucketSnapshot;
  atlasAi: AIBucketSnapshot;
}

function isEffectivePlan(value: unknown): value is EffectivePlan {
  return value === "free" || value === "library" || value === "atlas" || value === "academy";
}

// CORRECTION (0011): a finite, non-negative number check for `used` and
// (when not null) `monthly_limit` -- rejects NaN/Infinity/negative/
// non-number values a malformed or tampered response body could carry.
function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNullOrString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseAIBucketSnapshot(value: unknown): AIBucketSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const bucket = value as Record<string, unknown>;
  if (!isFiniteNonNegativeNumber(bucket.used)) return null;
  if (bucket.monthly_limit !== null && !isFiniteNonNegativeNumber(bucket.monthly_limit)) return null;
  if (!isNullOrString(bucket.reset_at)) return null;
  return {
    used: bucket.used,
    monthlyLimit: bucket.monthly_limit as number | null,
    resetAt: bucket.reset_at as string | null
  };
}

// CORRECTION (0011) -- BLOCKER FIX: this used to fall back to "free" for
// any effective_plan value it didn't recognize. That is wrong. The
// server-side resolver (effective_plan_for_user) ALREADY returns "free"
// itself whenever a real, authenticated visitor has no active grant --
// so a well-formed, successful RPC response can never legitimately carry
// anything other than one of the 4 real plan ids. An unrecognized or
// malformed value here means the response itself is broken (wrong RPC,
// stale/incompatible client, tampered payload, a future plan id this
// build doesn't know about yet) -- a data-contract failure, not a signal
// that this visitor is on Free. Treating it as Free would let a
// malformed 200 respond as believable, silently-wrong data instead of
// the honest, visible "couldn't load your plan" state SubscriptionView
// already has (status:"error" -> zero cards marked current). Same
// reasoning applies to every other field below: a 200 whose body doesn't
// actually match the RPC's own documented shape is treated exactly like
// a 503, never partially trusted.
function parseEntitlementSnapshot(body: unknown): EntitlementSnapshot | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;

  if (!isEffectivePlan(record.effective_plan)) return null;
  if (typeof record.ai_tier_name !== "string") return null;

  const readerAi = parseAIBucketSnapshot(record.reader_ai);
  if (!readerAi) return null;

  const atlasAi = parseAIBucketSnapshot(record.atlas_ai);
  if (!atlasAi) return null;

  return {
    effectivePlan: record.effective_plan,
    aiTierName: record.ai_tier_name,
    readerAi,
    atlasAi
  };
}

// Loads the visitor's own real effective plan and current AI usage.
// auth.uid()-only server side -- there is no id parameter to pass, and
// none of this ever runs for a guest (callers must gate on
// isAuthenticated themselves first, same convention as every other
// personal-data fetch in this app -- see HomePersonalSection.tsx).
export async function getMyEntitlementSnapshot(signal?: AbortSignal): Promise<EntitlementSnapshot> {
  const token = await getValidAccessToken();
  if (!token) throw new AIEntitlementError("auth_required");

  let response: Response;
  try {
    response = await fetch(`${RPC_ENDPOINT}/get_my_entitlement_snapshot`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      signal,
      body: JSON.stringify({})
    });
  } catch (networkError) {
    if ((networkError as Error).name === "AbortError") throw networkError;
    console.error("get_my_entitlement_snapshot network failure:", networkError);
    throw new AIEntitlementError("service_unavailable");
  }

  if (response.status === 401) {
    throw new AIEntitlementError("auth_required");
  }

  if (!response.ok) {
    console.error(`get_my_entitlement_snapshot failed with status ${response.status}`);
    throw new AIEntitlementError("service_unavailable");
  }

  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch (parseError) {
    console.error("get_my_entitlement_snapshot returned an unparseable body:", parseError);
    throw new AIEntitlementError("service_unavailable");
  }

  const snapshot = parseEntitlementSnapshot(rawBody);
  if (!snapshot) {
    // CORRECTION (0011): a malformed 200 is a server/data-contract
    // failure, classified and handled identically to a 503 -- never
    // silently coerced into a believable (but fake) Free snapshot.
    console.error("get_my_entitlement_snapshot returned a malformed body:", JSON.stringify(rawBody));
    throw new AIEntitlementError("service_unavailable");
  }

  return snapshot;
}
