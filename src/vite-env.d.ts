/// <reference types="vite/client" />

// PAYMENTS & SUBSCRIPTION LIFECYCLE v1 (Paddle Billing) -- CORRECTIVE PASS.
// Explicit typings for the two frontend-only, intentionally-public Paddle
// config values (see src/api/paddleJs.ts's own header comment on why these
// are safe to bundle into the public build, unlike PADDLE_API_KEY which
// never appears anywhere under src/). Declared here, additively, rather
// than assuming vite/client's own ImportMetaEnv already has an open index
// signature for every VITE_-prefixed name.
interface ImportMetaEnv {
  readonly VITE_PADDLE_CLIENT_TOKEN?: string;
  readonly VITE_PADDLE_ENV?: string;
}
