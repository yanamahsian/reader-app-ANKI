import { BATCH50_CANDIDATES } from "./batch50Config";

// Final curated 50-book set for this migration batch.
// The initial list included The Portrait of a Lady. Project Gutenberg
// currently exposes that novel as two separate volume records rather than one
// complete EPUB, so this batch uses Washington Square instead. This is batch
// curation data, not reader/provider logic.
export const BATCH50_EFFECTIVE_CANDIDATES = BATCH50_CANDIDATES.map(candidate =>
  candidate.workId === "portrait-of-a-lady"
    ? {
        workId: "washington-square",
        title: "Washington Square",
        aliases: ["Washington Square"],
        authorQuery: "Henry James"
      }
    : candidate
);
