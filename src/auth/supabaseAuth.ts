// USER LIBRARY PHASE: AN.KI's first real authentication.
//
// Nothing in this app talked to Supabase Auth before this phase --
// confirmed by grepping the whole src/ tree for "supabase.auth" /
// "signIn" / "signUp" / "createClient" before writing a line of this
// file: zero matches. src/features/profile/ProfileView.tsx and
// src/app/AccountMenu.tsx both already had a scaffolded "guest" state
// with comments explicitly saying what would replace it once real auth
// existed ("Once real auth exists, the guest branch below is what gets
// replaced with an actual profile" / "a real auth integration later
// only has to flip this one flag ... and feed it a real user object"),
// and AccountMenu.tsx's own "Создать аккаунт"/"Войти" buttons already
// navigate to the Profile screen -- so this phase completes that
// existing, already-designed-for shape rather than inventing a second,
// competing auth architecture.
//
// WHY RAW fetch() AGAINST GOTRUE'S REST API, NOT THE @supabase/supabase-js
// CLIENT LIBRARY: every other Supabase integration already in this
// frontend (src/api/libraryCatalog.ts, src/features/reader/engine/
// formats/ankiJson.ts, ...) is a plain fetch() call carrying the public
// `apikey` header -- @supabase/supabase-js has never been a frontend
// dependency here (only Edge Functions use it, server-side, with the
// service-role key). Supabase Auth's REST surface (POST /auth/v1/signup,
// /auth/v1/token, /auth/v1/logout) is the same stable, documented API
// the client library itself calls internally, so this keeps the same
// "fetch + apikey header, no new dependency" shape as every existing
// integration rather than introducing a second way of talking to
// Supabase for this one feature.
//
// SESSION STORAGE: localStorage, "anki_"-prefixed key, same convention
// as readerJurisdiction.ts and the reader's own progress store keys --
// { accessToken, refreshToken, expiresAt, user: { id, email } }. A
// bearer access token is a real (if time-limited) credential, same
// category of thing a real browser session cookie would be for a
// traditional server-rendered app; this project has no more sensitive
// place to keep it than localStorage already holds other reader state,
// and moving it server-side would require a backend session layer this
// app doesn't have and isn't being asked to build here.

const SUPABASE_URL = "https://prknybetxirzbzkvmovw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X2hZ6bXgj5HHSSZQPiXYsw_mhF5NHpy";

const AUTH_ENDPOINT = `${SUPABASE_URL}/auth/v1`;
const SESSION_KEY = "anki_auth_session";

// Use a concrete file path so the existing /reader-app-ANKI/** allow-list
// matches this redirect unambiguously on GitHub Pages.
const SIGNUP_CONFIRMATION_REDIRECT_URL = "https://yanamahsian.github.io/reader-app-ANKI/index.html";

export interface AuthUser {
  id: string;
  email: string | null;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  // Epoch milliseconds -- GoTrue reports `expires_in` (seconds from
  // issuance), converted once at save time so every later check is a
  // plain Date.now() comparison rather than re-deriving it from a
  // stored issuance time.
  expiresAt: number;
  user: AuthUser;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function readStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      !parsed.user || typeof parsed.user.id !== "string"
    ) {
      return null;
    }
    return parsed as AuthSession;
  } catch {
    // Unavailable storage (private browsing, disabled storage) or
    // corrupted JSON -- treated as "signed out", same posture
    // readerJurisdiction.ts already takes for its own storage reads.
    return null;
  }
}

let currentSession: AuthSession | null = readStoredSession();

function notify(): void {
  for (const listener of listeners) listener();
}

function setSession(session: AuthSession | null): void {
  currentSession = session;
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Same non-fatal posture as setStoredReaderJurisdiction -- the
    // in-memory session (and this module's own listeners) still reflect
    // the change for the rest of this tab's lifetime even if the write
    // itself failed; it just won't survive a reload.
  }
  notify();
}

function decodeJwtUser(accessToken: string): AuthUser | null {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { sub?: unknown; email?: unknown };
    if (typeof payload.sub !== "string") return null;
    return {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null
    };
  } catch {
    return null;
  }
}

function cleanAuthRedirectUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.hash = "";
  if (url.pathname.endsWith("/index.html")) {
    url.pathname = url.pathname.slice(0, -"index.html".length);
  }
  window.history.replaceState(null, document.title, `${url.pathname}${url.search}`);
}

async function validateRedirectSession(session: AuthSession): Promise<void> {
  try {
    const response = await fetch(`${AUTH_ENDPOINT}/user`, {
      headers: {
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${session.accessToken}`
      }
    });
    if (!response.ok) {
      if (currentSession?.accessToken === session.accessToken) setSession(null);
      return;
    }
    const user = await response.json().catch(() => null) as { id?: unknown; email?: unknown } | null;
    if (!user || typeof user.id !== "string") {
      if (currentSession?.accessToken === session.accessToken) setSession(null);
      return;
    }
    if (currentSession?.accessToken === session.accessToken) {
      setSession({
        ...session,
        user: {
          id: user.id,
          email: typeof user.email === "string" ? user.email : session.user.email
        }
      });
    }
  } catch {
    // Keep the freshly issued session on transient network failure.
    // The normal authenticated API path will validate it on use.
  }
}

function consumeAuthRedirectHash(): void {
  if (typeof window === "undefined" || !window.location.hash) return;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return;

  const user = decodeJwtUser(accessToken);
  const expiresAtSeconds = Number(params.get("expires_at"));
  const expiresInSeconds = Number(params.get("expires_in"));

  if (!user) {
    cleanAuthRedirectUrl();
    return;
  }

  const session: AuthSession = {
    accessToken,
    refreshToken,
    expiresAt:
      Number.isFinite(expiresAtSeconds) && expiresAtSeconds > 0
        ? expiresAtSeconds * 1000
        : Date.now() + (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0 ? expiresInSeconds : 3600) * 1000,
    user
  };

  setSession(session);
  cleanAuthRedirectUrl();
  void validateRedirectSession(session);
}

consumeAuthRedirectHash();

export function getSession(): AuthSession | null {
  return currentSession;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

interface GoTrueTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id: string; email?: string | null };
}

// GoTrue's error shape has drifted across versions -- defensively check
// every field a real deployment has been seen to use rather than
// trusting exactly one.
function extractErrorMessage(body: any, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  return body.error_description || body.msg || body.message || body.error || fallback;
}

function toSession(body: GoTrueTokenResponse): AuthSession | null {
  if (!body.access_token || !body.refresh_token || !body.user?.id) return null;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    user: { id: body.user.id, email: body.user.email ?? null }
  };
}

async function gotrueFetch(path: string, body: unknown): Promise<{ status: number; data: any }> {
  const response = await fetch(`${AUTH_ENDPOINT}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_PUBLISHABLE_KEY
    },
    body: JSON.stringify(body)
  });
  // GoTrue always responds with a JSON body, success or error -- a
  // non-JSON response here means something outside GoTrue itself
  // intercepted the request (a proxy error page, a network captive
  // portal); .json() throwing is treated as a generic failure by every
  // caller below via their own try/catch, not specially handled here.
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

export interface SignUpResult {
  // "session": account created and immediately signed in (email
  // confirmation is off for this project). "confirmation_required":
  // account created, but GoTrue withheld a session until the visitor
  // confirms their email -- this project's own confirmation setting was
  // never inspected/changed by this phase (out of scope -- see the
  // written report), so both real outcomes are handled rather than
  // assuming one.
  outcome: "session" | "confirmation_required";
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {

  const { status, data } = await gotrueFetch(
    `/signup?redirect_to=${encodeURIComponent(SIGNUP_CONFIRMATION_REDIRECT_URL)}`,
    { email, password }
  );

  if (status >= 400) {
    throw new Error(extractErrorMessage(data, "Не удалось создать аккаунт."));
  }

  const session = toSession(data);
  if (session) {
    setSession(session);
    return { outcome: "session" };
  }

  return { outcome: "confirmation_required" };

}

export async function signIn(email: string, password: string): Promise<void> {

  const { status, data } = await gotrueFetch("/token?grant_type=password", { email, password });

  if (status >= 400) {
    throw new Error(extractErrorMessage(data, "Не удалось войти. Проверьте e-mail и пароль."));
  }

  const session = toSession(data);
  if (!session) {
    throw new Error("Не удалось войти: сервер не вернул сессию.");
  }

  setSession(session);

}

export async function signOut(): Promise<void> {

  const session = currentSession;
  // Local sign-out always happens, even if the network call below
  // fails -- a visitor pressing "Выйти" must never be left looking
  // signed-out while this tab silently still holds a working token.
  setSession(null);
  if (typeof window !== "undefined" && window.location.hash) cleanAuthRedirectUrl();

  if (!session) return;

  try {
    await fetch(`${AUTH_ENDPOINT}/logout`, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_PUBLISHABLE_KEY,
        "Authorization": `Bearer ${session.accessToken}`
      }
    });
  } catch {
    // Best-effort server-side revocation -- the token will simply expire
    // on its own (see expiresAt) if this fails; not worth surfacing an
    // error for a sign-out the visitor already sees as complete.
  }

}

// Refreshes and persists a new session from the current refresh token.
// Returns null (and clears the stored session) if the refresh token
// itself is no longer valid -- the caller is then genuinely signed out,
// not just "temporarily failed to refresh".
async function refresh(session: AuthSession): Promise<AuthSession | null> {

  try {

    const { status, data } = await gotrueFetch("/token?grant_type=refresh_token", {
      refresh_token: session.refreshToken
    });

    if (status >= 400) {
      setSession(null);
      return null;
    }

    const nextSession = toSession(data);
    if (!nextSession) {
      setSession(null);
      return null;
    }

    setSession(nextSession);
    return nextSession;

  } catch {
    // A network failure while refreshing is NOT treated as "signed
    // out" -- the existing (possibly still-valid, or only just-expired)
    // session is left in place so a transient connectivity blip doesn't
    // silently log the visitor out. The caller's own request will fail
    // with its own error instead, which is the honest outcome here.
    return session;
  }

}

// The single choke point every authenticated API call in this app
// (src/api/userLibrary.ts, src/api/readerProgress.ts, the Supabase
// progress store) goes through to get a token to send. Refreshes ahead
// of actual expiry (60s of slack) rather than waiting for a request to
// fail on an already-expired token first.
export async function getValidAccessToken(): Promise<string | null> {

  const session = currentSession;
  if (!session) return null;

  if (Date.now() < session.expiresAt - 60_000) {
    return session.accessToken;
  }

  const refreshed = await refresh(session);
  return refreshed?.accessToken ?? null;

}

export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };

import { useEffect, useState } from "react";

export interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
}

// Every component that needs to know "is someone signed in" (AccountMenu,
// ProfileView, BookDetailView's library button, MyLibraryView) uses this
// instead of reading getSession() directly, so all of them re-render
// together the instant signIn/signUp/signOut actually changes the
// session -- e.g. AccountMenu's dropdown updates immediately after
// ProfileView's own sign-in form succeeds, with no page reload and no
// prop-drilling a session value through App.tsx.
export function useAuth(): AuthState {

  const [session, setSessionState] = useState<AuthSession | null>(() => getSession());

  useEffect(() => {
    return subscribe(() => setSessionState(getSession()));
  }, []);

  return {
    user: session?.user ?? null,
    isAuthenticated: session !== null
  };

}
