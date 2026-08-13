import type { Fragment } from "../engine/types";

// Contract used by the reader engine to persist reading position and
// saved fragments. Phase 2 ships only a localStorage implementation
// (see localStorageStore.ts). When accounts land (phase 8), a
// Supabase-backed implementation of this exact same interface replaces
// it — the reader engine never changes, because it only ever talks to
// this interface, never to localStorage directly.
export interface ProgressStore {
  getPosition(bookId: string): number | null;
  savePosition(bookId: string, page: number): void;

  getFragments(): Fragment[];
  saveFragment(fragment: Fragment): void;
  deleteFragment(id: string): void;
}
