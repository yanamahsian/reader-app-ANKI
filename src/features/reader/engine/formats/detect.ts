import type { Book } from "../types";
import type { FormatLoader } from "./types";
import { epubLoader } from "./epub";
import { plaintextLoader } from "./plaintext";

// Order matters: more specific loaders first, plaintextLoader is the
// always-true fallback and must stay last.
const loaders: FormatLoader[] = [epubLoader, plaintextLoader];

export function detectLoader(book: Book): FormatLoader {
  return loaders.find(loader => loader.canHandle(book)) ?? plaintextLoader;
}
