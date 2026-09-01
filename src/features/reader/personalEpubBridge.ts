import type { Book } from "./engine/types";
import { isPersonalEpubBook } from "../../api/personalEpubLibrary";

const OPEN_EVENT = "anki:open-personal-epub";
const ACTIVE_SESSION_KEY = "anki-active-personal-epub-v1";

export function requestOpenPersonalEpub(book: Book): void {
  if (!isPersonalEpubBook(book)) return;

  try {
    window.sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(book));
  } catch {
    // Session persistence is a convenience. The immediate in-page event below
    // still opens the book if storage is blocked.
  }

  window.dispatchEvent(new CustomEvent<Book>(OPEN_EVENT, { detail: book }));
}

export function readActivePersonalEpub(): Book | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Book;
    return isPersonalEpubBook(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearActivePersonalEpub(): void {
  try {
    window.sessionStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch {
    // Best-effort cleanup only.
  }
}

export function subscribeToPersonalEpubOpen(handler: (book: Book) => void): () => void {
  const listener = (event: Event) => {
    const book = (event as CustomEvent<Book>).detail;
    if (book && isPersonalEpubBook(book)) handler(book);
  };

  window.addEventListener(OPEN_EVENT, listener);
  return () => window.removeEventListener(OPEN_EVENT, listener);
}
