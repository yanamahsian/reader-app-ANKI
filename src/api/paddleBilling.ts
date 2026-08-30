// PAYMENTS & SUBSCRIPTION LIFECYCLE v1 (Paddle Billing) -- the one shared,
// typed client-side layer SubscriptionView now goes through for anything
// billing-related. Same raw-fetch + publishable-key + bearer-token pattern
// every other authenticated API client in src/api/ already uses (see
// aiEntitlements.ts, atlasQuestions.ts) -- no @supabase/supabase-js here
// either, and no Paddle.js/checkout-overlay wiring lives in this file (that
// belongs to SubscriptionView/PlanCard themselves, which call
// createPaddleCheckout below to get a transaction id first).
//
// Two responsibilities, both purely typed transport -- nothing here
// decides who gets what plan (that truth lives exclusively in
// supabase/sql/paddle_subscription_lifecycle_v1.sql's
// apply_paddle_subscription_event, driven only by verified Paddle
// webhooks):
//
//   1. getMyBillingSnapshot() -- a typed client for the new read-only
//      get_my_billing_snapshot() RPC (auth.uid() only, no arguments),
//      used to render real plan/renewal/cancel-at-period-end state and to
//      decide whether "Manage subscription" should be offered.
//
//   2. createPaddleCheckout(plan, interval) -- a typed client for the new
//      paddle-checkout Edge Function. Returns a Paddle transaction id (and,
//      if Paddle also returned one, a hosted checkout URL) for
//      SubscriptionView to hand to Paddle's own Checkout overlay --
//      this function's own return value is NEVER treated as proof of
//      payment or used to grant a plan locally (see that component's own
//      post-checkout polling, which re-fetches getMyBillingSnapshot /
//      getMyEntitlementSnapshot instead of trusting this call's success).
import { getValidAccessToken, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "../auth/supabaseAuth";

export type BillingErrorKind = "auth_required" | "service_unavailable" | "invalid_request" | "generic";

export class BillingError extends Error {
  readonly kind: BillingErrorKind;

  constructor(kind: BillingErrorKind, message?: string) {
    super(message ?? `Billing error: ${kind}`);
    this.name = "BillingError";
    this.kind = kind;
  }
}

export function describeBillingErrorRu(kind: BillingErrorKind): string {
  switch (kind) {
    case "auth_required":
      return "Войдите в аккаунт, чтобы управлять подпиской.";
    case "service_unavailable":
      return "Сервис оплаты сейчас недоступен. Попробуйте снова чуть позже.";
    case "invalid_request":
      return "Не удалось оформить выбранный план.";
    case "generic":
      return "Не удалось выполнить запрос.";
  }
}

export type PaddlePlan = "library" | "atlas" | "academy";
export type PaddleInterval = "month" | "year";

function isPaddlePlan(value: unknown): value is PaddlePlan {
  return value === "library" || value === "atlas" || value === "academy";
}

function isPaddleInterval(value: unknown): value is PaddleInterval {
  return value === "month" || value === "year";
}

// ==========================================================================
// 1. get_my_billing_snapshot()
// ==========================================================================
const RPC_ENDPOINT = `${SUPABASE_URL}/rest/v1/rpc`;

export interface BillingSnapshot {
  hasSubscription: boolean;
  plan: PaddlePlan | null;
  billingInterval: PaddleInterval | null;
  // Paddle's own subscription status, passed through verbatim
  // (active/trialing/past_due/paused/canceled) -- deliberately not
  // narrowed to a fixed union here, matching the same "don't let an
  // unrecognised-but-real provider value make a well-formed response look
  // malformed" reasoning as EffectivePlan's OWN strictness on the
  // entitlement side stays limited to the four canonical plan ids, which
  // this schema fully controls -- status is Paddle's vocabulary, not
  // AN.KI's.
  status: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  provider: "paddle";
  manageSubscriptionAvailable: boolean;
}

function isNullOrString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

// Same discipline as aiEntitlements.ts's parseEntitlementSnapshot: a 200
// whose body doesn't actually match this RPC's own documented shape is
// treated exactly like a 503 (thrown as BillingError("service_unavailable")
// by the caller below) -- never partially trusted or silently coerced into
// a believable-but-fake "no subscription" state.
function parseBillingSnapshot(body: unknown): BillingSnapshot | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;

  if (typeof record.has_subscription !== "boolean") return null;
  if (record.plan !== null && !isPaddlePlan(record.plan)) return null;
  if (record.billing_interval !== null && !isPaddleInterval(record.billing_interval)) return null;
  if (!isNullOrString(record.status)) return null;
  if (!isNullOrString(record.renews_at)) return null;
  if (typeof record.cancel_at_period_end !== "boolean") return null;
  if (record.provider !== "paddle") return null;
  if (typeof record.manage_subscription_available !== "boolean") return null;

  return {
    hasSubscription: record.has_subscription,
    plan: record.plan as PaddlePlan | null,
    billingInterval: record.billing_interval as PaddleInterval | null,
    status: record.status as string | null,
    renewsAt: record.renews_at as string | null,
    cancelAtPeriodEnd: record.cancel_at_period_end,
    provider: "paddle",
    manageSubscriptionAvailable: record.manage_subscription_available
  };
}

// auth.uid()-only server side, same convention as getMyEntitlementSnapshot
// -- callers must gate on isAuthenticated themselves first and never call
// this for a guest.
export async function getMyBillingSnapshot(signal?: AbortSignal): Promise<BillingSnapshot> {
  const token = await getValidAccessToken();
  if (!token) throw new BillingError("auth_required");

  let response: Response;
  try {
    response = await fetch(`${RPC_ENDPOINT}/get_my_billing_snapshot`, {
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
    console.error("get_my_billing_snapshot network failure:", networkError);
    throw new BillingError("service_unavailable");
  }

  if (response.status === 401) {
    throw new BillingError("auth_required");
  }

  if (!response.ok) {
    console.error(`get_my_billing_snapshot failed with status ${response.status}`);
    throw new BillingError("service_unavailable");
  }

  let rawBody: unknown;
  try {
    rawBody = await response.json();
  } catch (parseError) {
    console.error("get_my_billing_snapshot returned an unparseable body:", parseError);
    throw new BillingError("service_unavailable");
  }

  const snapshot = parseBillingSnapshot(rawBody);
  if (!snapshot) {
    console.error("get_my_billing_snapshot returned a malformed body:", JSON.stringify(rawBody));
    throw new BillingError("service_unavailable");
  }

  return snapshot;
}

// ==========================================================================
// 2. paddle-checkout Edge Function
// ==========================================================================
const CHECKOUT_ENDPOINT = `${SUPABASE_URL}/functions/v1/paddle-checkout`;

export interface PaddleCheckoutResult {
  transactionId: string;
  checkoutUrl: string | null;
  plan: PaddlePlan;
  interval: PaddleInterval;
}

interface PaddleCheckoutResponseBody {
  status?: string;
  error?: string;
  message?: string;
  transactionId?: string;
  checkoutUrl?: string | null;
  plan?: string;
  interval?: string;
}

// Never accepts a userId argument -- the server derives identity solely
// from the caller's own session token (see paddle-checkout's own header
// comment). Requesting a checkout for "free" is a programmer error, not a
// real UI path -- PlanCard never renders a paid CTA for the Free tier -- so
// it is rejected the same way any other malformed request is, via
// PaddlePlan's own type.
export async function createPaddleCheckout(
  plan: PaddlePlan,
  interval: PaddleInterval,
  signal?: AbortSignal
): Promise<PaddleCheckoutResult> {
  const token = await getValidAccessToken();
  if (!token) throw new BillingError("auth_required");

  let response: Response;
  try {
    response = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      signal,
      body: JSON.stringify({ action: "checkout", plan, interval })
    });
  } catch (networkError) {
    if ((networkError as Error).name === "AbortError") throw networkError;
    console.error("paddle-checkout network failure:", networkError);
    throw new BillingError("service_unavailable");
  }

  if (response.status === 401) {
    throw new BillingError("auth_required");
  }

  if (!response.ok) {
    let body: PaddleCheckoutResponseBody | null = null;
    try {
      body = (await response.json()) as PaddleCheckoutResponseBody;
    } catch {
      body = null;
    }
    if (response.status === 400) {
      throw new BillingError("invalid_request", body?.message ?? undefined);
    }
    console.error(`paddle-checkout failed with status ${response.status}`);
    throw new BillingError("service_unavailable");
  }

  const body = (await response.json()) as PaddleCheckoutResponseBody;
  if (
    typeof body.transactionId !== "string" ||
    !body.transactionId ||
    !isPaddlePlan(body.plan) ||
    !isPaddleInterval(body.interval)
  ) {
    console.error("paddle-checkout returned a malformed body:", JSON.stringify(body));
    throw new BillingError("service_unavailable");
  }

  return {
    transactionId: body.transactionId,
    checkoutUrl: typeof body.checkoutUrl === "string" ? body.checkoutUrl : null,
    plan: body.plan,
    interval: body.interval
  };
}

// ==========================================================================
// 3. paddle-checkout Edge Function, action:"portal"
// ==========================================================================
// The single "Manage subscription" mechanism this codebase has (instruction
// 29) -- also what an already-subscribed visitor's Upgrade/change-plan CTA
// opens, per instruction 21-22's requirement that plan changes go through
// Paddle's own Customer Portal / subscription-update flow rather than a
// second, parallel checkout. Throws BillingError("invalid_request") with a
// distinguishable underlying reason when the visitor has no Paddle
// subscription at all yet (404 from the Edge Function) -- SubscriptionView
// is not expected to ever call this for a visitor whose billing snapshot
// already says manageSubscriptionAvailable: false, but this still fails
// closed and typed rather than crashing if it is.
interface PaddlePortalResponseBody {
  status?: string;
  error?: string;
  portalUrl?: string;
}

export async function createPaddleManagePortalSession(signal?: AbortSignal): Promise<string> {
  const token = await getValidAccessToken();
  if (!token) throw new BillingError("auth_required");

  let response: Response;
  try {
    response = await fetch(CHECKOUT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_PUBLISHABLE_KEY
      },
      signal,
      body: JSON.stringify({ action: "portal" })
    });
  } catch (networkError) {
    if ((networkError as Error).name === "AbortError") throw networkError;
    console.error("paddle-checkout (portal) network failure:", networkError);
    throw new BillingError("service_unavailable");
  }

  if (response.status === 401) {
    throw new BillingError("auth_required");
  }

  if (response.status === 404) {
    throw new BillingError("invalid_request", "no_subscription");
  }

  if (!response.ok) {
    console.error(`paddle-checkout (portal) failed with status ${response.status}`);
    throw new BillingError("service_unavailable");
  }

  const body = (await response.json()) as PaddlePortalResponseBody;
  if (typeof body.portalUrl !== "string" || !body.portalUrl) {
    console.error("paddle-checkout (portal) returned a malformed body:", JSON.stringify(body));
    throw new BillingError("service_unavailable");
  }

  return body.portalUrl;
}
