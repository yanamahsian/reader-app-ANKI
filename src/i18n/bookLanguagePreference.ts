import { useSyncExternalStore } from "react";
import { detectDeviceLocaleOrNull } from "./locale";
import { LANGUAGE_OPTIONS } from "../catalog/languages";

// Preferred book languages -- deliberately independent from interface
// language (./locale.ts) as a USER CHOICE: this setting never changes
// which UI strings are shown, only catalog ranking and which Edition is
// the default within a Work (see catalog/languagePreferenceRanking.ts's
// applyPreferredLanguageRanking and catalog/defaultEditionLanguage.ts's
// resolveDefaultBookLanguage for the two places this is actually read).
// Selecting a language here never hides a Work or an Edition -- see
// both call sites' own comments.
//
// Values are catalog language codes -- editions.language /
// works.available_languages, e.g. "es", "ru", "grc" -- NOT limited to
// the 6 UI locales in locale.ts. This deliberately reuses the existing
// catalog language vocabulary (catalog/languages.ts's LANGUAGE_OPTIONS)
// rather than inventing a second, narrower list; the multilingual
// catalog architecture itself is untouched.
//
// PERSISTENCE SEMANTICS -- three distinct states, not two:
//   - no stored key at all           = Auto: no explicit choice has ever
//                                      been made. The EFFECTIVE preference
//                                      is derived fresh each time from the
//                                      device locale (see
//                                      getEffectivePreferredBookLanguages
//                                      below) -- exactly the same "follow
//                                      the device until told otherwise"
//                                      behavior interface language gets
//                                      from locale.ts's own Auto state.
//   - stored key = "[]"              = an EXPLICIT choice of "no
//                                      preference / all languages". This
//                                      is a real, sticky user decision --
//                                      it must NOT be reinterpreted as
//                                      Auto and silently revert to
//                                      following the device locale again.
//   - stored key = "[\"fr\",\"en\"]" = an explicit, sticky list.
// A plain `[]` cannot represent both "never chosen" and "chose nothing"
// at once -- getStoredBookLanguageOverride() below returns `null` for
// the first state and a real (possibly empty) array for the second/third,
// mirroring locale.ts's own null-means-Auto convention for interface
// language.
//
// DEVICE-DERIVED DEFAULT: uses detectDeviceLocaleOrNull() -- the RAW
// device signal, not the resolved (en-fallback-applied) interface
// locale -- so that an interface language the visitor explicitly
// overrode has no bearing on the book-language default, and so a
// genuinely unsupported device locale correctly derives to NO
// preference rather than inheriting interface language's "en" fallback
// (there is no principled reason a Chinese-only device should default
// its book preference to English editions).

const STORAGE_KEY = "anki_preferred_book_languages";

const CATALOG_LANGUAGE_CODES = new Set(
  LANGUAGE_OPTIONS.map(option => option.value).filter(value => value !== "")
);

function readStoredOverride(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null; // key absent entirely -- Auto.
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
      : null; // corrupted value -- treat as Auto rather than throwing.
  } catch {
    // localStorage unavailable, or corrupted JSON -- treated as Auto
    // (no explicit preference), same convention as every other
    // local-preference store in this project.
    return null;
  }
}

function writeStoredOverride(languages: string[] | null): void {
  try {
    if (languages === null) {
      localStorage.removeItem(STORAGE_KEY); // reset to Auto.
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(languages));
    }
  } catch {
    // Write failed -- the in-memory store below still reflects the
    // choice for the rest of this session; it just won't survive a
    // reload. Same tradeoff as locale.ts / readerJurisdiction.ts.
  }
}

// The device-derived default, used only when there is no explicit
// override at all (Auto state). A single-language singleton (or empty),
// per the spec's exact principle: "derive initial/default preference
// from device locale, if this code exists in the catalog language
// vocabulary -- otherwise no language preference".
function deriveDefaultFromDevice(): string[] {
  const deviceLocale = detectDeviceLocaleOrNull();
  if (deviceLocale && CATALOG_LANGUAGE_CODES.has(deviceLocale)) return [deviceLocale];
  return [];
}

export function getStoredBookLanguageOverride(): string[] | null {
  return readStoredOverride();
}

// The actual value every consumer (Library ranking, Book Detail default
// edition) should read -- resolves the override/Auto distinction into a
// single, ready-to-use list. Explicit override (even an explicit `[]`)
// always wins; Auto derives fresh from the current device locale every
// call, so it keeps tracking a live device-locale change with no extra
// action, exactly like interface language's own Auto state does.
export function getEffectivePreferredBookLanguages(): string[] {
  const override = readStoredOverride();
  return override !== null ? override : deriveDefaultFromDevice();
}

// Module-level store + useSyncExternalStore, same pattern (and same
// reasoning) as src/i18n/index.ts's locale store: Settings (the writer)
// and Library/Book Detail (the readers) are different routed screens in
// this app, but this keeps every i18n-adjacent setting built the same
// way rather than some being reactive stores and others plain reads.
let currentOverride: string[] | null = readStoredOverride();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getOverrideSnapshot(): string[] | null {
  return currentOverride;
}

// Sets an EXPLICIT override -- including an explicit empty array, which
// is a real, sticky "no preference" choice (see the file-level comment).
// To go back to Auto, use resetBookLanguagesToAuto(), never
// setPreferredBookLanguages([]).
export function setPreferredBookLanguages(languages: string[]): void {
  currentOverride = Array.from(new Set(languages));
  writeStoredOverride(currentOverride);
  notify();
}

export function resetBookLanguagesToAuto(): void {
  currentOverride = null;
  writeStoredOverride(null);
  notify();
}

export interface BookLanguagePreference {
  // The raw stored override -- null means Auto (device-derived).
  override: string[] | null;
  // The resolved list every ranking/edition-selection consumer actually
  // uses -- override if one exists (even `[]`), otherwise the current
  // device-derived default.
  effective: string[];
  isAuto: boolean;
  setPreferredLanguages: (languages: string[]) => void;
  resetToAuto: () => void;
}

export function usePreferredBookLanguages(): BookLanguagePreference {
  const override = useSyncExternalStore(subscribe, getOverrideSnapshot, getOverrideSnapshot);
  const effective = override !== null ? override : deriveDefaultFromDevice();

  return {
    override,
    effective,
    isAuto: override === null,
    setPreferredLanguages: setPreferredBookLanguages,
    resetToAuto: resetBookLanguagesToAuto
  };
}
