import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { BATCH_50_SPECS } from "../../src/catalog/batch50Catalog";
import type { ExternalBookRecord } from "../../src/catalog/ingestion/types";
import { fetchAndValidate } from "../ingest/fetchAndValidate";
import { convertEpubToAnkiJson } from "../ingest/epubToAnkiJson";
import { normalizeBook, paginateText } from "../../src/features/reader/engine/pagination";

interface GutendexAuthor { name: string; }
interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  languages: string[];
  formats: Record<string, string>;
  copyright: boolean | null;
  download_count?: number;
}
interface GutendexSearchResponse { results: GutendexBook[]; }

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "public", "books-normalized");
const RECORDS_PATH = join(ROOT, "src", "catalog", "sources", "gutenbergBatch50Records.generated.ts");
const MANIFEST_PATH = join(ROOT, "src", "catalog", "sources", "gutenbergBatch50Manifest.generated.ts");

function normalized(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "in", "to", "by", "at"]);

function significantTokens(value: string): string[] {
  return normalized(value).split(/\s+/).filter(token => token && !STOPWORDS.has(token));
}

function titleCoverage(expectedTitle: string, actualTitle: string): number {
  const expected = significantTokens(expectedTitle);
  const actual = new Set(significantTokens(actualTitle));
  if (expected.length === 0) return 0;
  const hits = expected.filter(token => actual.has(token)).length;
  return hits / expected.length;
}

function authorMatches(candidate: GutendexBook, expectedAuthor: string): boolean {
  const expectedParts = normalized(expectedAuthor).split(/\s+/).filter(Boolean);
  const surname = expectedParts[expectedParts.length - 1];
  if (!surname) return false;
  return candidate.authors.some(author => normalized(author.name).split(/\s+/).includes(surname));
}

function pickEpubUrl(formats: Record<string, string>): string | null {
  const entries = Object.entries(formats)
    .filter(([mime, url]) => mime.startsWith("application/epub+zip") && /^https:\/\//.test(url));
  if (entries.length === 0) return null;
  const noImages = entries.find(([, url]) => /noimages/i.test(url));
  return (noImages ?? entries[0])[1];
}

async function discover(spec: (typeof BATCH_50_SPECS)[number]): Promise<GutendexBook> {
  const query = `${spec.originalTitle} ${spec.authorSearchName}`;
  const response = await fetch(`https://gutendex.com/books?search=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(`${spec.workId}: Gutendex search failed with HTTP ${response.status}`);
  const payload = (await response.json()) as GutendexSearchResponse;

  const ranked = payload.results
    .filter(book => book.copyright === false)
    .filter(book => book.languages.includes("en"))
    .filter(book => authorMatches(book, spec.authorSearchName))
    .map(book => ({ book, coverage: titleCoverage(spec.originalTitle, book.title), epub: pickEpubUrl(book.formats) }))
    .filter(candidate => candidate.epub)
    .sort((a, b) => b.coverage - a.coverage || (b.book.download_count ?? 0) - (a.book.download_count ?? 0));

  const best = ranked[0];
  if (!best || best.coverage < 0.6) {
    const diagnostic = payload.results.slice(0, 5).map(book => `${book.id}: ${book.title} / ${book.authors.map(a => a.name).join(", ")}`).join(" | ");
    throw new Error(`${spec.workId}: no safe Gutenberg match (best coverage=${best?.coverage ?? 0}). Results: ${diagnostic}`);
  }

  return best.book;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  const records: Record<string, ExternalBookRecord> = {};
  const manifest: Array<{ workId: string; externalId: string; reviewNote: string }> = [];
  const usedIds = new Map<string, string>();
  let totalCharacters = 0;
  let totalPages = 0;

  for (const [index, spec] of BATCH_50_SPECS.entries()) {
    console.log(`\n[${index + 1}/${BATCH_50_SPECS.length}] ${spec.workId}: discovering Gutenberg edition`);
    const book = await discover(spec);
    const externalId = String(book.id);
    const previousWork = usedIds.get(externalId);
    if (previousWork) throw new Error(`${spec.workId}: Gutenberg id ${externalId} already selected for ${previousWork}`);
    usedIds.set(externalId, spec.workId);

    const epubUrl = pickEpubUrl(book.formats);
    if (!epubUrl) throw new Error(`${spec.workId}: selected Gutenberg record ${externalId} has no EPUB URL`);

    console.log(`${spec.workId}: Gutenberg #${externalId} — ${book.title}`);
    const fetched = await fetchAndValidate(epubUrl, "epub");
    const converted = convertEpubToAnkiJson(fetched.bytes);
    const characters = converted.document.chapters.reduce((sum, chapter) => sum + chapter.text.trim().length, 0);
    const pages = converted.document.chapters.reduce((sum, chapter) => {
      return sum + paginateText(normalizeBook(chapter.text)).length;
    }, 0);
    if (characters <= 0 || pages <= 0) throw new Error(`${spec.workId}: normalized document has no readable text/pages`);

    const outputPath = join(OUT_DIR, `${spec.workId}.json`);
    writeFileSync(outputPath, `${JSON.stringify(converted.document, null, 2)}\n`, "utf8");

    records[externalId] = {
      sourceId: "gutenberg",
      externalId,
      title: book.title,
      authorNames: book.authors.map(author => author.name),
      language: "en",
      formats: [{ format: "epub", url: epubUrl }],
      rights: [{ status: "public-domain", jurisdiction: "US", assessedBy: "source" }]
    };

    manifest.push({
      workId: spec.workId,
      externalId,
      reviewNote: `Curated Batch 50: automated Gutenberg discovery matched ${JSON.stringify(spec.originalTitle)} to Gutenberg #${externalId} by author and normalized title coverage; the selected EPUB then passed fetch, archive parsing, text extraction, and pagination validation.`
    });

    totalCharacters += characters;
    totalPages += pages;
    console.log(`${spec.workId}: PASS chapters=${converted.document.chapters.length} chars=${characters} pages=${pages} toc=${converted.diagnostics.tocSource}`);
  }

  const recordsSource = `import type { ExternalBookRecord } from "../ingestion/types";\n\n// Generated by scripts/catalog/generateBatch50.ts. Do not hand-edit.\nexport const GUTENBERG_BATCH_50_RECORDS: Record<string, ExternalBookRecord> = ${JSON.stringify(records, null, 2)};\n`;
  const manifestSource = `import type { ManifestEntry } from "../ingestion/applyManifest";\n\n// Generated by scripts/catalog/generateBatch50.ts. Do not hand-edit.\nexport const GUTENBERG_BATCH_50_MANIFEST: ManifestEntry[] = ${JSON.stringify(manifest, null, 2)};\n`;

  mkdirSync(dirname(RECORDS_PATH), { recursive: true });
  writeFileSync(RECORDS_PATH, recordsSource, "utf8");
  writeFileSync(MANIFEST_PATH, manifestSource, "utf8");

  console.log(`\nBATCH 50 PASS: works=${BATCH_50_SPECS.length} totalChars=${totalCharacters} totalPages=${totalPages}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
