import type { ProgressStore } from "./progressStore";
import type { Fragment, Bookmark } from "../engine/types";

const PREFIX = "anki_";

const KEYS = {
  // Reader Complete: position is now genuinely per-book
  // (PREFIX + "position_" + bookId) — previously this was a single
  // global key shared by every book, which meant opening a second
  // book silently overwrote the first one's saved place. bookId is
  // no longer ignored.
  POSITION_PREFIX: PREFIX + "position_",
  FRAGMENTS: PREFIX + "fragments",
  BOOKMARKS: PREFIX + "bookmarks"
} as const;

export function createLocalStorageStore(): ProgressStore {

  function getPosition(bookId: string): number | null {
    const raw = localStorage.getItem(KEYS.POSITION_PREFIX + bookId);
    if (raw === null) return null;

    const value = Number(raw);
    return Number.isNaN(value) ? null : value;
  }

  function savePosition(bookId: string, page: number): void {
    localStorage.setItem(KEYS.POSITION_PREFIX + bookId, String(page));
  }

  function getFragments(): Fragment[] {
    try {
      const raw = localStorage.getItem(KEYS.FRAGMENTS);
      return raw ? (JSON.parse(raw) as Fragment[]) : [];
    } catch {
      return [];
    }
  }

  function saveFragment(fragment: Fragment): void {
    const fragments = getFragments();
    fragments.unshift(fragment);
    localStorage.setItem(KEYS.FRAGMENTS, JSON.stringify(fragments));
  }

  function deleteFragment(id: string): void {
    const fragments = getFragments().filter(item => item.id !== id);
    localStorage.setItem(KEYS.FRAGMENTS, JSON.stringify(fragments));
  }

  // Same storage shape as fragments: one array holding every book's
  // bookmarks, filtered by bookId on read — not a key per book.
  function getAllBookmarks(): Bookmark[] {
    try {
      const raw = localStorage.getItem(KEYS.BOOKMARKS);
      return raw ? (JSON.parse(raw) as Bookmark[]) : [];
    } catch {
      return [];
    }
  }

  function getBookmarks(bookId: string): Bookmark[] {
    return getAllBookmarks().filter(bookmark => bookmark.bookId === bookId);
  }

  function saveBookmark(bookmark: Bookmark): void {
    const bookmarks = getAllBookmarks();
    bookmarks.unshift(bookmark);
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  }

  function deleteBookmark(id: string): void {
    const bookmarks = getAllBookmarks().filter(item => item.id !== id);
    localStorage.setItem(KEYS.BOOKMARKS, JSON.stringify(bookmarks));
  }

  return {
    getPosition, savePosition,
    getFragments, saveFragment, deleteFragment,
    getBookmarks, saveBookmark, deleteBookmark
  };

}
