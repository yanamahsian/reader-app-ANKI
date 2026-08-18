import { useState } from "react";

// Stage 18 follow-up (round 3): toReaderBook.ts's resolver is
// jurisdiction-aware and correctly refuses to resolve a
// jurisdiction-scoped rights assertion (e.g. Project Gutenberg's
// "public domain in the USA", jurisdiction: "US") unless the caller
// explicitly states a matching jurisdiction. Until this file existed,
// nothing in the actual UI ever told the resolver a jurisdiction at
// all -- BookDetailView called it with no third argument -- so every
// real visitor was treated as "unknown", and every jurisdiction-scoped
// edition (every Gutenberg book, and even Pride and Prejudice's own
// anki-json edition, whose rights assertion is likewise scoped "US")
// appeared unavailable to everyone, with no way to actually read
// them. This is the minimal, explicit piece that was missing: one
// value, chosen by the person actually reading, never inferred from
// browser locale, interface language, IP, or any other guess -- and
// never defaulted to "US" or anywhere else.
//
// Storage: localStorage, same convention as this project's existing
// reader/progressStore/localStorageStore.ts (an "anki_"-prefixed
// key), so the choice survives a reload/reopen without needing an
// account or a server round-trip. Deliberately unrelated to
// DEV_ONLY_TEST_JURISDICTION (toReaderBook.ts) -- that constant stays
// test/dev-only and is never read from here or anywhere in
// production.
const STORAGE_KEY = "anki_reader_jurisdiction";

export function getStoredReaderJurisdiction(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private browsing, disabled storage,
    // non-browser test environment, ...) -- treat as "not yet chosen"
    // rather than throwing.
    return null;
  }
}

export function setStoredReaderJurisdiction(jurisdiction: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, jurisdiction);
  } catch {
    // Storage write failed -- the React state this is paired with
    // (see useReaderJurisdiction below) still reflects the choice for
    // the rest of this session; it just won't survive a reload. Not
    // worth failing the interaction over.
  }
}

// current jurisdiction (or null if never chosen) + a setter that
// updates both localStorage and React state together, so the
// component calling this re-renders immediately with the new value,
// and pickPreferredEditionAndFile sees it on the very next render.
export function useReaderJurisdiction(): [string | null, (jurisdiction: string) => void] {

  const [jurisdiction, setJurisdictionState] = useState<string | null>(() => getStoredReaderJurisdiction());

  function setJurisdiction(next: string): void {
    setStoredReaderJurisdiction(next);
    setJurisdictionState(next);
  }

  return [jurisdiction, setJurisdiction];

}
