// Interface-language locale support for AN.KI's i18n layer (v1).
//
// Scope: this file owns locale detection/normalization/storage and the
// priority chain the product spec requires:
//   explicit user setting -> saved profile/local preference ->
//   device/browser locale -> "en" fallback.
// In v1, "explicit user setting" and "saved local preference" are the
// same value (one localStorage entry) because there is no synced user
// profile field for interface language yet -- no `profiles` table (or
// equivalent) exists anywhere in this codebase today, and per the spec
// this pass does not add one. resolveLocale() below still keeps
// `profileLocale` as its own, separate tier in the signature (always
// `undefined` today) so wiring in a real synced value later, once a
// profile field exists, is a one-line change at the call site (index.ts)
// rather than a redesign of the priority chain itself.

export const SUPPORTED_LOCALES = ["en", "es", "de", "fr", "ru", "uk"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

const SUPPORTED_SET = new Set<string>(SUPPORTED_LOCALES);

export function isSupportedLocale(value: string): value is Locale {
  return SUPPORTED_SET.has(value);
}

// "es-ES" / "es_MX" / "DE-de" -> "es" / "es" / "de". Any BCP-47-ish tag
// is reduced to its primary language subtag (the part before the first
// "-" or "_"), lowercased, then checked against SUPPORTED_LOCALES.
// Returns null -- never a guess -- for anything unsupported, so callers
// decide the fallback explicitly rather than this function inventing one.
export function normalizeLocale(raw: string | null | undefined): Locale | null {
  if (!raw) return null;
  const primary = raw.trim().toLowerCase().split(/[-_]/)[0];
  return isSupportedLocale(primary) ? primary : null;
}

// Reads navigator.languages (in the browser's own preference order),
// falling back to navigator.language, normalizing each candidate and
// returning the first one this app actually supports as an INTERFACE
// locale -- i.e. one of the 6 SUPPORTED_LOCALES. Returns null (never a
// guess, never DEFAULT_LOCALE) when nothing in navigator.languages/
// navigator.language is supported, or in a non-browser environment
// (SSR/tests).
//
// This is the raw signal -- callers that want "the interface locale,
// with an en fallback if the device is unsupported" use
// detectDeviceLocale() below; callers that need to tell "genuinely
// detected" apart from "nothing detected, fell back" -- e.g.
// bookLanguagePreference.ts's device-derived initial book-language
// preference, which must resolve to NO preference (not "en") for an
// unsupported device -- use this function directly instead.
export function detectDeviceLocaleOrNull(): Locale | null {
  if (typeof navigator === "undefined") return null;

  const candidates: string[] = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    ...(navigator.language ? [navigator.language] : [])
  ];

  for (const candidate of candidates) {
    const normalized = normalizeLocale(candidate);
    if (normalized) return normalized;
  }

  return null;
}

// Same as detectDeviceLocaleOrNull(), except an unsupported/undetectable
// device locale falls back to DEFAULT_LOCALE ("en") rather than null --
// this is the form the interface-language priority chain
// (resolveLocale() below) actually wants: the UI always has to show
// SOME language.
export function detectDeviceLocale(): Locale {
  return detectDeviceLocaleOrNull() ?? DEFAULT_LOCALE;
}

const STORAGE_KEY = "anki_interface_locale";

// null = "Auto" (no explicit override) -- a distinct, representable
// state, not merely "whatever detectDeviceLocale() happens to return
// right now". That distinction is what makes "reset to Auto" a real
// action rather than just re-detecting once and freezing the result.
export function getStoredLocalePreference(): Locale | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeLocale(raw) : null;
  } catch {
    // localStorage unavailable (private browsing, disabled storage,
    // non-browser test environment, ...) -- treated as "Auto", same
    // convention as readerJurisdiction.ts's getStoredReaderJurisdiction.
    return null;
  }
}

export function setStoredLocalePreference(locale: Locale | null): void {
  try {
    if (locale) {
      localStorage.setItem(STORAGE_KEY, locale);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage write failed -- the in-memory store this is paired with
    // (see index.ts) still reflects the choice for the rest of this
    // session; it just won't survive a reload. Same tradeoff this
    // project already accepts in readerJurisdiction.ts / readerPreferences.ts.
  }
}

// The product-spec priority chain, as a pure function independently
// testable without touching localStorage/navigator. See the file-level
// comment for why profileLocale is accepted but unused in practice today.
export function resolveLocale(args: {
  explicitOverride: Locale | null;
  profileLocale?: Locale | null;
  deviceLocale: Locale;
}): Locale {
  return args.explicitOverride ?? args.profileLocale ?? args.deviceLocale ?? DEFAULT_LOCALE;
}
