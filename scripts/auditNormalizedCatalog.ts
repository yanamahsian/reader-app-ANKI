import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getBooks } from "../src/catalog/catalogStore";
import { pickPreferredEditionAndFile } from "../src/catalog/toReaderBook";

const directory = join(process.cwd(), "public", "books-normalized");

if (!existsSync(directory)) {
  throw new Error(`normalized asset directory does not exist: ${directory}`);
}

const files = readdirSync(directory)
  .filter(name => name.endsWith(".json"))
  .sort();

if (files.length === 0) {
  throw new Error("no normalized book assets were generated");
}

const booksById = new Map(getBooks().map(book => [book.id, book]));
let totalCharacters = 0;

for (const file of files) {
  const workId = file.slice(0, -".json".length);
  const work = booksById.get(workId);

  if (!work) {
    throw new Error(`${file}: no catalog Work exists for normalized asset`);
  }

  const raw = readFileSync(join(directory, file), "utf8");
  const document = JSON.parse(raw) as {
    formatVersion?: unknown;
    chapters?: Array<{ text?: unknown }>;
  };

  if (document.formatVersion !== 1) {
    throw new Error(`${file}: unsupported formatVersion`);
  }

  if (!Array.isArray(document.chapters) || document.chapters.length === 0) {
    throw new Error(`${file}: no chapters`);
  }

  const characters = document.chapters.reduce((sum, chapter) => {
    return sum + (typeof chapter.text === "string" ? chapter.text.trim().length : 0);
  }, 0);

  if (characters === 0) {
    throw new Error(`${file}: all chapter text is empty`);
  }

  const resolved = pickPreferredEditionAndFile(work, undefined, "DE");
  if (!resolved) {
    throw new Error(`${file}: Work does not resolve for DE despite having a normalized asset`);
  }

  if (resolved.file.format !== "anki-json") {
    throw new Error(`${file}: resolver chose ${resolved.file.format} instead of anki-json`);
  }

  if (!resolved.file.url.includes(`/books-normalized/${file}`)) {
    throw new Error(`${file}: resolver did not choose the Omnia-owned normalized asset (${resolved.file.url})`);
  }

  totalCharacters += characters;
  console.log(`${workId}: PASS chapters=${document.chapters.length} chars=${characters}`);
}

console.log(`Normalized catalog audit PASS: files=${files.length} totalChars=${totalCharacters}`);
