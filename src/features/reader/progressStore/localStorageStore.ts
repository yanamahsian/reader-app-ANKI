import type { ProgressStore } from "./progressStore";
import type { Fragment } from "../engine/types";

const PREFIX = "anki_";

const KEYS = {
  POSITION: PREFIX + "position",
  FRAGMENTS: PREFIX + "fragments"
} as const;

// Position is currently keyed only by the last-opened book (matches the
// original script.js behaviour, which tracked a single STORAGE.POSITION
// key regardless of book). bookId is accepted in the interface already
// so a future per-book implementation is a drop-in replacement, not an
// interface change.
export function createLocalStorageStore(): ProgressStore {

  function getPosition(_bookId: string): number | null {
    const raw = localStorage.getItem(KEYS.POSITION);
    if (raw === null) return null;

    const value = Number(raw);
    return Number.isNaN(value) ? null : value;
  }

  function savePosition(_bookId: string, page: number): void {
    localStorage.setItem(KEYS.POSITION, String(page));
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

  return { getPosition, savePosition, getFragments, saveFragment, deleteFragment };

}
