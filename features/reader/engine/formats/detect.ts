import type { Book } from "../types";
import type { FormatLoader } from "./types";
import { ankiJsonLoader } from "./ankiJson";
import { epubLoader } from "./epub";
import { plaintextLoader } from "./plaintext";

// Order matters: most specific loaders first, plaintextLoader is the
// always-true fallback and must stay last. ankiJsonLoader goes first
// — AN.KI's own normalized content (Phase 9) is explicit
// (book.format === "anki-json"), never ambiguous with the others.
const loaders: FormatLoader[] = [ankiJsonLoader, epubLoader, plaintextLoader];

export function detectLoader(book: Book): FormatLoader {
  return loaders.find(loader => loader.canHandle(book)) ?? plaintextLoader;
}
