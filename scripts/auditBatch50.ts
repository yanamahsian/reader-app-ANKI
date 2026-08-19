import { existsSync, readFileSync } from "node:fs";
import { BATCH50_CANDIDATES } from "./ingest/batch50Config";
import { BATCH50_GUTENBERG_IDS } from "../src/catalog/batch50SourceIds";
import { BATCH50_BOOKS, BATCH50_AUTHORS } from "../src/catalog/batch50";
import { assessGermanRights } from "../src/catalog/assessGermanRights";
import { pickPreferredEditionAndFile } from "../src/catalog/toReaderBook";
import { normalizeBook, paginateText } from "../src/features/reader/engine/pagination";

let failures = 0;
const assessed = assessGermanRights(BATCH50_BOOKS, BATCH50_AUTHORS);

for (const candidate of BATCH50_CANDIDATES) {
  const id = BATCH50_GUTENBERG_IDS[candidate.workId];
  const path = `public/books-normalized/${candidate.workId}.json`;
  if (!id) { console.error(`${candidate.workId}: missing generated Gutenberg id`); failures++; continue; }
  if (!existsSync(path)) { console.error(`${candidate.workId}: missing normalized asset`); failures++; continue; }

  const data = JSON.parse(readFileSync(path, "utf-8")) as { formatVersion?: number; chapters?: Array<{ title: string | null; text: string }> };
  if (data.formatVersion !== 1 || !Array.isArray(data.chapters) || !data.chapters.length) { console.error(`${candidate.workId}: invalid normalized JSON`); failures++; continue; }
  const chars = data.chapters.reduce((sum, chapter) => sum + chapter.text.trim().length, 0);
  const pages = data.chapters.reduce((sum, chapter) => sum + paginateText(normalizeBook(chapter.text)).length, 0);
  if (!chars || !pages) { console.error(`${candidate.workId}: empty text/pages`); failures++; continue; }

  const work = assessed.find(book => book.id === candidate.workId);
  const resolved = work ? pickPreferredEditionAndFile(work, "en", "DE") : null;
  if (!resolved || resolved.file.format !== "anki-json" || !resolved.file.url.includes(`/books-normalized/${candidate.workId}.json`)) {
    console.error(`${candidate.workId}: DE resolver does not select Omnia normalized asset`); failures++; continue;
  }
  console.log(`${candidate.workId}: PASS gutenberg=${id} chapters=${data.chapters.length} chars=${chars} pages=${pages}`);
}

if (failures) { console.error(`BATCH50 AUDIT FAIL failures=${failures}`); process.exit(1); }
console.log(`BATCH50 AUDIT PASS books=${BATCH50_CANDIDATES.length}`);
