import type { Book } from "./engine/types";
import { isPersonalEpubBook } from "../../api/personalEpubLibrary";
import { isPersonalFb2Book } from "../../api/personalFb2Library";
import { isPersonalPdfBook } from "../../api/personalPdfLibrary";

const OPEN_EVENT = "anki:open-personal-book";
const ACTIVE_SESSION_KEY = "anki-active-personal-book-v2";
const LEGACY_EPUB_SESSION_KEY = "anki-active-personal-epub-v1";

export function isPersonalImportedBook(book: Book): boolean {
  return isPersonalEpubBook(book) || isPersonalPdfBook(book) || isPersonalFb2Book(book);
}

export function requestOpenPersonalBook(book: Book): void {
  if (!isPersonalImportedBook(book)) return;

  try {
    window.sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(book));
    window.sessionStorage.removeItem(LEGACY_EPUB_SESSION_KEY);
  } catch {
    // Session persistence is a convenience. The immediate event still opens
    // the device-local book if sessionStorage is unavailable.
  }

  window.dispatchEvent(new CustomEvent<Book>(OPEN_EVENT, { detail: book }));
}

export function readActivePersonalBook(): Book | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_SESSION_KEY)
      ?? window.sessionStorage.getItem(LEGACY_EPUB_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Book;
    return isPersonalImportedBook(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearActivePersonalBook(): void {
  try {
    window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
    window.sessionStorage.removeItem(LEGACY_EPUB_SESSION_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}

export function subscribeToPersonalBookOpen(handler: (book: Book) => void): () => void {
  const listener = (event: Event) => {
    const book = (event as CustomEvent<Book>).detail;
    if (book && isPersonalImportedBook(book)) handler(book);
  };

  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}

// Backwards-compatible aliases for any isolated test/story code that still
// imports the v1 EPUB-specific names. Production code uses the generic names.
export const requestOpenPersonalEpub = requestOpenPersonalBook;
export const readActivePersonalEpub = readActivePersonalBook;
export const clearActivePersonalEpub = clearActivePersonalBook;
export const subscribeToPersonalEpubOpen = subscribeToPersonalBookOpen;
