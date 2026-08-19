// Offline ingestion runner -- Stage 21, Step 1.
//
// provider record (ExternalBookRecord, already defined in
// src/catalog/ingestion/types.ts -- reused as-is, no second
// provider-record model) -> HTTPS download -> validate -> parse ->
// normalized AN.KI JSON -> validate the JSON -> paginate via the
// REAL, unmodified project pagination code -> write to disk.
//
// Deliberately generic: every input (sourceId, externalId, output
// path, format) is a CLI argument. Nothing below branches on a
// specific workId, title, author, or provider slug -- the exact same
// code path runs for any current or future EPUB-format
// ExternalBookRecord from any currently-wired source
// (gutenberg/standard-ebooks). Adding a real ingestion for a
// different book, or a different provider whose records also land in
// the RECORDS_BY_SOURCE map below, requires zero changes to this
// file.
//
// Does NOT touch the Reader, catalogStore, toReaderBook, Supabase, or
// GitHub. Writes exactly one JSON file, to the path given via --out.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ExternalBookRecord } from "../../src/catalog/ingestion/types";
import { GUTENBERG_RECORDS } from "../../src/catalog/sources/gutenbergRecords";
import { STANDARD_EBOOKS_RECORDS } from "../../src/catalog/sources/standardEbooksRecords";
import { normalizeBook, paginateText } from "../../src/features/reader/engine/pagination";
import { fetchAndValidate } from "./fetchAndValidate";
import { convertEpubToAnkiJson, type AnkiJsonDocument } from "./epubToAnkiJson";

// The only place a provider's record map is named -- adding a new
// already-wired source here (once its ExternalBookRecord map exists)
// is a one-line addition, not a new code path.
const RECORDS_BY_SOURCE: Record<string, Record<string, ExternalBookRecord>> = {
  "gutenberg": GUTENBERG_RECORDS,
  "standard-ebooks": STANDARD_EBOOKS_RECORDS
};

interface CliArgs {
  sourceId: string;
  externalId: string;
  out: string;
  format?: string;
}

function parseArgs(argv: string[]): CliArgs {

  const flags: Record<string, string> = {};
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg);
    if (match) flags[match[1]] = match[2];
  }

  if (!flags.sourceId || !flags.externalId || !flags.out) {
    throw new Error(
      "usage: ingestBook.ts --sourceId=<gutenberg|standard-ebooks> --externalId=<record key> --out=<path> [--format=epub|plaintext]\n" +
      "example: ingestBook.ts --sourceId=standard-ebooks --externalId=virginia-woolf/to-the-lighthouse --out=public/books-normalized/to-the-lighthouse.json"
    );
  }

  return { sourceId: flags.sourceId, externalId: flags.externalId, out: flags.out, format: flags.format };

}

async function main(): Promise<void> {

  const args = parseArgs(process.argv.slice(2));

  const records = RECORDS_BY_SOURCE[args.sourceId];
  if (!records) {
    throw new Error(`ingestBook: unknown sourceId "${args.sourceId}" -- known sources: ${Object.keys(RECORDS_BY_SOURCE).join(", ")}`);
  }

  const record = records[args.externalId];
  if (!record) {
    throw new Error(`ingestBook: no ExternalBookRecord for sourceId="${args.sourceId}" externalId="${args.externalId}"`);
  }

  const fileEntry = args.format
    ? record.formats.find(entry => entry.format === args.format)
    : (record.formats.find(entry => entry.format === "epub") ?? record.formats[0]);

  if (!fileEntry) {
    throw new Error(`ingestBook: record "${args.externalId}" has no file matching format "${args.format ?? "epub"}"`);
  }

  if (fileEntry.format !== "epub" && fileEntry.format !== "plaintext") {
    throw new Error(`ingestBook: format "${fileEntry.format}" is not yet supported by this runner (only epub/plaintext)`);
  }

  console.log(`ingestBook: sourceId=${args.sourceId} externalId=${args.externalId} format=${fileEntry.format}`);
  console.log(`ingestBook: fetching ${fileEntry.url}`);

  const fetched = await fetchAndValidate(fileEntry.url, fileEntry.format);

  console.log(
    `ingestBook: fetch OK -- status=${fetched.status} finalUrl=${fetched.finalUrl} ` +
    `redirected=${fetched.redirected} contentType=${fetched.contentType ?? "n/a"} bytes=${fetched.bytes.length}`
  );

  let document: AnkiJsonDocument;

  if (fileEntry.format === "epub") {

    const conversion = convertEpubToAnkiJson(fetched.bytes);
    document = conversion.document;

    console.log(
      `ingestBook: epub parsed -- ${conversion.diagnostics.spineItemCount} spine items, ` +
      `${conversion.diagnostics.loadFailures} failed to load, ` +
      `${conversion.diagnostics.emptyAfterExtraction} empty after extraction, ` +
      `${conversion.document.chapters.length} chapters kept, tocSource=${conversion.diagnostics.tocSource}`
    );

  } else {

    const text = fetched.bytes.toString("utf-8");
    if (!text.trim().length) {
      throw new Error("ingestBook: plaintext source is empty after decoding");
    }
    document = { formatVersion: 1, hasRealChapters: false, chapters: [{ title: null, text }] };

  }

  if (document.chapters.length === 0) {
    throw new Error("ingestBook: resulting document has zero chapters -- refusing to write an empty asset");
  }

  const totalTextLength = document.chapters.reduce((sum, chapter) => sum + chapter.text.trim().length, 0);
  if (totalTextLength === 0) {
    throw new Error("ingestBook: resulting document's chapters are all empty -- refusing to write an empty asset");
  }

  // Reuse the REAL, unmodified project pagination code (not a
  // reimplementation) to prove the asset this script is about to
  // write would genuinely paginate to pages > 0 the same way
  // ankiJsonLoader will process it later, inside the actual Reader.
  let totalPages = 0;
  for (const chapter of document.chapters) {
    const normalized = normalizeBook(chapter.text);
    totalPages += paginateText(normalized).length;
  }

  if (totalPages === 0) {
    throw new Error("ingestBook: resulting document paginates to zero pages via the real project pagination pipeline -- refusing to write");
  }

  mkdirSync(dirname(args.out), { recursive: true });
  const json = JSON.stringify(document, null, 2);
  writeFileSync(args.out, json, "utf-8");

  console.log(
    `ingestBook: wrote ${args.out} -- chapters=${document.chapters.length} ` +
    `totalTextChars=${totalTextLength} pages=${totalPages} fileBytes=${Buffer.byteLength(json, "utf-8")}`
  );

}

main().catch(error => {
  console.error("ingestBook: FAILED --", error instanceof Error ? error.message : error);
  const runtimeProcess = (globalThis as { process?: { exit(code: number): void } }).process;
  runtimeProcess?.exit(1);
});
