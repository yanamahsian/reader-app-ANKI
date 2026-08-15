import type { Book } from "../types";
import type { FormatLoader, LoadedDocument, LoadedChapter } from "./types";
import { normalizeBook, paginateText, formatPage } from "../pagination";

// ============================================================
// TEMPORARY DIAGNOSTIC BUILD — logging only, no logic changes.
// Validation, normalizeBook/paginateText/formatPage calls, and the
// LoadedDocument contract are byte-for-byte the same as the last
// committed version. Every console.log call below is additive and
// safe to strip once the runtime evidence is captured. Search
// "DIAG:" to find every line added for this build.
// ============================================================

// AN.KI's own normalized reader content (Phase 9) — produced entirely
// server-side by ingestion (see supabase-functions/omnia-ingest and
// omnia-book-content), never parsed in the browser. This loader does
// no DOMParser work, no EPUB/HTML extraction of any kind: it only
// downloads an already-normalized JSON document and hands its
// chapters' raw text to the same pagination this project already
// uses for plain text. Source provenance (which external source the
// content came from, what the original file format was) is an
// ingestion/DB concern this loader never sees or needs to know.

interface AnkiJsonChapter {
  title: string | null;
  text: string;
}

interface AnkiJsonDocument {
  formatVersion: number;
  hasRealChapters: boolean;
  chapters: AnkiJsonChapter[];
}

// Narrow, explicit validation — anything that doesn't match is a
// thrown Error, never a silently empty LoadedDocument. An empty
// chapters array or empty combined text must never reach the reader
// as if it were a real (if short) book.
function validateAnkiJsonDocument(data: unknown): AnkiJsonDocument {

  if (typeof data !== "object" || data === null) {
    throw new Error("AN.KI normalized content is not a JSON object");
  }

  const candidate = data as Partial<AnkiJsonDocument>;

  if (candidate.formatVersion !== 1) {
    throw new Error(`Unsupported AN.KI normalized content formatVersion: ${String(candidate.formatVersion)}`);
  }

  if (typeof candidate.hasRealChapters !== "boolean") {
    throw new Error("AN.KI normalized content is missing hasRealChapters");
  }

  if (!Array.isArray(candidate.chapters) || candidate.chapters.length === 0) {
    throw new Error("AN.KI normalized content has no chapters");
  }

  for (const chapter of candidate.chapters) {
    if (typeof chapter !== "object" || chapter === null || typeof (chapter as AnkiJsonChapter).text !== "string") {
      throw new Error("AN.KI normalized content has a malformed chapter entry");
    }
  }

  const totalTextLength = candidate.chapters.reduce((sum, chapter) => sum + chapter.text.trim().length, 0);

  if (totalTextLength === 0) {
    throw new Error("AN.KI normalized content chapters are all empty");
  }

  return candidate as AnkiJsonDocument;

}

export const ankiJsonLoader: FormatLoader = {

  canHandle(book: Book): boolean {
    return book.format === "anki-json";
  },

  async load(book: Book): Promise<LoadedDocument> {

    const response = await fetch(book.url);

    if (!response.ok) {
      throw new Error(`Failed to fetch AN.KI normalized content: ${response.status}`);
    }

    const raw = await response.json();

    // DIAG: immediately after response.json(), before validation —
    // exactly what the browser actually received.
    console.log("DIAG: raw.formatVersion =", raw?.formatVersion);
    console.log("DIAG: raw.chapters?.length =", raw?.chapters?.length);
    console.log("DIAG: raw.chapters?.[0]?.text?.length =", raw?.chapters?.[0]?.text?.length);
    if (Array.isArray(raw?.chapters)) {
      const rawTotalLength = raw.chapters.reduce(
        (sum: number, ch: { text?: string }) => sum + (ch?.text?.length ?? 0),
        0
      );
      console.log("DIAG: raw total text length across all chapters =", rawTotalLength);
    }

    const document = validateAnkiJsonDocument(raw);

    const chapters: LoadedChapter[] = document.chapters.map((chapter, chapterIndex) => {

      const normalizedText = normalizeBook(chapter.text);

      // DIAG: length going into paginateText for this chapter.
      console.log(`DIAG[chapter ${chapterIndex}]: normalizedText.length =`, normalizedText.length);

      const rawPages = paginateText(normalizedText);

      // DIAG: pages actually produced for this chapter.
      console.log(`DIAG[chapter ${chapterIndex}]: paginateText produced pages =`, rawPages.length);

      return {
        title: chapter.title,
        pages: rawPages.map(rawText => ({
          html: formatPage(rawText),
          rawText
        }))
      };

    });

    // DIAG: final summary right before return.
    const totalPages = chapters.reduce((sum, chapter) => sum + chapter.pages.length, 0);
    console.log("DIAG SUMMARY: chapters.length in LoadedDocument =", chapters.length);
    console.log("DIAG SUMMARY: total pages across all chapters =", totalPages);

    return {
      hasRealChapters: document.hasRealChapters,
      chapters
    };

  }

};
