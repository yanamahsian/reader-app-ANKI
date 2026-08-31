// PAYMENTS & SUBSCRIPTION LIFECYCLE v1 (Paddle Billing) -- paddle-webhook.
//
// NEW, SEPARATE Edge Function (never inside omnia-ai -- instruction 11/35;
// supabase/functions/omnia-ai/index.ts is not touched by this task at all).
// This is the ONLY place in the entire system that ever grants, upgrades,
// downgrades, or ends a Paddle-sourced entitlement. A checkout-success
// frontend redirect, a Paddle plan/product NAME, or anything the browser
// says about itself is NEVER trusted as proof of payment -- only a request
// that (a) arrives here and (b) carries a Paddle-Signature this function
// itself verifies over the exact raw request bytes can ever reach that
// outcome (instruction 4).
//
// DEPLOYMENT REQUIREMENT -- verify_jwt = false (see supabase/config.toml):
// Paddle's own webhook delivery never carries a Supabase Authorization
// bearer JWT -- it carries only the Paddle-Signature header this function
// verifies itself. This is a gateway-level setting, separate from (and in
// addition to) the signature check below -- one controls who may reach
// this function's code at all, the other controls whether this function
// trusts what it receives.
//
// RAW-BODY SIGNATURE VERIFICATION -- THE ONE NON-NEGOTIABLE STEP:
// Verified against the official docs (developer.paddle.com/webhooks/about/
// signature-verification/, fetched during this task, not assumed from
// training knowledge):
//   * Header: `Paddle-Signature`, format `ts=<unix_seconds>;h1=<hex hmac>`.
//   * Signed string = `${ts}:${raw_request_body}` -- the EXACT raw bytes,
//     never a JSON.parse'd-then-re-stringified body (round-tripping through
//     JSON can reorder keys/change whitespace and silently break the
//     signature -- this is the well-documented "raw body bug" for Paddle
//     webhook integrations). req.text() is read ONCE, before any
//     req.json() call, and that exact string is what gets HMAC'd.
//   * Algorithm: HMAC-SHA256, hex-encoded, keyed with the notification
//     destination's own secret (PADDLE_WEBHOOK_SECRET, format
//     pdl_ntfset_...).
//   * A mutated raw body, a wrong/missing signature, or an unparseable
//     header ALWAYS returns 401 before this function makes a single
//     database call -- see verifyPaddleSignature below and its call site.
//
// EVENT SCOPE -- deliberately minimal (instruction 12), not "subscribe to
// everything": only the subscription lifecycle events this product
// actually needs to act on are handled. Verified against Paddle's own
// webhook event documentation (developer.paddle.com/webhooks/subscriptions/
// subscription-updated/) during this task:
//   subscription.created, subscription.activated, subscription.updated,
//   subscription.past_due, subscription.paused, subscription.resumed,
//   subscription.canceled.
// Paddle's own model has NO separate "subscription.expired" event --
// confirmed against developer.paddle.com/build/lifecycle/subscription-
// cancellation: a cancel-at-period-end subscription stays status='active'
// (with scheduled_change.action='cancel') right up until the paid period
// truly ends, at which point Paddle itself flips status to 'canceled' and
// fires subscription.canceled (or a subscription.updated carrying that new
// status). So "expired/ended" in this codebase's own terms IS Paddle's own
// 'canceled' status arriving via either event -- apply_paddle_subscription_
// event (see supabase/sql/paddle_subscription_lifecycle_v1.sql) is what
// actually decides access from `status`, not the event name. Any OTHER
// event type this function receives (e.g. a transaction.* event, should one
// ever be misconfigured onto this same destination) is acknowledged with
// 200 and otherwise ignored -- never a 4xx/5xx that would make Paddle retry
// something this function has no intention of ever acting on.
//
// IDENTITY -- never email, always the verified custom_data.anki_user_id
// this project's own paddle-checkout function set on the transaction (see
// that function). A missing or syntactically-malformed value is mapped to
// a null user id before ever reaching Postgres (a raw malformed string
// handed to a `uuid` RPC parameter would itself error at the PostgREST
// layer, before apply_paddle_subscription_event's own defensive checks
// ever ran) -- apply_paddle_subscription_event's own null/unknown-user
// branch then logs this safely with zero entitlement effect (instruction
// 13, §41 Identity B/C/D).
//
// ATOMICITY -- this function's entire job, once the signature is verified
// and the payload is sanity-checked, is exactly ONE call to
// apply_paddle_subscription_event (SECURITY DEFINER, one implicit
// transaction) -- never a sequence of independent REST writes that could
// leave billing_subscriptions/billing_webhook_events/entitlement_grants
// inconsistent if this function crashed partway through (instruction 26).
//
// SERVICE_ROLE JUSTIFICATION (instruction 27): this call uses the
// project's SERVICE_ROLE key specifically because, by the time it fires,
// the request has already passed a cryptographic signature check this
// function itself performed -- the one trusted, verified server-to-server
// path in this codebase where that is justified. SERVICE_ROLE never
// reaches the frontend from here or anywhere else.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Paddle-Signature",
};

const JSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  ...CORS_HEADERS,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

// Paddle's own SDKs default to a 5-second tolerance between the header's
// `ts` and receipt time (confirmed against the official docs fetched for
// this task). That is workable for a same-datacenter same-process check
// but is unrealistically tight for a real HTTP hop into a cold-startable
// Deno Edge Function plus its own processing time -- a deliberately wider
// (but still bounded, still replay-resistant) tolerance is used here
// instead. This is a considered deviation, not an oversight: it still
// rejects any signature whose timestamp is materially stale, which is the
// property that actually matters for replay protection.
const TIMESTAMP_TOLERANCE_SECONDS = 300;

const HANDLED_EVENT_TYPES = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.canceled",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PaddlePriceMapEntry {
  plan: "library" | "atlas" | "academy";
  billingInterval: "month" | "year";
}

// Server-owned, config-driven price_id -> (plan, interval) mapping --
// NEVER inferred from a client payload, a Paddle product/price NAME, or an
// amount (instruction 7). Read fresh per request (Deno.env.get is cheap
// and this keeps the function trivially testable without a module-load-
// time env dependency).
function buildPriceMap(): Map<string, PaddlePriceMapEntry> {
  const map = new Map<string, PaddlePriceMapEntry>();
  const add = (envVar: string, plan: PaddlePriceMapEntry["plan"], billingInterval: PaddlePriceMapEntry["billingInterval"]) => {
    const priceId = Deno.env.get(envVar);
    if (priceId) map.set(priceId, { plan, billingInterval });
  };
  add("PADDLE_LIBRARY_MONTHLY_PRICE_ID", "library", "month");
  add("PADDLE_LIBRARY_ANNUAL_PRICE_ID", "library", "year");
  add("PADDLE_ATLAS_MONTHLY_PRICE_ID", "atlas", "month");
  add("PADDLE_ATLAS_ANNUAL_PRICE_ID", "atlas", "year");
  add("PADDLE_ACADEMY_MONTHLY_PRICE_ID", "academy", "month");
  add("PADDLE_ACADEMY_ANNUAL_PRICE_ID", "academy", "year");
  return map;
}

// Constant-time comparison for the HMAC digest -- avoids leaking how many
// leading hex characters matched via response-time differences.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface SignatureCheckResult {
  ok: boolean;
  reason?: string;
}

// Verifies over the EXACT raw body string passed in -- the caller must
// have obtained this via req.text() and must not have parsed/re-serialized
// it first. Returns ok:false (never throws) for every failure mode --
// missing header, malformed header, missing secret, expired timestamp, or
// a mismatched digest -- so the caller can uniformly respond 401 with zero
// DB interaction in every case.
// CORRECTION (0013): the header can legitimately carry MORE THAN ONE `h1`
// component during Paddle's own secret rotation window (both the old and
// new destination secret's digest sent together so neither side of a
// rotation drops events) -- confirmed by the independent review of patch
// 0012, which found the previous `Map<string,string>` parse silently kept
// only the LAST `h1` and discarded any earlier one. A rotation-window
// delivery whose valid digest happened to be the FIRST `h1` (computed with
// the secret this function still has configured) would then be rejected as
// a forged signature. Every `h1` occurrence is now collected into an array
// and the expected digest is timing-safe-compared against EACH ONE --
// verification succeeds if ANY supplied `h1` matches, exactly mirroring
// what Paddle's own multi-secret rotation model requires.
async function verifyPaddleSignature(
  header: string | null,
  rawBody: string,
  secret: string,
): Promise<SignatureCheckResult> {
  if (!header) return { ok: false, reason: "missing_signature_header" };

  let ts: string | null = null;
  const h1Candidates: string[] = [];
  for (const segment of header.split(";")) {
    const eqIndex = segment.indexOf("=");
    if (eqIndex === -1) continue;
    const key = segment.slice(0, eqIndex).trim();
    const value = segment.slice(eqIndex + 1).trim();
    if (!key || !value) continue;
    if (key === "ts") ts = value;
    else if (key === "h1") h1Candidates.push(value);
  }

  if (!ts || h1Candidates.length === 0) return { ok: false, reason: "malformed_signature_header" };

  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber)) return { ok: false, reason: "malformed_timestamp" };

  const nowSeconds = Date.now() / 1000;
  if (Math.abs(nowSeconds - tsNumber) > TIMESTAMP_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }

  const expectedDigest = await hmacSha256Hex(secret, `${ts}:${rawBody}`);
  // Every candidate is compared -- never short-circuited on the first
  // mismatch in a way that would skip a later, valid one -- and every
  // comparison stays timing-safe individually.
  const matched = h1Candidates.some((candidate) => timingSafeEqual(expectedDigest, candidate.toLowerCase()));
  if (!matched) {
    return { ok: false, reason: "signature_mismatch" };
  }

  return { ok: true };
}

function normalizeUserId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    console.error("paddle-webhook misconfigured: missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/PADDLE_WEBHOOK_SECRET");
    return jsonResponse({ error: "webhook_misconfigured" }, 503);
  }

  // req.text() FIRST -- this exact string is what gets signature-checked
  // AND is the only thing ever JSON.parse'd below. No JSON.parse -> re-
  // stringify -> verify anywhere in this file.
  const rawBody = await req.text();

  const signatureHeader = req.headers.get("Paddle-Signature") ?? req.headers.get("paddle-signature");
  const signatureResult = await verifyPaddleSignature(signatureHeader, rawBody, webhookSecret);

  if (!signatureResult.ok) {
    // Zero DB interaction on an invalid signature, by construction -- this
    // is the first return path in the function and nothing above it
    // touches the database.
    console.error(`paddle-webhook: signature verification failed (${signatureResult.reason})`);
    return jsonResponse({ error: "invalid_signature" }, 401);
  }

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const eventId = normalizeString(envelope.event_id);
  const eventType = normalizeString(envelope.event_type);
  const occurredAtRaw = normalizeString(envelope.occurred_at);
  const data = envelope.data as Record<string, unknown> | undefined;

  if (!eventId || !eventType || !occurredAtRaw || !data || typeof data !== "object") {
    console.error("paddle-webhook: malformed event envelope (missing event_id/event_type/occurred_at/data)");
    return jsonResponse({ error: "malformed_envelope" }, 400);
  }

  // A verified-but-uninteresting event (should this destination ever end
  // up receiving one) is acknowledged and otherwise ignored -- never
  // retried, never written anywhere.
  if (!HANDLED_EVENT_TYPES.has(eventType)) {
    return jsonResponse({ status: "ignored_unhandled_event_type" }, 200);
  }

  const subscriptionId = normalizeString(data.id);
  const status = normalizeString(data.status);
  const customerId = normalizeString(data.customer_id);

  const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
  const firstItem = items[0] ?? {};
  const price = (firstItem.price as Record<string, unknown> | undefined) ?? {};
  const priceId = normalizeString(price.id);
  const productId =
    normalizeString(price.product_id) ??
    normalizeString((firstItem.product as Record<string, unknown> | undefined)?.id);

  const billingPeriod = (data.current_billing_period as Record<string, unknown> | undefined) ?? {};
  const currentPeriodStart = normalizeString(billingPeriod.starts_at);
  const currentPeriodEnd = normalizeString(billingPeriod.ends_at);

  const scheduledChange = data.scheduled_change as Record<string, unknown> | null | undefined;
  const cancelAtPeriodEnd = Boolean(scheduledChange && scheduledChange.action === "cancel");

  const cancelledAt = normalizeString((data as Record<string, unknown>).canceled_at);
  // Paddle's own model has no separate "ended_at" field distinct from a
  // canceled subscription's own canceled_at -- endedAt is populated only
  // once status has actually reached 'canceled', from canceled_at when
  // present, else falling back to this event's own occurred_at so the
  // reflection row still records a definite end time.
  const endedAt = status === "canceled" ? (cancelledAt ?? occurredAtRaw) : null;

  const customData = (data.custom_data as Record<string, unknown> | null | undefined) ?? {};
  const rawUserId = customData["anki_user_id"];
  const userId = normalizeUserId(rawUserId);

  if (!subscriptionId || !status || !priceId) {
    console.error("paddle-webhook: malformed subscription payload (missing id/status/price)");
    return jsonResponse({ error: "malformed_subscription_payload" }, 400);
  }

  const priceMap = buildPriceMap();
  const mapped = priceMap.get(priceId);

  // An unmapped price is deliberately still forwarded to the RPC (with
  // empty plan/interval strings) rather than short-circuited here -- the
  // RPC's own defense-in-depth check rejects it and records exactly one
  // 'ignored_unknown_plan' ledger row, the same single code path used for
  // every other "verified event, safely not actioned" outcome. No parallel
  // ignore-logic is duplicated in this function.
  const plan = mapped?.plan ?? "";
  const billingInterval = mapped?.billingInterval ?? "";

  let rpcResponse: Response;
  try {
    rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/apply_paddle_subscription_event`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_event_id: eventId,
        p_event_type: eventType,
        p_occurred_at: occurredAtRaw,
        p_user_id: userId,
        p_provider_customer_id: customerId,
        p_provider_subscription_id: subscriptionId,
        p_provider_price_id: priceId,
        p_provider_product_id: productId,
        p_plan: plan,
        p_billing_interval: billingInterval,
        p_status: status,
        p_current_period_start: currentPeriodStart,
        p_current_period_end: currentPeriodEnd,
        p_cancel_at_period_end: cancelAtPeriodEnd,
        p_cancelled_at: cancelledAt,
        p_ended_at: endedAt,
        p_raw_payload: envelope,
      }),
    });
  } catch (error) {
    console.error("paddle-webhook: apply_paddle_subscription_event request failed:", error instanceof Error ? error.message : String(error));
    // A genuine infra failure, not a validation outcome -- 500 so Paddle
    // retries this delivery later, unlike every "verified but safely
    // ignored" outcome above, which returns 200 on purpose.
    return jsonResponse({ error: "state_transition_unavailable" }, 500);
  }

  if (!rpcResponse.ok) {
    const bodyText = await rpcResponse.text().catch(() => "");
    console.error(`paddle-webhook: apply_paddle_subscription_event RPC failed with status ${rpcResponse.status}: ${bodyText}`);
    return jsonResponse({ error: "state_transition_failed" }, 500);
  }

  const result = await rpcResponse.json().catch(() => null);
  return jsonResponse({ status: "ok", result }, 200);
});
