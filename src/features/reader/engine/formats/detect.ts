import type { Book } from "../types";
import type { FormatLoader } from "./types";
import { ankiJsonLoader } from "./ankiJson";
import { epubLoader } from "./epub";
import { pdfLoader } from "./pdf";
import { plaintextLoader } from "./plaintext";

// Order matters: most specific loaders first, plaintextLoader is the
// always-true fallback and must stay last. AN.KI normalized JSON stays first;
// EPUB/PDF are explicit binary formats and must be detected before plaintext.
const loaders: FormatLoader[] = [ankiJsonLoader, epubLoader, pdfLoader, plaintextLoader];

export function detectLoader(book: Book): FormatLoader {
  return loaders.find(loader => loader.canHandle(book)) ?? plaintextLoader;
}
