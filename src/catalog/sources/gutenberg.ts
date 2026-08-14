import type { ExternalBookRecord } from "../ingestion/types";
import type { BookFormat } from "../types";

// Gutendex is used here only as a convenient, well-structured JSON
// metadata source for Project Gutenberg — it is a third-party
// community project, not official, and is NOT baked into the
// catalog's data model or into match.ts. Everything outside this
// file only ever sees ExternalBookRecord. Swapping this file's
// internals for the official Project Gutenberg catalog, a different
// mirror, or a self-hosted ingestion process later requires no change
// anywhere else in the app.
const GUTENDEX_BASE_URL = "https://gutendex.com/books";

interface GutendexAuthor {
  name: string;
}

interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  languages: string[];
  formats: Record<string, string>;
  copyright: boolean | null;
}

// Only formats this project's reader can actually open are extracted
// — Gutendex also lists HTML, images, audio, etc., which are not
// BookFile-worthy here.
function extractFormats(rawFormats: Record<string, string>): Array<{ format: BookFormat; url: string }> {

  const result: Array<{ format: BookFormat; url: string }> = [];

  for (const [mime, url] of Object.entries(rawFormats)) {
    if (mime.startsWith("application/epub+zip") && !result.some(f => f.format === "epub")) {
      result.push({ format: "epub", url });
    } else if (mime.startsWith("text/plain") && !result.some(f => f.format === "plaintext")) {
      result.push({ format: "plaintext", url });
    }
  }

  return result;

}

export async function fetchGutenbergRecord(gutenbergId: string): Promise<ExternalBookRecord> {

  const response = await fetch(`${GUTENDEX_BASE_URL}/${gutenbergId}`);

  if (!response.ok) {
    throw new Error(`Gutendex request failed for id ${gutenbergId}`);
  }

  const data = (await response.json()) as GutendexBook;

  // Project Gutenberg's own determination is explicitly scoped to the
  // USA ("Public domain in the USA") — never asserted here as a
  // global claim. copyright === false is Gutendex's summary of that;
  // anything else is left as "unknown" rather than guessed.
  const rights = data.copyright === false
    ? [{ status: "public-domain" as const, jurisdiction: "US" }]
    : [{ status: "unknown" as const, jurisdiction: null }];

  return {
    sourceId: "gutenberg",
    externalId: String(data.id),
    title: data.title,
    authorNames: data.authors.map(author => author.name),
    language: data.languages[0] ?? "en",
    formats: extractFormats(data.formats),
    rights
  };

}
