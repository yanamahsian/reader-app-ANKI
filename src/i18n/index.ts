import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  detectDeviceLocale,
  getStoredLocalePreference,
  resolveLocale,
  setStoredLocalePreference,
  type Locale
} from "./locale";
import { en } from "./translations/en";
import { es } from "./translations/es";
import { de } from "./translations/de";
import { fr } from "./translations/fr";
import { ru } from "./translations/ru";
import { uk } from "./translations/uk";

export type { Locale } from "./locale";
export { SUPPORTED_LOCALES, DEFAULT_LOCALE } from "./locale";

// en.ts is the canonical key set -- every other locale's table is typed
// as Record<TranslationKey, string> (see translations/es.ts etc.), so an
// English key added there and forgotten in another locale file is a
// compile error, not a silently-missing string at runtime. New keys:
// add to en.ts first, then TypeScript will point at every other file
// that's now missing it.
export type TranslationKey = keyof typeof en;

const TRANSLATIONS: Record<Locale, Record<TranslationKey, string>> = { en, es, de, fr, ru, uk };

// Module-level store, same shape as this codebase's other shared
// client-side state (e.g. catalog/catalogStore.ts's own module-level
// cache), paired with useSyncExternalStore so every component that
// calls useI18n() re-renders together the instant the interface
// language changes. This matters here specifically because
// GlobalHeader/AccountMenu are mounted exactly once by AppShell, as
// siblings of whatever screen is currently routed (see AppShell.tsx's
// own comment) -- a language change made inside SettingsView has to
// reach them with no prop drilling and no remount, which a plain
// per-component useState could not do on its own.
let currentOverride: Locale | null = getStoredLocalePreference();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Recomputed on every call rather than cached: a few string operations
// over navigator.languages, cheap enough that the extra invalidation
// bookkeeping a cache would need isn't worth it. Returning a primitive
// (not an object) also means React's own reference-equality bailout in
// useSyncExternalStore works correctly with no extra memoization here.
function getSnapshot(): Locale {
  return resolveLocale({
    explicitOverride: currentOverride,
    // No synced profile locale exists yet -- see locale.ts's file-level
    // comment. Passing it explicitly (rather than omitting the property)
    // keeps the real 4-tier chain visible at the one call site that will
    // need to change once a profile value exists.
    profileLocale: undefined,
    deviceLocale: detectDeviceLocale()
  });
}

export function setLocale(locale: Locale): void {
  currentOverride = locale;
  setStoredLocalePreference(locale);
  notify();
}

export function resetLocaleToAuto(): void {
  currentOverride = null;
  setStoredLocalePreference(null);
  notify();
}

export interface I18n {
  locale: Locale;
  isAuto: boolean;
  t: (key: TranslationKey) => string;
  setLocale: (locale: Locale) => void;
  resetToAuto: () => void;
  supportedLocales: readonly Locale[];
}

export function useI18n(): I18n {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  // Re-read directly at render time (not via useSyncExternalStore) --
  // `notify()` already re-renders every subscriber whenever this
  // changes together with `locale`, so this stays in sync without a
  // second store.
  const isAuto = currentOverride === null;
  const table = TRANSLATIONS[locale] ?? TRANSLATIONS[DEFAULT_LOCALE];

  const t = useCallback(
    (key: TranslationKey): string => table[key] ?? TRANSLATIONS[DEFAULT_LOCALE][key] ?? key,
    [table]
  );

  return { locale, isAuto, t, setLocale, resetToAuto: resetLocaleToAuto, supportedLocales: SUPPORTED_LOCALES };
}
