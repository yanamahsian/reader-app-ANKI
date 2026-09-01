import type { Book } from "../types";
import type { FormatLoader, LoadedDocument } from "./types";
import { ankiJsonLoader } from "./ankiJson";
import { epubLoader } from "./epub";
import { fb2Loader } from "./fb2";
import { pdfLoader } from "./pdf";
import { plaintextLoader } from "./plaintext";

// Order matters: most specific loaders first, plaintextLoader is the
// always-true fallback and must stay last. AN.KI normalized JSON stays first;
// EPUB/FB2/PDF are explicit formats and must be detected before plaintext.
const loaders: FormatLoader[] = [ankiJsonLoader, epubLoader, fb2Loader, pdfLoader, plaintextLoader];

// ReaderEngine and ReaderView tools (Search/Reveal) need the same parsed book.
// Keep exactly ONE in-flight/resolved document cache for the active/last book:
// this removes the duplicate fetch + full EPUB/PDF/FB2 parse without allowing
// a long reading session to accumulate every previously opened document.
let cachedDocumentKey: string | null = null;
let cachedDocumentPromise: Promise<LoadedDocument> | null = null;

function documentKey(book: Book): string {
  return `${book.id}\u0000${book.format}\u0000${book.url}`;
}

function underlyingLoader(book: Book): FormatLoader {
  return loaders.find(loader => loader.canHandle(book)) ?? plaintextLoader;
}

export function detectLoader(book: Book): FormatLoader {
  const loader = underlyingLoader(book);

  return {
    canHandle(candidate: Book): boolean {
      return loader.canHandle(candidate);
    },

    load(candidate: Book): Promise<LoadedDocument> {
      const key = documentKey(candidate);

      if (cachedDocumentKey === key && cachedDocumentPromise) {
        return cachedDocumentPromise;
      }

      const promise = loader.load(candidate).catch(error => {
        if (cachedDocumentKey === key && cachedDocumentPromise === promise) {
          cachedDocumentKey = null;
          cachedDocumentPromise = null;
        }
        throw error;
      });

      cachedDocumentKey = key;
      cachedDocumentPromise = promise;
      return promise;
    }
  };
}
