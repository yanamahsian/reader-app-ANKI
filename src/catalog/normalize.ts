// Pure text normalization, split out of search.ts into its own
// dependency-free module. Fix accompanying the Stage 18 follow-up
// round: search.ts imports getBooks/getAuthors from catalogStore.ts,
// and catalogStore.ts now calls ingestion/applyGutenbergManifest.ts
// (which uses ingestion/match.ts) synchronously at module load. As
// long as match.ts imported `normalize` from "../search", that
// created a real circular require chain --
// catalogStore.ts -> applyGutenbergManifest.ts -> match.ts ->
// search.ts -> catalogStore.ts -- which is latent and harmless on its
// own, but becomes a live crash (a genuine `ReferenceError: Cannot
// access '...' before initialization`, confirmed by actually running
// the enriched catalog through Node, not just inspecting the code)
// the moment something at catalogStore.ts's own module top level
// depends on it. Moving `normalize` here (which has zero imports of
// its own) removes the cycle entirely: match.ts now imports it
// directly from here instead of via search.ts, and search.ts
// re-exports it from here unchanged so its existing public surface
// (and every other consumer) is unaffected.
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replaceAll("ё", "е")
    .trim()
    .replace(/\s+/g, " ");
}
