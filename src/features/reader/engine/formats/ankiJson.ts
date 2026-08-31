import type { Book } from "../types";
import type { FormatLoader, LoadedDocument, LoadedChapter } from "./types";
import { normalizeBook, paginateText, formatPage } from "../pagination";
import { getValidAccessToken } from "../../../../auth/supabaseAuth";

// Same requirement, same reasoning as src/catalog/remoteCatalog.ts:
// Supabase's gateway requires a valid `apikey` header on every Edge
// Function call (here: omnia-book-content, which book.url points to)
// regardless of the "Verify JWT with legacy secret" setting. This is
// the public-safe "publishable key" -- never service_role. Sent ONLY
// on `apikey`, never as `Authorization: Bearer` -- per Supabase's
// current docs, publishable/secret keys are not JWTs and the
// platform rejects them if sent as a bearer token.
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_X2hZ6bXgj5HHSSZQPiXYsw_mhF5NHpy";

// FREE / LIBRARY CATALOG BOUNDARY v1: paid visitors must send their own
// current Supabase Auth access token to omnia-book-content. Guests omit
// Authorization completely and retain normal Free-corpus access.
async function buildContentRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
  const accessToken = await getValidAccessToken();
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  return headers;
}

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

    const response = await fetch(book.url, {
      headers: await buildContentRequestHeaders()
    });

    if (!response.ok) {
      if (response.status === 403) {
        let code: string | undefined;
        try {
          const body = await response.clone().json();
          code = typeof body?.code === "string" ? body.code : undefined;
        } catch {
          // Keep the generic status message for non-JSON failures.
        }
        if (code === "catalog_plan_required") {
          throw new Error("catalog_plan_required");
        }
      }
      throw new Error(`Failed to fetch AN.KI normalized content: ${response.status}`);
    }

    const raw = await response.json();
    const document = validateAnkiJsonDocument(raw);

    const chapters: LoadedChapter[] = document.chapters.map(chapter => {

      const normalizedText = normalizeBook(chapter.text);
      const rawPages = paginateText(normalizedText);

      return {
        title: chapter.title,
        pages: rawPages.map(rawText => ({
          html: formatPage(rawText),
          rawText
        }))
      };

    });

    return {
      hasRealChapters: document.hasRealChapters,
      chapters
    };

  }

};
