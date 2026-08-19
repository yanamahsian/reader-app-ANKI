import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { BATCH50_EFFECTIVE_CANDIDATES } from "./batch50EffectiveConfig";
import { fetchAndValidate } from "./fetchAndValidate";
import { convertEpubToAnkiJson } from "./epubToAnkiJson";
import { normalizeBook, paginateText } from "../../src/features/reader/engine/pagination";

interface GutenbergCatalogRow {
  id: string;
  title: string;
  language: string;
  authors: string;
  type: string;
}

const CATALOG_URL = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";

function norm(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function titleCoverage(expected: string, actual: string): number {
  const stop = new Set(["the", "a", "an", "and", "or", "of", "in", "to", "by", "at"]);
  const wanted = norm(expected).split(" ").filter(token => token && !stop.has(token));
  const have = new Set(norm(actual).split(" ").filter(Boolean));
  if (!wanted.length) return 0;
  return wanted.filter(token => have.has(token)).length / wanted.length;
}

function authorMatches(authors: string, authorQuery: string): boolean {
  const surname = norm(authorQuery).split(" ").filter(Boolean).at(-1);
  return Boolean(surname && norm(authors).split(" ").includes(surname));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ""; }
    else if (ch === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

async function loadCatalog(): Promise<GutenbergCatalogRow[]> {
  const response = await fetch(CATALOG_URL);
  if (!response.ok) throw new Error(`Project Gutenberg catalog fetch failed HTTP ${response.status}`);
  const rows = parseCsv(await response.text());
  const header = rows.shift();
  if (!header) throw new Error("Project Gutenberg catalog is empty");
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  for (const required of ["Text#", "Type", "Title", "Language", "Authors"]) if (index[required] === undefined) throw new Error(`Project Gutenberg catalog missing ${required}`);
  return rows.map(row => ({ id: row[index["Text#"]] ?? "", type: row[index["Type"]] ?? "", title: row[index["Title"]] ?? "", language: row[index["Language"]] ?? "", authors: row[index["Authors"]] ?? "" }));
}

function rankedCandidates(spec: (typeof BATCH50_EFFECTIVE_CANDIDATES)[number], catalog: GutenbergCatalogRow[]): GutenbergCatalogRow[] {
  return catalog
    .filter(row => row.type === "Text" && row.language.split(";").map(x => x.trim()).includes("en") && authorMatches(row.authors, spec.authorQuery))
    .map(row => ({ row, coverage: Math.max(...spec.aliases.map(alias => titleCoverage(alias, row.title))) }))
    .filter(item => item.coverage >= 0.6)
    .sort((a, b) => b.coverage - a.coverage || Number(a.row.id) - Number(b.row.id))
    .map(item => item.row);
}

async function main(): Promise<void> {
  console.log(`Loading official Project Gutenberg catalog: ${CATALOG_URL}`);
  const catalog = await loadCatalog();
  console.log(`Catalog rows: ${catalog.length}`);

  const outDir = "public/books-normalized";
  mkdirSync(outDir, { recursive: true });
  const ids: Record<string, string> = {};
  const usedIds = new Set<string>();
  let totalChars = 0;
  let totalPages = 0;

  for (const spec of BATCH50_EFFECTIVE_CANDIDATES) {
    console.log(`=== ${spec.workId} ===`);
    const ranked = rankedCandidates(spec, catalog).filter(row => !usedIds.has(row.id));
    if (!ranked.length) throw new Error(`${spec.workId}: no safe match in official Gutenberg catalog`);

    let selected: GutenbergCatalogRow | null = null;
    let fetched: Awaited<ReturnType<typeof fetchAndValidate>> | null = null;
    let lastError = "";
    for (const row of ranked.slice(0, 8)) {
      const url = `https://www.gutenberg.org/ebooks/${row.id}.epub.noimages`;
      try {
        fetched = await fetchAndValidate(url, "epub");
        selected = row;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (!selected || !fetched) throw new Error(`${spec.workId}: catalog matches found but no valid EPUB could be fetched. Last error: ${lastError}`);

    console.log(`matched Gutenberg #${selected.id}: ${selected.title} / ${selected.authors}`);
    const conversion = convertEpubToAnkiJson(fetched.bytes);
    const document = conversion.document;
    if (!document.chapters.length) throw new Error(`${spec.workId}: zero chapters after conversion`);
    const chars = document.chapters.reduce((sum, chapter) => sum + chapter.text.trim().length, 0);
    let pages = 0;
    for (const chapter of document.chapters) pages += paginateText(normalizeBook(chapter.text)).length;
    if (!chars || !pages) throw new Error(`${spec.workId}: normalized document has no readable text/pages`);

    const json = JSON.stringify(document, null, 2);
    writeFileSync(`${outDir}/${spec.workId}.json`, json, "utf-8");
    ids[spec.workId] = selected.id;
    usedIds.add(selected.id);
    totalChars += chars;
    totalPages += pages;
    console.log(`${spec.workId}: PASS gutenberg=${selected.id} chapters=${document.chapters.length} chars=${chars} pages=${pages} bytes=${Buffer.byteLength(json)}`);
  }

  if (Object.keys(ids).length !== BATCH50_EFFECTIVE_CANDIDATES.length) throw new Error(`batch incomplete: ${Object.keys(ids).length}/${BATCH50_EFFECTIVE_CANDIDATES.length}`);
  const generated = `// Generated by scripts/ingest/ingestBatch50.ts from Project Gutenberg's official CSV catalog. Do not hand-edit.\nexport const BATCH50_GUTENBERG_IDS: Record<string, string> = ${JSON.stringify(ids, null, 2)};\n`;
  const idsPath = "src/catalog/batch50SourceIds.ts";
  mkdirSync(dirname(idsPath), { recursive: true });
  writeFileSync(idsPath, generated, "utf-8");
  console.log(`BATCH50 PASS books=${BATCH50_EFFECTIVE_CANDIDATES.length} totalChars=${totalChars} totalPages=${totalPages}`);
}

main().catch(error => { console.error("ingestBatch50: FAILED --", error instanceof Error ? error.message : error); process.exit(1); });
