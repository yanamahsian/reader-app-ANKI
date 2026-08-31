// PAYMENTS & SUBSCRIPTION LIFECYCLE v1 (Paddle Billing) -- CORRECTIVE PASS.
//
// Real Paddle.js v2 client-side integration -- the original 0012 patch
// never loaded Paddle.js at all and instead did a full-page
// `window.location.href = checkoutUrl` navigation to the `checkout.url`
// Paddle's transaction API returned. An independent review found this
// insufficient: per Paddle's own documentation (developer.paddle.com,
// verified during this task, not guessed), that URL is the merchant's
// configured "default payment link" plus a `?_ptxn=<transaction id>` query
// parameter -- a page Paddle expects to ALREADY have Paddle.js loaded and
// initialized on it, which then auto-detects `_ptxn` and opens Checkout.
// AN.KI never built or loaded Paddle.js on any page at all, so that
// redirect could land on a page with no working checkout.
//
// This file is the single place Paddle.js is loaded, initialized, and
// driven from -- exactly once per page load, regardless of how many
// components need it. Two responsibilities:
//
//   1. ensurePaddleInitialized() -- idempotently injects the Paddle.js v2
//      script tag, then calls Paddle.Environment.set(...) and
//      Paddle.Initialize({token, eventCallback}) exactly once. Called from
//      App's own root mount effect (never gated on which `view` is
//      showing) -- this is what makes AN.KI's single entry point also
//      correctly serve as Paddle's configured "default payment link"
//      target for the `_ptxn` auto-detect case (e.g. a payment-method-
//      update link from a Paddle dunning email lands here with Paddle.js
//      already initialized, even on a visitor's very first page load).
//
//   2. openPaddleCheckout(transactionId) -- opens Paddle's own Checkout
//      OVERLAY for an already-created transaction id via
//      Paddle.Checkout.open({transactionId, settings:{successUrl}}) --
//      the review's own suggested "cleaner for the current SPA"
//      alternative to a full-page redirect, since AN.KI has no real router
//      to send a returning visitor to a meaningful "/subscription" path
//      (confirmed: no such route exists anywhere in App.tsx, only `view`
//      React state). The overlay never navigates away from the SPA at
//      all, so there is no successUrl round-trip needed for the normal
//      case; successUrl is still set below, purely as Paddle's documented
//      fallback path (e.g. a browser/extension that blocks the overlay).
//
// CLIENT-SIDE TOKEN BOUNDARY (review blocker #1): Paddle.Initialize() takes
// a Paddle CLIENT-SIDE token -- a categorically different credential from
// the server-only PADDLE_API_KEY used by paddle-checkout/paddle-webhook.
// Per Paddle's own documentation (developer.paddle.com/build/
// transactions/set-up-checkout, developer.paddle.com/concepts/
// authentication/client-side-tokens -- both verified during this task),
// client-side tokens are "safe to publish and expose in your app" --
// scoped only to opening checkouts and previewing prices/transactions,
// never to server-side account operations. This file therefore reads it
// from import.meta.env.VITE_PADDLE_CLIENT_TOKEN -- Vite's standard
// mechanism for a value that is INTENTIONALLY bundled into the public
// frontend build, exactly like every other VITE_-prefixed variable. The
// server's own PADDLE_API_KEY is never read, imported, or reachable from
// this file, or from anywhere else under src/ -- it exists only inside
// the two Edge Functions' own Deno.env.get() calls.
//
// SANDBOX-FIRST (never auto-switch to live, instruction 5):
// import.meta.env.VITE_PADDLE_ENV selects Paddle.Environment.set("sandbox"
// | "production"), mirroring paddle-checkout's own paddleApiBaseUrl()
// fail-safe default exactly: anything other than the literal string
// "production" is treated as sandbox, so an unset or misspelled value
// never silently exposes a live checkout. Going live is an explicit,
// separate deploy-time env change on BOTH sides -- the frontend
// (VITE_PADDLE_CLIENT_TOKEN + VITE_PADDLE_ENV, baked in at build time) and
// the Edge Functions (PADDLE_API_KEY + PADDLE_ENV, set as Supabase
// function secrets) -- never a code branch in either place, and this
// correction does not change that principle, only adds the frontend half
// of it (the server half already existed in patch 0012).

type PaddleCheckoutCompletedListener = () => void;

interface PaddleEventCallbackData {
  name?: string;
}

interface PaddleCheckoutOpenOptions {
  transactionId: string;
  settings?: {
    successUrl?: string;
  };
}

interface PaddleGlobal {
  Environment: { set: (env: "sandbox" | "production") => void };
  Initialize: (options: {
    token: string;
    eventCallback?: (event: PaddleEventCallbackData) => void;
  }) => void;
  Checkout: { open: (options: PaddleCheckoutOpenOptions) => void };
}

declare global {
  interface Window {
    Paddle?: PaddleGlobal;
  }
}

const PADDLE_JS_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

// SPA-wide subscribers to Paddle's own "checkout.completed" event.
// SubscriptionView's post-checkout confirmation state is the only current
// listener, but this stays a Set (not a single callback slot) so a future
// second subscriber never has to fight this module for ownership of
// Paddle's own single eventCallback parameter -- Paddle.Initialize() only
// accepts one, so this module owns it exclusively and fans it out.
const completedListeners = new Set<PaddleCheckoutCompletedListener>();

// Same fail-safe default as paddle-checkout/index.ts's own
// paddleApiBaseUrl() -- anything other than exactly "production" is
// sandbox. Kept as its own small function (rather than inlined) so the
// "never auto-switch to live" rule is asserted in exactly one place here,
// matching that Edge Function's own convention.
function paddleEnvironment(): "sandbox" | "production" {
  const raw = (import.meta.env.VITE_PADDLE_ENV ?? "sandbox").toString().trim().toLowerCase();
  return raw === "production" ? "production" : "sandbox";
}

let initPromise: Promise<boolean> | null = null;

function loadPaddleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Paddle) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_JS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("paddle.js failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = PADDLE_JS_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("paddle.js failed to load")), { once: true });
    document.head.appendChild(script);
  });
}

// Idempotent -- safe to call from every mount that wants Paddle ready.
// Currently only App's own root effect calls this, but nothing here
// assumes a single caller: a second, later call (e.g. if SubscriptionView
// ever wants to double-check readiness on its own mount) just returns the
// same in-flight/settled promise. Resolves `false` -- never throws -- on
// any failure (missing token, network/script failure, unexpected global
// shape after load), since a broken checkout must never crash the rest of
// the app (instruction 33).
export function ensurePaddleInitialized(): Promise<boolean> {
  if (initPromise) return initPromise;

  const token = (import.meta.env.VITE_PADDLE_CLIENT_TOKEN ?? "").toString().trim();
  if (!token) {
    // No client-side token configured -- fails closed (checkout simply
    // cannot open) rather than calling Paddle.Initialize() with an empty
    // string, which Paddle.js would just reject anyway. Logged once, at
    // the point of the first real attempt, so a missing sandbox token is
    // visible during development instead of silently breaking every
    // checkout with no explanation.
    console.error("Paddle.js not initialized: VITE_PADDLE_CLIENT_TOKEN is not configured");
    initPromise = Promise.resolve(false);
    return initPromise;
  }

  initPromise = loadPaddleScript()
    .then(() => {
      if (!window.Paddle) throw new Error("window.Paddle missing after paddle.js load");
      window.Paddle.Environment.set(paddleEnvironment());
      window.Paddle.Initialize({
        token,
        eventCallback: (event) => {
          if (event?.name === "checkout.completed") {
            completedListeners.forEach(listener => listener());
          }
        }
      });
      return true;
    })
    .catch(loadError => {
      console.error("Paddle.js initialization failed:", loadError);
      return false;
    });

  return initPromise;
}

// Subscribes to Paddle's own "checkout.completed" event -- fired by
// Paddle.js the moment the OVERLAY itself considers the checkout done.
// This is NOT the same thing as AN.KI actually granting the resulting
// plan: entitlement only ever changes once paddle-webhook verifies the
// real server-side `transaction.completed`/`subscription.*` event and
// apply_paddle_subscription_event applies it (unchanged by this pass).
// The one and only thing this event is used for is STARTING
// SubscriptionView's already-existing bounded post-checkout confirmation
// polling a little earlier/more reliably than the `?checkout=success`
// URL param alone would (that param stays as a secondary/fallback
// trigger -- see SubscriptionView's own comment). Returns an unsubscribe
// function, the same convention as a React effect cleanup.
export function onPaddleCheckoutCompleted(listener: PaddleCheckoutCompletedListener): () => void {
  completedListeners.add(listener);
  return () => {
    completedListeners.delete(listener);
  };
}

// Opens Paddle's own Checkout OVERLAY for an already-created transaction
// (see createPaddleCheckout in paddleBilling.ts) -- never creates or
// modifies a transaction itself, and never grants anything locally by
// itself (same principle as every other Paddle-facing call in this
// codebase). Returns false (without throwing) if Paddle.js could not be
// initialized, so callers can show an honest error instead of silently
// doing nothing.
export async function openPaddleCheckout(transactionId: string): Promise<boolean> {
  const ready = await ensurePaddleInitialized();
  if (!ready || !window.Paddle) return false;

  // Fallback-only successUrl (see this file's own header) -- reuses the
  // exact `?checkout=success` contract App.tsx's mount effect and
  // SubscriptionView's own mount-read already implement, so this stays a
  // true fallback rather than a second, parallel success path.
  const successUrl = `${window.location.origin}${window.location.pathname}?checkout=success`;
  window.Paddle.Checkout.open({ transactionId, settings: { successUrl } });
  return true;
}
