// PAYMENTS & SUBSCRIPTION LIFECYCLE v1 (Paddle Billing) -- paddle-checkout.
//
// NEW, SEPARATE Edge Function -- a single typed-action function (the
// alternative explicitly offered in instruction 15: "New Edge Function
// paddle-checkout, or one typed-action billing-api function") rather than
// a third folder/deploy target, since both actions below share the exact
// same authentication step and neither needs the SERVICE_ROLE key. Its
// two actions:
//   * action:"checkout" -- given a real, authenticated AN.KI visitor and a
//     {plan, interval} choice, creates a Paddle transaction the frontend
//     can open in Paddle's own Checkout overlay.
//   * action:"portal" -- given a real, authenticated visitor who already
//     has a Paddle subscription, creates a Paddle Customer Portal session
//     URL for cancellation, invoices, and payment-method management only.
//   * action:"change_subscription" -- CORRECTIVE-PASS ADDITION. Given a
//     real, authenticated visitor with an existing active subscription and
//     a {plan, interval} target, calls Paddle's general-availability
//     `PATCH /subscriptions/{id}` API to change its plan/interval. This
//     replaces the original 0012 design's assumption that the Customer
//     Portal itself could do plan changes -- an independent review found
//     that Portal-driven upgrade/downgrade is currently Paddle EARLY
//     ACCESS (requires product collections / special dashboard access) and
//     must not be depended on. See handleChangeSubscription below for the
//     full reasoning and the proration-mode policy.
// No action ever grants entitlement by itself -- only a verified
// paddle-webhook event does that (see that function and
// apply_paddle_subscription_event). checkout returns a transaction id;
// portal returns a portal URL; change_subscription returns only
// {status:"ok"}; SubscriptionView treats all three purely as "now go
// complete this with Paddle", never as proof anything already happened.
//
// AUTHENTICATION -- action-level, not gateway verify_jwt=true (instruction
// 15's explicit fallback: "verify_jwt=true if compatible, else action-level
// validation like omnia-ai"). This repository already has TWO different
// verify_jwt=false + do-it-yourself patterns for a function that still
// needs to require a real session:
//   * omnia-ai forwards the caller's own bearer token straight through to
//     a PostgREST RPC and trusts THAT endpoint's 401 to mean "invalid/
//     expired session" (see consumeAiAllowance in that file).
//   * omnia-library-catalog's handleWorkIdsLookup branch calls
//     supabase.auth.getUser(token) directly.
// This function follows the second pattern's underlying mechanism (asking
// Supabase Auth itself whether the token is a real, current session) but
// via a direct GoTrue REST call rather than pulling in @supabase/
// supabase-js, since that is the only thing this function would use the
// library for. GET {SUPABASE_URL}/auth/v1/user with the caller's own
// Authorization header (and the project's anon key, required by every
// Supabase Auth REST call) returns the authenticated user -- including
// their real `id` -- for a valid token, and a 401 for anything else
// (missing/expired/malformed/forged). Neither action ever accepts a user
// id from the request BODY at all -- there is no field for one -- so there
// is no path by which a guest or a malicious client could attach a paid
// checkout, or read a portal session, for an arbitrary other user
// (instruction 14, §37 Checkout A/F).
//
// PLAN/PRICE MAPPING (action:"checkout" only) -- server-owned and
// Sandbox-specific. The six active Sandbox price ids are audited constants
// in this function and paddle-webhook; they are public configuration, not
// secrets. The client sends only {plan, interval} (e.g. "atlas","year") --
// never a price_id -- so there is no
// way for a client payload to select an arbitrary Paddle price even
// though Paddle's own client-side Checkout SDK would technically accept
// one if handed one directly (instruction 15, §37 Checkout E). "free" is
// rejected outright: Free is not a Paddle product (instruction 7) and
// never reaches this function's mapping table.
//
// CUSTOM DATA (action:"checkout" only) -- the one and only place in this
// codebase that WRITES Paddle custom_data. Sets exactly
// `{ anki_user_id: <verified uuid> }` on the created transaction; Paddle's
// own documented behaviour (confirmed against developer.paddle.com/build/
// transactions/custom-data during this task) copies transaction
// custom_data onto the subscription created from it, and onto every
// future renewal transaction -- so this one write is what lets
// paddle-webhook later recover the correct AN.KI identity from every
// subsequent event for this subscription, with no email lookup anywhere
// in the chain.
//
// CUSTOMER LOOKUP (action:"portal" only) -- Paddle's own Customer Portal
// session API needs Paddle's own customer id, not this project's user id.
// Rather than this function holding a SERVICE_ROLE client just to read
// one column, it forwards the caller's own bearer token to the new
// get_my_paddle_customer_id() RPC (auth.uid()-only, see
// supabase/sql/paddle_subscription_lifecycle_v1.sql) -- same "forward the
// real token, let RLS/auth.uid() decide" pattern every other authenticated
// call in this codebase already uses. A visitor with no billing_
// subscriptions row at all (never subscribed) gets a clear "no_
// subscription" error, never a Paddle API call.
//
// SANDBOX-FIRST (instruction 5): this deployment is intentionally pinned
// to sandbox-api.paddle.com. Live Paddle uses a separate account/catalog and
// will require an explicit code/config rollout with live price ids; this
// Sandbox function cannot silently switch itself to production.
//
// SECRETS: PADDLE_API_KEY is read from the environment and used only in
// this function's own server-to-server calls to Paddle -- it is never
// echoed back in this function's response, logged, or reachable from the
// frontend bundle (instruction 5's "server API key/service role never
// reaches frontend").

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  ...CORS_HEADERS,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type Plan = "library" | "atlas" | "academy";
type Interval = "month" | "year";

function isPlan(value: unknown): value is Plan {
  return value === "library" || value === "atlas" || value === "academy";
}

function isInterval(value: unknown): value is Interval {
  return value === "month" || value === "year";
}

// 0014 SANDBOX GATE: price ids are server-owned configuration but are not
// secrets. Keep the six currently-active Sandbox ids in audited source so
// deployment needs only the real secrets (PADDLE_API_KEY and, for the
// webhook function, PADDLE_WEBHOOK_SECRET). Live Paddle has a separate
// catalog and will get a deliberate live mapping before production billing
// is enabled; this Sandbox function can never silently switch environments.
const SANDBOX_PRICE_IDS: Record<Plan, Record<Interval, string>> = {
  library: {
    month: "pri_01m1bdfve9y0eypfww3mvq1z2w",
    year: "pri_01m1bdnbxqzv2bbczyvyc8r3pq",
  },
  atlas: {
    month: "pri_01m1bey5pzb7k4c5pgc3t8x9jb",
    year: "pri_01m1bf3jkjev2ffawnhvr9qews",
  },
  academy: {
    month: "pri_01m1bf97e8sj4szp0sr2hk449h",
    year: "pri_01m1bfehx66qcx8spr3d5mzhfp",
  },
};

function resolvePriceId(plan: Plan, interval: Interval): string {
  return SANDBOX_PRICE_IDS[plan][interval];
}

function paddleApiBaseUrl(): string {
  return "https://sandbox-api.paddle.com";
}

interface AuthenticatedUser {
  id: string;
}

async function getAuthenticatedUser(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
): Promise<AuthenticatedUser | null> {
  let response: Response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
      },
    });
  } catch (error) {
    console.error("paddle-checkout: auth/v1/user request failed:", error instanceof Error ? error.message : String(error));
    return null;
  }

  if (!response.ok) return null;

  let body: Record<string, unknown>;
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  const id = body.id;
  return typeof id === "string" && id ? { id } : null;
}

async function handleCheckout(user: AuthenticatedUser, body: Record<string, unknown>): Promise<Response> {
  const paddleApiKey = Deno.env.get("PADDLE_API_KEY");

  // ONLY {plan, interval} are ever read from the client -- deliberately no
  // price_id field, no user_id field, no customer_id field exists in this
  // schema at all (§37 Checkout D/E/F).
  const plan = body.plan;
  const interval = body.interval;

  if (!isPlan(plan)) {
    return jsonResponse({ status: "error", error: "invalid_plan", message: "plan must be library, atlas, or academy" }, 400);
  }
  // Academy remains visible as the future top tier, but recurring Academy
  // checkout is intentionally disabled until the Academy product layer is live.
  if (plan === "academy") {
    return jsonResponse({ status: "error", error: "plan_not_available" }, 409);
  }
  if (!isInterval(interval)) {
    return jsonResponse({ status: "error", error: "invalid_interval", message: "interval must be month or year" }, 400);
  }

  const priceId = resolvePriceId(plan, interval);
  if (!priceId || !paddleApiKey) {
    // Missing price-id/API-key configuration is a deploy-time
    // misconfiguration, not a client error -- honest 503 (instruction 33:
    // existing Free/product functionality must keep working; only the
    // paid checkout path degrades, with a message the frontend can show
    // as "Payment service temporarily unavailable").
    console.error(`paddle-checkout misconfigured: missing price id or PADDLE_API_KEY for ${plan}/${interval}`);
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  let paddleResponse: Response;
  try {
    paddleResponse = await fetch(`${paddleApiBaseUrl()}/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        // The one and only place custom_data is ever written -- see this
        // file's own header comment on why this is sufficient for
        // paddle-webhook to later recover identity without an email
        // lookup.
        custom_data: { anki_user_id: user.id },
      }),
    });
  } catch (error) {
    console.error("paddle-checkout: Paddle transaction request failed:", error instanceof Error ? error.message : String(error));
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  if (!paddleResponse.ok) {
    const errorText = await paddleResponse.text().catch(() => "");
    // The real Paddle error detail is logged server-side only -- never
    // echoed back to the browser, which could otherwise leak Paddle
    // account/config internals to an unauthenticated-adjacent surface.
    console.error(`paddle-checkout: Paddle API returned ${paddleResponse.status}: ${errorText}`);
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  let paddleBody: Record<string, unknown>;
  try {
    paddleBody = (await paddleResponse.json()) as Record<string, unknown>;
  } catch {
    console.error("paddle-checkout: Paddle API returned an unparseable body");
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  const data = (paddleBody.data as Record<string, unknown> | undefined) ?? {};
  const transactionId = typeof data.id === "string" ? data.id : null;
  const checkout = data.checkout as Record<string, unknown> | undefined;
  const checkoutUrl = checkout && typeof checkout.url === "string" ? checkout.url : null;

  if (!transactionId) {
    console.error("paddle-checkout: Paddle API response missing transaction id");
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  // Only what the frontend needs to open Paddle's own Checkout overlay
  // (Paddle.Checkout.open({ transactionId })) or redirect to a hosted
  // checkout URL -- never the raw Paddle API response, which could
  // otherwise carry more account/customer detail than this endpoint
  // should expose.
  return jsonResponse({
    status: "ok",
    transactionId,
    checkoutUrl,
    plan,
    interval,
  });
}

// PLAN RANK -- used only to decide upgrade vs downgrade direction for the
// proration-mode choice below. Free is never a Paddle plan (see this
// file's header) so it never appears here; a rank table is enough because
// there are only three paid tiers and their ordering never changes at
// runtime.
const PLAN_RANK: Record<Plan, number> = { library: 1, atlas: 2, academy: 3 };

// PRORATION MODE -- corrective-pass fix (independent review, blocker #3):
// the Paddle Customer Portal's own plan-change UI is currently Early
// Access (requires product collections / special dashboard access) and
// this codebase must not depend on it. This handler instead calls the
// general-availability `PATCH /subscriptions/{id}` API directly, and must
// choose an explicit `proration_billing_mode` (Paddle requires one; there
// is no server-side default this function can silently rely on).
//
// v1 semantics, derived from Paddle's own documented constraints (verified
// via developer.paddle.com during this task, not guessed):
//   * Upgrade, same billing interval -> "prorated_immediately" (explicitly
//     specified by the review: charge/credit the difference right away).
//   * Downgrade, same billing interval -> "prorated_next_billing_period"
//     (the review asked for "an intentional billing semantic" for
//     downgrades; this defers the lower price to the next renewal instead
//     of issuing an immediate credit, which is the standard SaaS-friendly
//     downgrade behaviour and is a real, documented Paddle mode).
//   * ANY billing-interval change (month<->year), regardless of plan rank
//     direction -- ALWAYS "prorated_immediately". This is not a choice:
//     Paddle's documentation states `prorated_next_billing_period` is not
//     a valid mode for billing-frequency changes, so the same-interval
//     downgrade rule above cannot be applied when the interval also
//     changes; `prorated_immediately` is valid for both frequency and
//     plan changes, so it is the only mode usable for that combination.
function chooseProrationMode(
  currentStatus: string,
  currentPlan: Plan,
  currentInterval: Interval,
  targetPlan: Plan,
  targetInterval: Interval,
): "do_not_bill" | "prorated_immediately" | "prorated_next_billing_period" {
  // Paddle requires do_not_bill while a subscription is trialing. The item
  // change itself still applies; no charge is created during the trial.
  if (currentStatus === "trialing") return "do_not_bill";
  if (targetInterval !== currentInterval) return "prorated_immediately";
  // `prorated_next_billing_period` defers only the resulting proration
  // charge/credit to the next renewal; it does NOT defer the item/plan
  // replacement itself.
  return PLAN_RANK[targetPlan] >= PLAN_RANK[currentPlan]
    ? "prorated_immediately"
    : "prorated_next_billing_period";
}

// ACTION: "change_subscription" -- corrective-pass addition. Changes the
// PLAN and/or INTERVAL of the caller's own EXISTING active Paddle
// subscription, replacing the Early-Access Customer-Portal plan-change
// flow the original 0012 patch mistakenly relied on. Input is ONLY
// {plan, interval} -- exactly like action:"checkout" -- never a
// subscription_id or price_id from the client (same §37 Checkout D/E/F
// reasoning as handleCheckout: the server alone decides which Paddle
// objects are touched, driven only by the caller's own verified identity).
//
// This function NEVER mutates entitlement_grants or billing_subscriptions
// itself. A successful PATCH here only means Paddle has accepted the
// change; the actual plan/interval AN.KI grants the user is decided solely
// by the resulting `subscription.updated` webhook once paddle-webhook
// verifies and applies it via the existing, unmodified
// apply_paddle_subscription_event RPC. This mirrors handleCheckout's own
// "this endpoint never grants anything by itself" contract.
async function handleChangeSubscription(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const paddleApiKey = Deno.env.get("PADDLE_API_KEY");

  const targetPlan = body.plan;
  const targetInterval = body.interval;

  if (!isPlan(targetPlan)) {
    return jsonResponse({ status: "error", error: "invalid_plan", message: "plan must be library, atlas, or academy" }, 400);
  }
  if (targetPlan === "academy") {
    return jsonResponse({ status: "error", error: "plan_not_available" }, 409);
  }
  if (!isInterval(targetInterval)) {
    return jsonResponse({ status: "error", error: "invalid_interval", message: "interval must be month or year" }, 400);
  }

  const targetPriceId = resolvePriceId(targetPlan, targetInterval);
  if (!targetPriceId || !paddleApiKey) {
    console.error(`paddle-checkout misconfigured: missing price id or PADDLE_API_KEY for ${targetPlan}/${targetInterval}`);
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  // Forwards the caller's OWN token -- get_my_active_paddle_subscription()
  // is auth.uid()-only (see supabase/sql/paddle_subscription_lifecycle_v1.
  // sql, section 6), so this can never read or change another visitor's
  // subscription. This is the ONLY source of the Paddle subscription id
  // this handler ever uses -- never a client-supplied id.
  let rpcResponse: Response;
  try {
    rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_my_active_paddle_subscription`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error("paddle-checkout: get_my_active_paddle_subscription request failed:", error instanceof Error ? error.message : String(error));
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  if (rpcResponse.status === 401) {
    return jsonResponse({ status: "error", error: "auth_required" }, 401);
  }
  if (!rpcResponse.ok) {
    console.error(`paddle-checkout: get_my_active_paddle_subscription RPC failed with status ${rpcResponse.status}`);
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  const snapshot = await rpcResponse.json().catch(() => null) as Record<string, unknown> | null;
  const subscriptionId = snapshot && typeof snapshot.subscription_id === "string" ? snapshot.subscription_id : null;
  const currentPlan = snapshot && isPlan(snapshot.plan) ? snapshot.plan : null;
  const currentInterval = snapshot && isInterval(snapshot.billing_interval) ? snapshot.billing_interval : null;
  const currentStatus = snapshot && typeof snapshot.status === "string" ? snapshot.status : null;
  const cancelAtPeriodEnd = Boolean(snapshot?.cancel_at_period_end);
  const scheduledChangeAction = snapshot && typeof snapshot.scheduled_change_action === "string"
    ? snapshot.scheduled_change_action
    : null;

  if (!subscriptionId || !currentPlan || !currentInterval || !currentStatus) {
    // No active subscription to change -- e.g. a Free visitor, or one
    // whose prior subscription already ended. This action never falls
    // back to creating a new checkout; the frontend already has
    // action:"checkout" for that separate case.
    return jsonResponse({ status: "error", error: "no_active_subscription" }, 404);
  }

  if (currentPlan === targetPlan && currentInterval === targetInterval) {
    return jsonResponse({ status: "error", error: "already_on_plan" }, 400);
  }

  if (currentStatus === "past_due") {
    return jsonResponse({ status: "error", error: "payment_recovery_required" }, 409);
  }

  if (cancelAtPeriodEnd || scheduledChangeAction) {
    return jsonResponse({ status: "error", error: "scheduled_change_active" }, 409);
  }

  const prorationBillingMode = chooseProrationMode(
    currentStatus,
    currentPlan,
    currentInterval,
    targetPlan,
    targetInterval,
  );

  let paddleResponse: Response;
  try {
    paddleResponse = await fetch(`${paddleApiBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ price_id: targetPriceId, quantity: 1 }],
        proration_billing_mode: prorationBillingMode,
      }),
    });
  } catch (error) {
    console.error("paddle-checkout: Paddle subscription PATCH request failed:", error instanceof Error ? error.message : String(error));
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  if (!paddleResponse.ok) {
    const errorText = await paddleResponse.text().catch(() => "");
    console.error(`paddle-checkout: Paddle subscription PATCH returned ${paddleResponse.status}: ${errorText}`);
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  // Deliberately does not read or return the Paddle response body -- this
  // action's only job is "ask Paddle to change the subscription"; the
  // fields AN.KI actually grants come only from the subsequent verified
  // webhook, never from trusting this PATCH's own 200 (same
  // never-trust-the-client-leg principle as checkout-success redirects,
  // instruction 6).
  return jsonResponse({ status: "ok" });
}

async function handlePortal(
  supabaseUrl: string,
  anonKey: string,
  authorization: string,
): Promise<Response> {
  const paddleApiKey = Deno.env.get("PADDLE_API_KEY");
  if (!paddleApiKey) {
    console.error("paddle-checkout misconfigured: missing PADDLE_API_KEY for portal action");
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  // Forwards the caller's OWN token -- get_my_paddle_customer_id() is
  // auth.uid()-only, so this can never read another visitor's customer id
  // (same pattern as consumeAiAllowance's own forwarded-token RPC call).
  let rpcResponse: Response;
  try {
    rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/get_my_paddle_customer_id`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error("paddle-checkout: get_my_paddle_customer_id request failed:", error instanceof Error ? error.message : String(error));
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  if (rpcResponse.status === 401) {
    return jsonResponse({ status: "error", error: "auth_required" }, 401);
  }
  if (!rpcResponse.ok) {
    console.error(`paddle-checkout: get_my_paddle_customer_id RPC failed with status ${rpcResponse.status}`);
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  const customerId = await rpcResponse.json().catch(() => null);
  if (typeof customerId !== "string" || !customerId) {
    return jsonResponse({ status: "error", error: "no_subscription" }, 404);
  }

  let paddleResponse: Response;
  try {
    paddleResponse = await fetch(`${paddleApiBaseUrl()}/customers/${encodeURIComponent(customerId)}/portal-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
  } catch (error) {
    console.error("paddle-checkout: Paddle portal-sessions request failed:", error instanceof Error ? error.message : String(error));
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  if (!paddleResponse.ok) {
    const errorText = await paddleResponse.text().catch(() => "");
    console.error(`paddle-checkout: Paddle portal-sessions API returned ${paddleResponse.status}: ${errorText}`);
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  let paddleBody: Record<string, unknown>;
  try {
    paddleBody = (await paddleResponse.json()) as Record<string, unknown>;
  } catch {
    console.error("paddle-checkout: Paddle portal-sessions API returned an unparseable body");
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  const data = (paddleBody.data as Record<string, unknown> | undefined) ?? {};
  const urls = data.urls as Record<string, unknown> | undefined;
  const general = urls?.general as Record<string, unknown> | undefined;
  const portalUrl = general && typeof general.overview === "string" ? general.overview : null;

  if (!portalUrl) {
    console.error("paddle-checkout: Paddle portal-sessions response missing urls.general.overview");
    return jsonResponse({ status: "error", error: "checkout_service_unavailable" }, 503);
  }

  // Only the one authenticated link the frontend needs -- never the raw
  // Paddle response, which may carry per-subscription deep links and other
  // account detail this endpoint has no reason to expose.
  return jsonResponse({ status: "ok", portalUrl });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    console.error("paddle-checkout misconfigured: missing SUPABASE_URL/SUPABASE_ANON_KEY");
    return jsonResponse({ error: "checkout_service_unavailable" }, 503);
  }

  // GUEST REJECTED HERE, UNCONDITIONALLY, FOR BOTH ACTIONS (§37 Checkout
  // A): no Authorization header, or a header getAuthenticatedUser cannot
  // resolve to a real user, both end the request before any Paddle API
  // call is ever made.
  const authorization = req.headers.get("Authorization") ?? req.headers.get("authorization");
  if (!authorization) {
    return jsonResponse({ status: "error", error: "auth_required" }, 401);
  }

  const user = await getAuthenticatedUser(supabaseUrl, anonKey, authorization);
  if (!user) {
    return jsonResponse({ status: "error", error: "auth_required" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return jsonResponse({ status: "error", error: "invalid_request", message: "Request body must be JSON" }, 400);
    }
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonResponse({ status: "error", error: "invalid_request" }, 400);
  }

  const action = body.action;

  if (action === "portal") {
    return await handlePortal(supabaseUrl, anonKey, authorization);
  }

  // Corrective-pass addition -- see handleChangeSubscription's own header
  // comment for why this replaces the Early-Access Customer-Portal
  // plan-change flow instead of extending handlePortal.
  if (action === "change_subscription") {
    return await handleChangeSubscription(supabaseUrl, anonKey, authorization, body);
  }

  // "checkout" is also the default when `action` is omitted, matching
  // this function's pre-typed-action shape so nothing else in this file
  // needs to change if action ever stops being sent (it is always sent by
  // src/api/paddleBilling.ts, but this keeps the contract forgiving rather
  // than brittle).
  if (action === "checkout" || action === undefined) {
    return await handleCheckout(user, body);
  }

  return jsonResponse({ status: "error", error: "invalid_action" }, 400);
});
